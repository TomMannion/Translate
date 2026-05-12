import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CircleDollarSign,
  FileText,
  Info,
  Languages,
  Loader2,
  RefreshCw,
  Sparkles,
  Wand2,
} from "lucide-react";
import Button from "../components/Button.tsx";
import { api } from "../api.ts";
import type {
  ModelRates,
  UsageReport,
  UsageTotals,
} from "../../../shared/types.ts";

function usd(n: number): string {
  if (n === 0) return "$0.00";
  if (n < 0.01) return `<$0.01`;
  return `$${n.toFixed(2)}`;
}

function num(n: number): string {
  return n.toLocaleString();
}

const KIND_LABEL: Record<string, string> = {
  context: "Context extraction",
  translate: "Translation",
  retranslate: "Re-translation",
  test: "Key tests",
};

function KindIcon({ kind }: { kind: string }) {
  switch (kind) {
    case "context":
      return <Sparkles className="h-3.5 w-3.5 text-indigo-600" />;
    case "translate":
      return <Languages className="h-3.5 w-3.5 text-amber-700" />;
    case "retranslate":
      return <Wand2 className="h-3.5 w-3.5 text-purple-600" />;
    case "test":
      return <Info className="h-3.5 w-3.5 text-stone-500" />;
    default:
      return <FileText className="h-3.5 w-3.5 text-stone-500" />;
  }
}

export default function Usage() {
  const [report, setReport] = useState<UsageReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => {
    setError(null);
    setBusy(true);
    api
      .getUsage()
      .then(setReport)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setBusy(false));
  };

  useEffect(() => load(), []);

  if (error)
    return (
      <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
        Failed to load usage: {error}
      </div>
    );
  if (!report)
    return (
      <div className="flex items-center gap-2 text-stone-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </div>
    );

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Usage</h1>
          <p className="text-sm text-stone-500 mt-0.5">
            Token spend across every Gemini call.
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={load}
          disabled={busy}
          icon={
            busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )
          }
        >
          Refresh
        </Button>
      </header>

      <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
        <span>
          Costs are <strong>estimated</strong> from token counts using the
          rates below. Real billing lives in Google Cloud Console. Edit{" "}
          <code className="font-mono text-xs">data/pricing.json</code> to
          override rates per model — no restart needed.
        </span>
      </div>

      <TotalsCard totals={report.totals} lastAt={report.last_call_at} />

      <BreakdownTable
        title="By episode"
        rows={report.by_episode.map((r) => ({
          key: r.episode_id ?? "(unattributed)",
          label: r.episode_title ?? "(unattributed)",
          totals: r,
        }))}
      />

      <BreakdownTable
        title="By call kind"
        rows={report.by_kind.map((r) => ({
          key: r.kind,
          label: KIND_LABEL[r.kind] ?? r.kind,
          icon: <KindIcon kind={r.kind} />,
          totals: r,
        }))}
      />

      <BreakdownTable
        title="By model"
        rows={report.by_model.map((r) => ({
          key: r.model,
          label: r.model,
          mono: true,
          totals: r,
        }))}
      />

      <PricingCard
        rates={report.pricing.default}
        models={report.pricing.models}
      />
    </div>
  );
}

function TotalsCard({
  totals,
  lastAt,
}: {
  totals: UsageTotals;
  lastAt: number | null;
}) {
  return (
    <section className="rounded-lg border border-stone-200 bg-white p-5 grid grid-cols-2 md:grid-cols-5 gap-4">
      <div className="md:col-span-2">
        <div className="inline-flex items-center gap-2 text-xs uppercase tracking-wide text-stone-500">
          <CircleDollarSign className="h-3.5 w-3.5" /> Total estimated
        </div>
        <div className="mt-1 text-3xl font-semibold tracking-tight">
          ~{usd(totals.cost_usd)}
        </div>
      </div>
      <Stat label="Calls" value={num(totals.calls)} />
      <Stat label="Input tokens" value={num(totals.input_tokens)} />
      <Stat label="Output tokens" value={num(totals.output_tokens)} />
      <Stat
        label="Thinking tokens"
        value={num(totals.thinking_tokens)}
      />
      <Stat
        label="Last call"
        value={lastAt ? new Date(lastAt).toLocaleString() : "—"}
      />
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-stone-500">
        {label}
      </div>
      <div className="mt-1 font-semibold">{value}</div>
    </div>
  );
}

function BreakdownTable({
  title,
  rows,
}: {
  title: string;
  rows: Array<{
    key: string;
    label: string;
    icon?: React.ReactNode;
    mono?: boolean;
    totals: UsageTotals;
  }>;
}) {
  if (rows.length === 0) {
    return (
      <section>
        <h2 className="text-sm font-semibold text-stone-600 uppercase tracking-wide mb-2">
          {title}
        </h2>
        <p className="rounded-lg border border-stone-200 bg-white px-3 py-3 text-sm text-stone-500">
          No data yet.
        </p>
      </section>
    );
  }
  return (
    <section>
      <h2 className="text-sm font-semibold text-stone-600 uppercase tracking-wide mb-2">
        {title}
      </h2>
      <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-stone-50 text-xs uppercase tracking-wide text-stone-500">
            <tr>
              <th className="text-left px-3 py-2 font-medium">Name</th>
              <th className="text-right px-3 py-2 font-medium">Calls</th>
              <th className="text-right px-3 py-2 font-medium">Input</th>
              <th className="text-right px-3 py-2 font-medium">Output</th>
              <th className="text-right px-3 py-2 font-medium">Thinking</th>
              <th className="text-right px-3 py-2 font-medium">Est. cost</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {rows.map((r) => (
              <tr key={r.key} className="hover:bg-stone-50/60 transition-colors">
                <td className="px-3 py-2">
                  <span className="inline-flex items-center gap-2">
                    {r.icon}
                    <span className={r.mono ? "font-mono text-xs" : ""}>
                      {r.label}
                    </span>
                  </span>
                </td>
                <td className="text-right px-3 py-2 font-mono tabular-nums">
                  {num(r.totals.calls)}
                </td>
                <td className="text-right px-3 py-2 font-mono tabular-nums">
                  {num(r.totals.input_tokens)}
                </td>
                <td className="text-right px-3 py-2 font-mono tabular-nums">
                  {num(r.totals.output_tokens)}
                </td>
                <td className="text-right px-3 py-2 font-mono tabular-nums">
                  {num(r.totals.thinking_tokens)}
                </td>
                <td className="text-right px-3 py-2 font-mono tabular-nums">
                  ~{usd(r.totals.cost_usd)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function PricingCard({
  rates,
  models,
}: {
  rates: ModelRates;
  models: Record<string, ModelRates>;
}) {
  const entries = Object.entries(models).sort(([a], [b]) => a.localeCompare(b));
  return (
    <section>
      <h2 className="text-sm font-semibold text-stone-600 uppercase tracking-wide mb-2">
        Current rates (USD per million tokens)
      </h2>
      <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-stone-50 text-xs uppercase tracking-wide text-stone-500">
            <tr>
              <th className="text-left px-3 py-2 font-medium">Model</th>
              <th className="text-right px-3 py-2 font-medium">Input</th>
              <th className="text-right px-3 py-2 font-medium">Output</th>
              <th className="text-right px-3 py-2 font-medium">Thinking</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            <RateRow name="(default fallback)" r={rates} muted />
            {entries.map(([name, r]) => (
              <RateRow key={name} name={name} r={r} />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function RateRow({
  name,
  r,
  muted = false,
}: {
  name: string;
  r: ModelRates;
  muted?: boolean;
}) {
  const cls = muted ? "text-stone-500" : "";
  return (
    <tr className="hover:bg-stone-50/60 transition-colors">
      <td className={`px-3 py-2 font-mono text-xs ${cls}`}>{name}</td>
      <td className={`text-right px-3 py-2 font-mono tabular-nums ${cls}`}>
        ${r.input_per_mtok.toFixed(2)}
      </td>
      <td className={`text-right px-3 py-2 font-mono tabular-nums ${cls}`}>
        ${r.output_per_mtok.toFixed(2)}
      </td>
      <td className={`text-right px-3 py-2 font-mono tabular-nums ${cls}`}>
        ${r.thinking_per_mtok.toFixed(2)}
      </td>
    </tr>
  );
}
