import {
  Prisma,
  report_aiCategory,
  report_aiPriority,
  report_priority,
} from "@prisma/client";
import prisma from "@/lib/prisma";
import {
  AiNotConfiguredError,
  aiChatText,
  aiChatWithImage,
  extractJson,
} from "@/lib/ai-client";
import { getResolvedAiConfig } from "@/lib/ai-config";
import type { ReportCategory, ReportPriority } from "@/lib/report-utils";

const SYSTEM_PROMPT =
  "Anda adalah asisten triase laporan kerusakan fasilitas publik di Indonesia. " +
  "Tugas Anda menganalisis laporan masyarakat dan foto kondisi, lalu menentukan " +
  "kategori, prioritas, tingkat keyakinan, dan relevansi. Jawab HANYA dengan satu " +
  "objek JSON valid tanpa markdown, tanpa penjelasan tambahan.";

const CATEGORY_HINTS = [
  "JALAN",
  "LAMPU_JALAN",
  "SALURAN_AIR",
  "JEMBATAN",
  "FASILITAS_KESEHATAN",
  "LAINNYA",
];

const PRIORITY_HINTS = ["RENDAH", "SEDANG", "TINGGI", "DARURAT"];

const CATEGORY_ALIASES: Record<string, ReportCategory> = {
  JALAN: "JALAN",
  ROAD: "JALAN",
  STREET: "JALAN",
  LAMPU_JALAN: "LAMPU_JALAN",
  LAMPU: "LAMPU_JALAN",
  STREET_LIGHT: "LAMPU_JALAN",
  STREETLIGHT: "LAMPU_JALAN",
  SALURAN_AIR: "SALURAN_AIR",
  DRAINASE: "SALURAN_AIR",
  DRAINAGE: "SALURAN_AIR",
  SELOKAN: "SALURAN_AIR",
  JEMBATAN: "JEMBATAN",
  BRIDGE: "JEMBATAN",
  FASILITAS_KESEHATAN: "FASILITAS_KESEHATAN",
  KESEHATAN: "FASILITAS_KESEHATAN",
  HEALTH_FACILITY: "FASILITAS_KESEHATAN",
  LAINNYA: "LAINNYA",
  OTHER: "LAINNYA",
};

const PRIORITY_ALIASES: Record<string, ReportPriority> = {
  RENDAH: "RENDAH",
  LOW: "RENDAH",
  SEDANG: "SEDANG",
  MEDIUM: "SEDANG",
  NORMAL: "SEDANG",
  TINGGI: "TINGGI",
  HIGH: "TINGGI",
  DARURAT: "DARURAT",
  URGENT: "DARURAT",
  CRITICAL: "DARURAT",
  KRITIS: "DARURAT",
};

const SEVERITIES = new Set(["RINGAN", "SEDANG", "BERAT", "KRITIS"]);

export type AiAnalysis = {
  category: ReportCategory;
  priority: ReportPriority;
  confidence: number;
  reason: string;
  isRelevant: boolean;
  possibleDamage: string;
  severity: string;
  matchesTitle: boolean;
};

export type DuplicateMatch = {
  id: string;
  reportNumber: string;
  title: string;
  score: number;
  textScore: number;
  distanceMeters: number | null;
  reason: string;
};

export type AnalyzeReportResult = {
  ok: boolean;
  skipped?: boolean;
  error?: string | null;
  usedVision?: boolean;
  analysis?: AiAnalysis | null;
  duplicate?: DuplicateMatch | null;
};

function normalizeEnum(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function toBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "ya", "yes", "1"].includes(normalized)) return true;
    if (["false", "tidak", "no", "0"].includes(normalized)) return false;
  }
  return fallback;
}

function toText(value: unknown, maxLength = 2000): string {
  return String(value ?? "")
    .trim()
    .slice(0, maxLength);
}

function toConfidence(value: unknown): number {
  let confidence = Number(value);
  if (!Number.isFinite(confidence)) return 0.5;
  if (confidence > 1 && confidence <= 100) confidence = confidence / 100;
  return Math.min(1, Math.max(0, confidence));
}

function buildPrompt(report: {
  title: string;
  description: string;
  category: string;
  priority: string;
  address: string | null;
  hasImage: boolean;
}): string {
  return [
    "Analisis laporan kerusakan fasilitas berikut.",
    "",
    `Judul: ${report.title}`,
    `Deskripsi: ${report.description}`,
    `Kategori yang dipilih pelapor: ${report.category}`,
    `Prioritas yang dipilih pelapor: ${report.priority}`,
    `Alamat: ${report.address || "(tidak diisi)"}`,
    report.hasImage
      ? "Tersedia foto kondisi. Periksa apakah foto relevan dengan judul laporan."
      : "Tidak ada foto kondisi.",
    "",
    "Kembalikan JSON dengan skema:",
    `{"category":"${CATEGORY_HINTS.join("|")}",` +
      `"priority":"${PRIORITY_HINTS.join("|")}",` +
      `"confidence":0.0-1.0,` +
      `"reason":"alasan singkat",` +
      `"isRelevant":true,` +
      `"possibleDamage":"jenis kerusakan yang terlihat",` +
      `"severity":"RINGAN|SEDANG|BERAT|KRITIS",` +
      `"matchesTitle":true}`,
    "",
    "Aturan:",
    "- isRelevant=false hanya jika foto/laporan jelas tidak berkaitan dengan fasilitas publik atau jelas bukan kerusakan.",
    "- matchesTitle=false jika foto tidak cocok dengan judul/deskripsi.",
    "- DARURAT hanya untuk kondisi yang mengancam keselamatan jiwa.",
    "- Jangan mengubah fakta; nilai hanya berdasarkan isi laporan dan foto.",
  ].join("\n");
}

function normalizeAnalysis(
  parsed: Record<string, unknown>,
  fallbackCategory: ReportCategory,
  fallbackPriority: ReportPriority
): AiAnalysis {
  const category =
    CATEGORY_ALIASES[normalizeEnum(parsed.category)] ?? fallbackCategory;
  const priority =
    PRIORITY_ALIASES[normalizeEnum(parsed.priority)] ?? fallbackPriority;
  const severity = normalizeEnum(parsed.severity);

  return {
    category,
    priority,
    confidence: toConfidence(parsed.confidence),
    reason: toText(parsed.reason) || "Tidak ada alasan yang diberikan AI.",
    isRelevant: toBoolean(parsed.isRelevant, true),
    possibleDamage: toText(parsed.possibleDamage),
    severity: SEVERITIES.has(severity) ? severity : "SEDANG",
    matchesTitle: toBoolean(parsed.matchesTitle, true),
  };
}

const STOPWORDS = new Set([
  "yang",
  "dan",
  "di",
  "ke",
  "dari",
  "untuk",
  "pada",
  "dengan",
  "adalah",
  "itu",
  "ini",
  "ada",
  "tidak",
  "sudah",
  "belum",
  "saya",
  "kami",
  "kita",
  "nya",
  "the",
  "and",
  "of",
  "in",
  "on",
  "at",
  "is",
  "are",
  "was",
  "were",
  "a",
  "an",
]);

function tokenize(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2 && !STOPWORDS.has(word));
  return new Set(words);
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const word of a) {
    if (b.has(word)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function distanceMeters(
  lat1: number | null,
  lon1: number | null,
  lat2: number | null,
  lon2: number | null
): number | null {
  if (lat1 === null || lon1 === null || lat2 === null || lon2 === null) {
    return null;
  }
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export async function findDuplicateReport(report: {
  id: string;
  title: string;
  description: string;
  category: string;
  latitude: number | null;
  longitude: number | null;
  reporterId: string;
}): Promise<DuplicateMatch | null> {
  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const candidates = await prisma.report.findMany({
    where: {
      id: { not: report.id },
      createdAt: { gte: since },
      status: { not: "DITOLAK" },
    },
    select: {
      id: true,
      reportNumber: true,
      title: true,
      description: true,
      category: true,
      latitude: true,
      longitude: true,
      reporterId: true,
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  const newTokens = tokenize(`${report.title} ${report.description}`);
  let best: DuplicateMatch | null = null;

  for (const candidate of candidates) {
    const textScore = jaccard(
      newTokens,
      tokenize(`${candidate.title} ${candidate.description}`)
    );

    const distance = distanceMeters(
      report.latitude,
      report.longitude,
      candidate.latitude,
      candidate.longitude
    );

    let score = textScore;
    if (candidate.category === report.category) score += 0.1;
    if (distance !== null) {
      if (distance <= 150) score += 0.2;
      else if (distance > 3000) score -= 0.15;
    }
    if (candidate.reporterId === report.reporterId) score += 0.05;
    score = Math.min(1, Math.max(0, score));

    if (textScore < 0.35 || score < 0.55) continue;
    if (best && score <= best.score) continue;

    const distanceText =
      distance !== null ? `, berjarak ${Math.round(distance)} m` : "";
    best = {
      id: candidate.id,
      reportNumber: candidate.reportNumber,
      title: candidate.title,
      score,
      textScore,
      distanceMeters: distance,
      reason: `Kemiripan ${Math.round(textScore * 100)}% dengan laporan ${
        candidate.reportNumber
      } ("${candidate.title}")${distanceText}.`,
    };
  }

  return best;
}

/**
 * Menjalankan analisis AI untuk satu laporan, menyimpan saran kategori,
 * prioritas, analisis foto, dan deteksi duplikat. Tidak mengubah kategori,
 * prioritas, atau status utama laporan (hanya field ai*).
 */
export async function analyzeReportById(
  reportId: string
): Promise<AnalyzeReportResult> {
  const report = await prisma.report.findUnique({
    where: { id: reportId },
    include: {
      reportimage: {
        where: { type: "BEFORE" },
        orderBy: { createdAt: "asc" },
        take: 1,
      },
    },
  });

  if (!report) {
    throw new Error("Laporan tidak ditemukan");
  }

  const [config, duplicate] = await Promise.all([
    getResolvedAiConfig(),
    findDuplicateReport({
      id: report.id,
      title: report.title,
      description: report.description,
      category: report.category,
      latitude: report.latitude,
      longitude: report.longitude,
      reporterId: report.reporterId,
    }),
  ]);

  const image = report.reportimage[0] ?? null;
  const canUseVision = Boolean(image && config.vision.apiKey);
  const canUseText = Boolean(config.text.apiKey);

  if (!canUseVision && !canUseText) {
    return {
      ok: false,
      skipped: true,
      error:
        "AI belum dikonfigurasi. Atur API key di Admin > Konfigurasi AI terlebih dahulu.",
      duplicate,
    };
  }

  const prompt = buildPrompt({
    title: report.title,
    description: report.description,
    category: report.category,
    priority: report.priority,
    address: report.address,
    hasImage: Boolean(image),
  });

  let analysis: AiAnalysis | null = null;
  let aiError: string | null = null;
  const usedVision = canUseVision;

  try {
    const raw = canUseVision
      ? await aiChatWithImage(
          SYSTEM_PROMPT,
          prompt,
          image!.imageUrl,
          { temperature: 0.1, maxTokens: 900 }
        )
      : await aiChatText(SYSTEM_PROMPT, prompt, {
          temperature: 0.1,
          maxTokens: 900,
        });

    const parsed = extractJson(raw);
    if (!parsed) {
      aiError = "Respons AI bukan JSON yang valid.";
    } else {
      analysis = normalizeAnalysis(
        parsed,
        report.category as ReportCategory,
        report.priority as ReportPriority
      );
    }
  } catch (error) {
    if (error instanceof AiNotConfiguredError) {
      return {
        ok: false,
        skipped: true,
        error: error.message,
        duplicate,
      };
    }
    aiError = (error as Error).message || "Gagal menganalisis laporan.";
  }

  const now = new Date();
  const updateData: Prisma.reportUncheckedUpdateInput = {
    aiIsDuplicate: Boolean(duplicate),
    aiDuplicateOfId: duplicate?.id ?? null,
    aiDuplicateReason: duplicate?.reason ?? null,
  };

  if (analysis) {
    const autoRejected =
      analysis.isRelevant === false && analysis.confidence >= 0.7;
    updateData.aiAnalyzedAt = now;
    updateData.aiCategory = analysis.category as report_aiCategory;
    updateData.aiPriority = analysis.priority as report_aiPriority;
    updateData.aiConfidence = analysis.confidence;
    updateData.aiReason = analysis.reason;
    updateData.aiAutoRejected = autoRejected;
    updateData.aiRejectionReason = autoRejected
      ? `AI menilai laporan/foto tidak relevan: ${analysis.reason}`
      : null;

    // Sebelum diverifikasi, prioritas utama juga ditentukan otomatis oleh AI.
    if (report.status === "DIAJUKAN") {
      updateData.priority = analysis.priority as report_priority;
    }
  }

  await prisma.report.update({ where: { id: report.id }, data: updateData });

  if (analysis && image) {
    await prisma.reportimage.update({
      where: { id: image.id },
      data: {
        aiDescription: analysis.possibleDamage || analysis.reason,
        aiImageAnalyzedAt: now,
        aiImageConfidence: analysis.confidence,
        aiIsRelevant: analysis.isRelevant,
        aiPossibleDamage: analysis.possibleDamage,
        aiSeverity: analysis.severity,
        aiImageMatchTitle: analysis.matchesTitle,
        aiRejectionReason: analysis.isRelevant ? null : analysis.reason,
      },
    });
  }

  return {
    ok: Boolean(analysis),
    error: aiError,
    usedVision,
    analysis,
    duplicate,
  };
}
