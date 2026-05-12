import type {
  AppConfig,
  Episode,
  EpisodeMetadata,
  FolderProbeResult,
  PublicAppConfig,
  ScanResult,
  SubtitleLine,
  TestKeyResult,
  UsageReport,
} from "../../shared/types.ts";

export type ExportVariant = "translation_only" | "bilingual";
export interface ExportResult {
  ok: true;
  output_srt_path: string;
  variant: ExportVariant;
  strategy: string;
  action: "wrote" | "overwrote" | "incremented" | "skipped";
  exported_at: number | null;
}

async function http<T>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${body}`);
  }
  return (await res.json()) as T;
}

export const api = {
  getConfig: () => http<PublicAppConfig>("/api/config"),
  saveConfig: (patch: Partial<AppConfig>) =>
    http<PublicAppConfig>("/api/config", {
      method: "PUT",
      body: JSON.stringify(patch),
    }),
  testKey: () =>
    http<TestKeyResult>("/api/config/test-key", { method: "POST" }),
  probeFolder: (folderPath: string) =>
    http<FolderProbeResult>("/api/config/probe-folder", {
      method: "POST",
      body: JSON.stringify({ path: folderPath }),
    }),

  listEpisodes: () => http<Episode[]>("/api/episodes"),
  getEpisode: (id: string) =>
    http<{
      episode: Episode;
      lines: SubtitleLine[];
      context: string | null;
    }>(`/api/episodes/${id}`),
  scanEpisodes: () =>
    http<ScanResult>("/api/episodes/scan", { method: "POST" }),
  updateEpisode: (
    id: string,
    patch: { title?: string; description?: string; metadata?: EpisodeMetadata },
  ) =>
    http<Episode>(`/api/episodes/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),
  deleteEpisode: (id: string) =>
    http<{ ok: true }>(`/api/episodes/${id}`, { method: "DELETE" }),

  cancelTranslate: (id: string) =>
    http<{ cancelled: boolean }>(
      `/api/episodes/${id}/translate/cancel`,
      { method: "POST" },
    ),
  exportEpisode: (
    id: string,
    variant: ExportVariant = "translation_only",
  ) =>
    http<ExportResult>(`/api/episodes/${id}/export`, {
      method: "POST",
      body: JSON.stringify({ variant }),
    }),

  extractContext: (id: string) =>
    http<{ ok: true; markdown_content: string }>(
      `/api/episodes/${id}/extract-context`,
      { method: "POST" },
    ),
  saveContext: (id: string, markdown_content: string) =>
    http<{ ok: true; markdown_content: string }>(
      `/api/episodes/${id}/context`,
      {
        method: "PUT",
        body: JSON.stringify({ markdown_content }),
      },
    ),

  updateLine: (id: string, translation: string) =>
    http<{ line: SubtitleLine }>(`/api/lines/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ translation }),
    }),
  setApproval: (id: string, approved: boolean) =>
    http<{ line: SubtitleLine }>(`/api/lines/${id}/approve`, {
      method: "POST",
      body: JSON.stringify({ approved }),
    }),
  undoLine: (id: string) =>
    http<{ line: SubtitleLine }>(`/api/lines/${id}/undo`, {
      method: "POST",
    }),
  retranslateLine: (id: string, hint: string) =>
    http<{ line: SubtitleLine }>(`/api/lines/${id}/retranslate`, {
      method: "POST",
      body: JSON.stringify({ hint }),
    }),
  bulkReplace: (
    episode_id: string,
    find: string,
    replace: string,
    options: { case_sensitive: boolean; whole_word: boolean },
  ) =>
    http<{ modified: number }>(`/api/lines/bulk-replace`, {
      method: "POST",
      body: JSON.stringify({ episode_id, find, replace, ...options }),
    }),

  getUsage: () => http<UsageReport>("/api/usage"),
};
