import prisma from "@/lib/prisma";
import {
  decryptSecret,
  encryptSecret,
  hashSecret,
  maskSecret,
} from "@/lib/ai-config-crypto";

export type KeySource = "db" | "env" | "none";

export type ResolvedTarget = {
  provider: string;
  baseUrl: string;
  model: string;
  apiKey: string;
  keySource: KeySource;
};

export type ResolvedAiConfig = {
  text: ResolvedTarget;
  vision: ResolvedTarget;
};

export type AiConfigUpdateInput = {
  textProvider: string;
  textBaseUrl: string;
  textModel: string;
  textApiKey?: string;
  clearTextKey?: boolean;
  visionProvider: string;
  visionBaseUrl: string;
  visionModel: string;
  visionApiKey?: string;
  clearVisionKey?: boolean;
};

function envFallback() {
  return {
    provider: process.env.NVIDIA_PROVIDER || "nvidia",
    baseUrl:
      process.env.NVIDIA_BASE_URL || "https://integrate.api.nvidia.com/v1",
    textModel:
      process.env.NVIDIA_TEXT_MODEL || "nvidia/nemotron-3.5-lightning-30b-a3b",
    visionModel:
      process.env.NVIDIA_VISION_MODEL ||
      "nvidia/nemotron-3.5-super-vl-120b-a12b",
    apiKey: process.env.NVIDIA_API_KEY || "",
  };
}

function cleanBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

function resolveEffectiveKey(
  dbPlain: string,
  envKey: string,
  explicitKey: string | undefined,
  clear: boolean
): { plain: string; source: KeySource } {
  if (explicitKey) return { plain: explicitKey, source: "db" };
  if (!clear && dbPlain) return { plain: dbPlain, source: "db" };
  if (envKey) return { plain: envKey, source: "env" };
  return { plain: "", source: "none" };
}

export async function getAiConfigRow() {
  return prisma.aiconfiguration.findUnique({ where: { id: "default" } });
}

export async function getResolvedAiConfig(): Promise<ResolvedAiConfig> {
  const row = await getAiConfigRow();
  const env = envFallback();

  const textDbKey = decryptSecret(row?.textApiKey) || decryptSecret(row?.apiKey);
  const visionDbKey = decryptSecret(row?.visionApiKey);

  const textKey = textDbKey || env.apiKey;
  const textSource: KeySource = textDbKey
    ? "db"
    : env.apiKey
      ? "env"
      : "none";

  const visionKey = visionDbKey || textDbKey || env.apiKey;
  const visionSource: KeySource = visionDbKey
    ? "db"
    : textDbKey
      ? "db"
      : env.apiKey
        ? "env"
        : "none";

  return {
    text: {
      provider: row?.textProvider || row?.provider || env.provider,
      baseUrl: cleanBaseUrl(
        row?.textBaseUrl || row?.baseUrl || env.baseUrl
      ),
      model: row?.textModel || env.textModel,
      apiKey: textKey,
      keySource: textSource,
    },
    vision: {
      provider: row?.visionProvider || row?.provider || env.provider,
      baseUrl: cleanBaseUrl(
        row?.visionBaseUrl || row?.baseUrl || env.baseUrl
      ),
      model: row?.visionModel || env.visionModel,
      apiKey: visionKey,
      keySource: visionSource,
    },
  };
}

export async function getAiConfigAdminView() {
  const [row, resolved, env] = await Promise.all([
    getAiConfigRow(),
    getResolvedAiConfig(),
    Promise.resolve(envFallback()),
  ]);

  return {
    text: {
      provider: resolved.text.provider,
      baseUrl: resolved.text.baseUrl,
      model: resolved.text.model,
      hasKey: Boolean(resolved.text.apiKey),
      keySource: resolved.text.keySource,
      maskedKey: maskSecret(resolved.text.apiKey),
    },
    vision: {
      provider: resolved.vision.provider,
      baseUrl: resolved.vision.baseUrl,
      model: resolved.vision.model,
      hasKey: Boolean(resolved.vision.apiKey),
      keySource: resolved.vision.keySource,
      maskedKey: maskSecret(resolved.vision.apiKey),
    },
    updatedAt: row?.updatedAt ? row.updatedAt.toISOString() : null,
    updatedByEmail: row?.updatedByEmail ?? null,
    envHasKey: Boolean(env.apiKey),
  };
}

export async function getAiConfigHistoryView(limit = 15) {
  const rows = await prisma.aiconfigurationhistory.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return rows.map((r) => ({
    id: r.id,
    textProvider: r.textProvider,
    textBaseUrl: r.textBaseUrl,
    textModel: r.textModel,
    textKeySource: r.textKeySource,
    textKeyFingerprint: r.textKeyHash ? r.textKeyHash.slice(0, 12) : null,
    visionProvider: r.visionProvider,
    visionBaseUrl: r.visionBaseUrl,
    visionModel: r.visionModel,
    visionKeySource: r.visionKeySource,
    visionKeyFingerprint: r.visionKeyHash
      ? r.visionKeyHash.slice(0, 12)
      : null,
    updatedByEmail: r.updatedByEmail,
    isActive: r.isActive,
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function updateAiConfig(
  input: AiConfigUpdateInput,
  updatedByEmail: string
) {
  const existing = await getAiConfigRow();
  const env = envFallback();

  const textKeyInput = input.textApiKey?.trim() || "";
  const visionKeyInput = input.visionApiKey?.trim() || "";

  const existingTextEnc = existing?.textApiKey ?? existing?.apiKey ?? null;
  const existingVisionEnc = existing?.visionApiKey ?? null;

  const textEncrypted =
    input.clearTextKey === true
      ? null
      : textKeyInput
        ? encryptSecret(textKeyInput)
        : existingTextEnc;

  const visionEncrypted =
    input.clearVisionKey === true
      ? null
      : visionKeyInput
        ? encryptSecret(visionKeyInput)
        : existingVisionEnc;

  const textEffective = resolveEffectiveKey(
    decryptSecret(existingTextEnc),
    env.apiKey,
    textKeyInput || undefined,
    input.clearTextKey === true
  );

  const visionEffective = resolveEffectiveKey(
    decryptSecret(existingVisionEnc) || decryptSecret(existingTextEnc),
    env.apiKey,
    visionKeyInput || undefined,
    input.clearVisionKey === true
  );

  const textProvider = input.textProvider.trim() || env.provider;
  const textBaseUrl = cleanBaseUrl(input.textBaseUrl) || env.baseUrl;
  const textModel = input.textModel.trim() || env.textModel;
  const visionProvider = input.visionProvider.trim() || env.provider;
  const visionBaseUrl = cleanBaseUrl(input.visionBaseUrl) || env.baseUrl;
  const visionModel = input.visionModel.trim() || env.visionModel;

  await prisma.$transaction(async (tx) => {
    await tx.aiconfigurationhistory.updateMany({
      data: { isActive: false },
    });

    await tx.aiconfigurationhistory.create({
      data: {
        textProvider,
        textBaseUrl,
        textModel,
        textKeyHash: hashSecret(textEffective.plain),
        textKeySource: textEffective.source,
        visionProvider,
        visionBaseUrl,
        visionModel,
        visionKeyHash: hashSecret(visionEffective.plain),
        visionKeySource: visionEffective.source,
        provider: textProvider,
        baseUrl: textBaseUrl,
        keyHash: hashSecret(textEffective.plain),
        keySource: textEffective.source,
        updatedByEmail,
        isActive: true,
      },
    });

    await tx.aiconfiguration.upsert({
      where: { id: "default" },
      update: {
        textProvider,
        textBaseUrl,
        textModel,
        textApiKey: textEncrypted,
        visionProvider,
        visionBaseUrl,
        visionModel,
        visionApiKey: visionEncrypted,
        provider: textProvider,
        baseUrl: textBaseUrl,
        apiKey: textEncrypted,
        updatedByEmail,
      },
      create: {
        id: "default",
        textProvider,
        textBaseUrl,
        textModel,
        textApiKey: textEncrypted,
        visionProvider,
        visionBaseUrl,
        visionModel,
        visionApiKey: visionEncrypted,
        provider: textProvider,
        baseUrl: textBaseUrl,
        apiKey: textEncrypted,
        updatedByEmail,
      },
    });
  });

  return getAiConfigAdminView();
}
