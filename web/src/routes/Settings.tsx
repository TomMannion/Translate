import { useEffect, useState } from "react";
import { api } from "../api.ts";
import type {
  FileConflictStrategy,
  FolderProbeResult,
  PublicAppConfig,
  TestKeyResult,
  ThinkingLevel,
} from "../../../shared/types.ts";

export default function Settings() {
  const [cfg, setCfg] = useState<PublicAppConfig | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [folder, setFolder] = useState("");
  const [strategy, setStrategy] =
    useState<FileConflictStrategy>("increment");
  const [thinking, setThinking] = useState<ThinkingLevel>("medium");
  const [chunkSize, setChunkSize] = useState(50);
  const [modelAlias, setModelAlias] = useState("gemini-pro-latest");
  const [probe, setProbe] = useState<FolderProbeResult | null>(null);
  const [testResult, setTestResult] = useState<TestKeyResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    api.getConfig().then((c) => {
      setCfg(c);
      setFolder(c.library_folder_path);
      setStrategy(c.file_conflict_strategy);
      setThinking(c.default_thinking_level);
      setChunkSize(c.chunk_size_lines);
      setModelAlias(c.model_alias);
    });
  }, []);

  const save = async () => {
    setBusy(true);
    try {
      const next = await api.saveConfig({
        ...(apiKey ? { gemini_api_key: apiKey } : {}),
        library_folder_path: folder,
        file_conflict_strategy: strategy,
        default_thinking_level: thinking,
        chunk_size_lines: chunkSize,
        model_alias: modelAlias,
      });
      setCfg(next);
      setApiKey("");
      setSavedAt(Date.now());
    } finally {
      setBusy(false);
    }
  };

  const onTestKey = async () => {
    setBusy(true);
    setTestResult(null);
    try {
      setTestResult(await api.testKey());
    } finally {
      setBusy(false);
    }
  };

  const onProbe = async () => {
    setBusy(true);
    setProbe(null);
    try {
      setProbe(await api.probeFolder(folder));
    } finally {
      setBusy(false);
    }
  };

  if (!cfg) return <p>Loading…</p>;

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-semibold">Settings</h1>

      <section className="space-y-2">
        <label className="block">
          <span className="text-sm font-medium">Gemini API key</span>
          <input
            type="password"
            className="mt-1 w-full rounded border border-stone-300 px-3 py-2"
            value={apiKey}
            placeholder={
              cfg.api_key_configured
                ? "•••••• (saved — type to replace)"
                : "Paste your Gemini API key"
            }
            onChange={(e) => setApiKey(e.target.value)}
          />
        </label>
        <button
          onClick={onTestKey}
          disabled={busy || !cfg.api_key_configured}
          className="rounded bg-stone-900 text-white px-3 py-1.5 text-sm disabled:opacity-50"
        >
          Test saved key
        </button>
        {testResult && (
          <p
            className={
              testResult.ok ? "text-emerald-700 text-sm" : "text-red-700 text-sm"
            }
          >
            {testResult.ok
              ? `OK · model: ${testResult.model}`
              : `Failed: ${testResult.error}`}
          </p>
        )}
        <p className="text-xs text-stone-500">
          Stored as plaintext in <code>data/config.json</code>. See README threat
          model.
        </p>
      </section>

      <section className="space-y-2">
        <label className="block">
          <span className="text-sm font-medium">
            Library folder (absolute path)
          </span>
          <input
            type="text"
            className="mt-1 w-full rounded border border-stone-300 px-3 py-2 font-mono text-sm"
            value={folder}
            onChange={(e) => setFolder(e.target.value)}
            placeholder="/Users/you/coffee-subs"
          />
        </label>
        <button
          onClick={onProbe}
          disabled={busy || !folder}
          className="rounded bg-stone-900 text-white px-3 py-1.5 text-sm disabled:opacity-50"
        >
          Probe folder
        </button>
        {probe && (
          <div className="text-sm">
            {probe.error ? (
              <p className="text-red-700">{probe.error}</p>
            ) : (
              <ul className="text-stone-700 list-disc pl-5">
                <li>Exists: {probe.valid ? "yes" : "no"}</li>
                <li>Is directory: {probe.is_dir ? "yes" : "no"}</li>
                <li>
                  Contains .srt files: {probe.has_srt_files ? "yes" : "no"}
                </li>
                {probe.sample_files.length > 0 && (
                  <li>
                    Sample:{" "}
                    <span className="font-mono">
                      {probe.sample_files.join(", ")}
                    </span>
                  </li>
                )}
              </ul>
            )}
          </div>
        )}
      </section>

      <section className="grid grid-cols-2 gap-4">
        <label className="block">
          <span className="text-sm font-medium">File conflict strategy</span>
          <select
            className="mt-1 w-full rounded border border-stone-300 px-3 py-2"
            value={strategy}
            onChange={(e) =>
              setStrategy(e.target.value as FileConflictStrategy)
            }
          >
            <option value="increment">Increment (.eng.2.srt)</option>
            <option value="overwrite">Overwrite</option>
            <option value="skip">Skip</option>
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-medium">Default thinking level</span>
          <select
            className="mt-1 w-full rounded border border-stone-300 px-3 py-2"
            value={thinking}
            onChange={(e) => setThinking(e.target.value as ThinkingLevel)}
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-medium">Chunk size (lines)</span>
          <input
            type="number"
            min={10}
            max={200}
            className="mt-1 w-full rounded border border-stone-300 px-3 py-2"
            value={chunkSize}
            onChange={(e) => setChunkSize(Number(e.target.value) || 50)}
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium">Model alias</span>
          <input
            type="text"
            className="mt-1 w-full rounded border border-stone-300 px-3 py-2 font-mono text-sm"
            value={modelAlias}
            onChange={(e) => setModelAlias(e.target.value)}
          />
        </label>
      </section>

      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={busy}
          className="rounded bg-emerald-700 text-white px-4 py-2 disabled:opacity-50"
        >
          Save
        </button>
        {savedAt && (
          <span className="text-sm text-stone-500">
            Saved {new Date(savedAt).toLocaleTimeString()}
          </span>
        )}
      </div>
    </div>
  );
}
