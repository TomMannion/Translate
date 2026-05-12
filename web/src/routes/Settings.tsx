import { useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  FolderSearch,
  KeyRound,
  Loader2,
  Save,
  Settings as Cog,
  Sparkles,
  XCircle,
} from "lucide-react";
import Button from "../components/Button.tsx";
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
  const [strategy, setStrategy] = useState<FileConflictStrategy>("increment");
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

  if (!cfg) {
    return (
      <div className="flex items-center gap-2 text-stone-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading settings…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
          <p className="text-sm text-stone-500 mt-0.5">
            Local config. Stored as plaintext in{" "}
            <code className="font-mono text-xs">data/config.json</code>.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {savedAt && (
            <span className="text-xs text-emerald-700 inline-flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Saved {new Date(savedAt).toLocaleTimeString()}
            </span>
          )}
          <Button
            variant="primary"
            onClick={save}
            disabled={busy}
            icon={<Save className="h-4 w-4" />}
          >
            Save settings
          </Button>
        </div>
      </header>

      <Card
        title="API access"
        hint="Your Gemini API key. Stored plaintext on disk — see README for the threat model."
        icon={<KeyRound className="h-4 w-4" />}
      >
        <Field label="Gemini API key">
          <input
            type="password"
            className="w-full rounded-md border border-stone-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500"
            value={apiKey}
            placeholder={
              cfg.api_key_configured
                ? "•••••• (saved — type to replace)"
                : "Paste your Gemini API key"
            }
            onChange={(e) => setApiKey(e.target.value)}
          />
        </Field>
        <div className="flex items-center gap-3 flex-wrap">
          <Button
            variant="secondary"
            size="sm"
            onClick={onTestKey}
            disabled={busy || !cfg.api_key_configured}
            icon={
              busy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )
            }
          >
            Test saved key
          </Button>
          {testResult && (
            <span
              className={`inline-flex items-center gap-1 text-xs ${
                testResult.ok ? "text-emerald-700" : "text-red-700"
              }`}
            >
              {testResult.ok ? (
                <CheckCircle2 className="h-3.5 w-3.5" />
              ) : (
                <XCircle className="h-3.5 w-3.5" />
              )}
              {testResult.ok
                ? `OK — model: ${testResult.model}`
                : `Failed: ${testResult.error}`}
            </span>
          )}
        </div>
      </Card>

      <Card
        title="Library"
        hint="Where your Cantonese .srt files live. The server reads and writes here."
        icon={<FolderSearch className="h-4 w-4" />}
      >
        <Field label="Library folder (absolute path)">
          <input
            type="text"
            className="w-full rounded-md border border-stone-300 px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500"
            value={folder}
            onChange={(e) => setFolder(e.target.value)}
            placeholder="/Users/you/coffee-subs"
          />
        </Field>
        <div className="flex items-center gap-3 flex-wrap">
          <Button
            variant="secondary"
            size="sm"
            onClick={onProbe}
            disabled={busy || !folder}
            icon={
              busy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <FolderSearch className="h-3.5 w-3.5" />
              )
            }
          >
            Probe folder
          </Button>
          {probe && (
            <div className="text-xs">
              {probe.error ? (
                <span className="inline-flex items-center gap-1 text-red-700">
                  <XCircle className="h-3.5 w-3.5" />
                  {probe.error}
                </span>
              ) : (
                <span className="inline-flex items-center gap-3 text-stone-600">
                  <ProbeStat label="dir" value={probe.is_dir} />
                  <ProbeStat label=".srt" value={probe.has_srt_files} />
                  {probe.sample_files.length > 0 && (
                    <span>
                      sample:{" "}
                      <code className="font-mono text-[11px]">
                        {probe.sample_files.join(", ")}
                      </code>
                    </span>
                  )}
                </span>
              )}
            </div>
          )}
        </div>
        <Field label="File conflict strategy">
          <select
            className="w-full rounded-md border border-stone-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500"
            value={strategy}
            onChange={(e) =>
              setStrategy(e.target.value as FileConflictStrategy)
            }
          >
            <option value="increment">
              Increment — write {".eng.2.srt"} alongside the original
            </option>
            <option value="overwrite">Overwrite existing file</option>
            <option value="skip">Skip if file already exists</option>
          </select>
        </Field>
      </Card>

      <Card
        title="Translation tuning"
        hint="Controls for the Gemini calls. Changes affect future runs only."
        icon={<Cog className="h-4 w-4" />}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Default thinking level">
            <select
              className="w-full rounded-md border border-stone-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500"
              value={thinking}
              onChange={(e) => setThinking(e.target.value as ThinkingLevel)}
            >
              <option value="low">Low (faster, cheaper)</option>
              <option value="medium">Medium (default)</option>
              <option value="high">High (slower, more thorough)</option>
            </select>
          </Field>
          <Field label="Chunk size (lines)">
            <input
              type="number"
              min={10}
              max={200}
              className="w-full rounded-md border border-stone-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500"
              value={chunkSize}
              onChange={(e) => setChunkSize(Number(e.target.value) || 50)}
            />
          </Field>
          <div className="md:col-span-2">
            <Field label="Model alias">
              <input
                type="text"
                className="w-full rounded-md border border-stone-300 px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500"
                value={modelAlias}
                onChange={(e) => setModelAlias(e.target.value)}
              />
            </Field>
          </div>
        </div>
      </Card>
    </div>
  );
}

function Card({
  title,
  hint,
  icon,
  children,
}: {
  title: string;
  hint: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-stone-200 bg-white p-5 space-y-4">
      <header className="flex items-start gap-3">
        <div className="grid place-items-center w-8 h-8 rounded-md bg-stone-100 text-stone-600">
          {icon}
        </div>
        <div>
          <h2 className="text-base font-semibold">{title}</h2>
          <p className="text-xs text-stone-500 mt-0.5">{hint}</p>
        </div>
      </header>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-stone-600 mb-1 block">
        {label}
      </span>
      {children}
    </label>
  );
}

function ProbeStat({ label, value }: { label: string; value: boolean }) {
  return (
    <span className="inline-flex items-center gap-1">
      {value ? (
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
      ) : (
        <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
      )}
      {label}
    </span>
  );
}
