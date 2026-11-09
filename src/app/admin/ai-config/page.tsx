import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { getAiConfigAdminView, getAiConfigHistoryView } from "@/lib/ai-config";
import { PROVIDER_PRESETS } from "@/lib/ai-provider-presets";
import AiConfigForm from "@/components/admin/AiConfigForm";

export const dynamic = "force-dynamic";

export default async function AiConfigPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/unauthorized");

  const [view, history] = await Promise.all([
    getAiConfigAdminView(),
    getAiConfigHistoryView(),
  ]);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-zinc-900">Konfigurasi AI</h1>
        <p className="text-zinc-600">
          Atur provider, model, dan API key untuk analisis laporan. API key
          dienkripsi sebelum disimpan.
        </p>
      </div>

      <AiConfigForm initial={view} presets={PROVIDER_PRESETS} />

      <div className="mt-10 bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-zinc-200">
          <h2 className="text-lg font-bold text-zinc-900">
            Riwayat Konfigurasi
          </h2>
          <p className="text-sm text-zinc-500">
            Menyimpan jejak perubahan tanpa menyimpan API key asli.
          </p>
        </div>

        {history.length === 0 ? (
          <p className="p-6 text-zinc-500">Belum ada riwayat perubahan.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-zinc-500">
                <tr>
                  <th className="text-left font-medium px-4 py-3">Waktu</th>
                  <th className="text-left font-medium px-4 py-3">Teks</th>
                  <th className="text-left font-medium px-4 py-3">Vision</th>
                  <th className="text-left font-medium px-4 py-3">
                    Sumber Key
                  </th>
                  <th className="text-left font-medium px-4 py-3">
                    Diubah oleh
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {history.map((h) => (
                  <tr key={h.id} className="hover:bg-zinc-50">
                    <td className="px-4 py-3 text-zinc-500 whitespace-nowrap">
                      {new Date(h.createdAt).toLocaleString("id-ID")}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-zinc-900">
                        {h.textProvider}
                      </p>
                      <p className="text-xs text-zinc-500">{h.textModel}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-zinc-900">
                        {h.visionProvider}
                      </p>
                      <p className="text-xs text-zinc-500">{h.visionModel}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-zinc-600">
                        Teks: {h.textKeySource}
                        {h.textKeyFingerprint
                          ? ` (${h.textKeyFingerprint})`
                          : ""}
                      </p>
                      <p className="text-xs text-zinc-500">
                        Vision: {h.visionKeySource}
                        {h.visionKeyFingerprint
                          ? ` (${h.visionKeyFingerprint})`
                          : ""}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-zinc-600">
                      {h.updatedByEmail || "-"}
                      {h.isActive && (
                        <span className="ml-2 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 border border-green-200">
                          Aktif
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
