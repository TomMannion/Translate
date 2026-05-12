import { useEffect, useState } from "react";
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

export default function Usage() {
  const [report, setReport] = useState<UsageReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setError(null);
    api
      .getUsage()
      .then(setReport)
      .catch((e) =>
        setError(e instanceof Error ? e.message : String(e)),
      );
  };

  useEffect(() => load(), []);

  if (error)
    return (
      <p className="text-red-700 text-sm">Failed to load usage: {error}</p>
    );
  if (!report) return <p>Loading…</p>;

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Usage</h1>
        <button
          onClick={load}
          className="rounded border border-stone-300 px-3 py-1 text-sm"
        >
          Refresh
        </button>
      </header>

      <p className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
        Costs are <strong>estimated</strong> from token counts using the rates
        below. Real billing lives in Google Cloud Console; treat these numbers
        as directional. Edit{" "}
        <code className="font-mono">data/pricing.json</code> to override rates
        per model — no restart needed.
      </p>

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
        title="By kind"
        rows={report.by_kind.map((r) => ({
          key: r.kind,
          label: r.kind,
          totals: r,
        }))}
      />

      <BreakdownTable
        title="By model"
        rows={report.by_model.map((r) => ({
          key: r.model,
          label: r.model,
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
    <section className="rounded border border-stone-200 bg-white p-4 grid grid-cols-2 md:grid-cols-5 gap-3">
      <Stat label="Total est. cost" value={`~${usd(totals.cost_usd)}`} big />
      <Stat label="Calls" value={num(totals.calls)} />
      <Stat label="Input tokens" value={num(totals.input_tokens)} />
      <Stat label="Output tokens" value={num(totals.output_tokens)} />
      <Stat label="Thinking tokens" value={num(totals.thinking_tokens)} />
      <Stat
        label="Last call"
        value={lastAt ? new Date(lastAt).toLocaleString() : "—"}
      />
    </section>
  );
}

function Stat({
  label,
  value,
  big = false,
}: {
  label: string;
  value: string;
  big?: boolean;
}) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-stone-500">
        {label}
      </div>
      <div className={`mt-0.5 font-semibold ${big ? "text-2xl" : "text-base"}`}>
        {value}
      </div>
    </div>
  );
}

function BreakdownTable({
  title,
  rows,
}: {
  title: string;
  rows: Array<{ key: string; label: string; totals: UsageTotals }>;
}) {
  if (rows.length === 0) {
    return (
      <section>
        <h2 className="text-sm font-semibold text-stone-600 uppercase tracking-wide mb-2">
          {title}
        </h2>
        <p className="rounded border border-stone-200 bg-white px-3 py-2 text-sm text-stone-500">
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
      <div className="overflow-x-auto rounded border border-stone-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-stone-50 text-xs uppercase tracking-wide text-stone-500">
            <tr>
              <th className="text-left px-3 py-2">Name</th>
              <th className="text-right px-3 py-2">Calls</th>
              <th className="text-right px-3 py-2">Input</th>
              <th className="text-right px-3 py-2">Output</th>
              <th className="text-right px-3 py-2">Thinking</th>
              <th className="text-right px-3 py-2">Est. cost</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {rows.map((r) => (
              <tr key={r.key}>
                <td className="px-3 py-2">{r.label}</td>
                <td className="text-right px-3 py-2 font-mono">
                  {num(r.totals.calls)}
                </td>
                <td className="text-right px-3 py-2 font-mono">
                  {num(r.totals.input_tokens)}
                </td>
                <td className="text-right px-3 py-2 font-mono">
                  {num(r.totals.output_tokens)}
                </td>
                <td className="text-right px-3 py-2 font-mono">
                  {num(r.totals.thinking_tokens)}
                </td>
                <td className="text-right px-3 py-2 font-mono">
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
  const entries = Object.entries(models).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  return (
    <section>
      <h2 className="text-sm font-semibold text-stone-600 uppercase tracking-wide mb-2">
        Current rates (USD per million tokens)
      </h2>
      <div className="overflow-x-auto rounded border border-stone-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-stone-50 text-xs uppercase tracking-wide text-stone-500">
            <tr>
              <th className="text-left px-3 py-2">Model</th>
              <th className="text-right px-3 py-2">Input</th>
              <th className="text-right px-3 py-2">Output</th>
              <th className="text-right px-3 py-2">Thinking</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            <RateRow name="(default fallback)" r={rates} />
            {entries.map(([name, r]) => (
              <RateRow key={name} name={name} r={r} />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function RateRow({ name, r }: { name: string; r: ModelRates }) {
  return (
    <tr>
      <td className="px-3 py-2 font-mono text-xs">{name}</td>
      <td className="text-right px-3 py-2 font-mono">
        ${r.input_per_mtok.toFixed(2)}
      </td>
      <td className="text-right px-3 py-2 font-mono">
        ${r.output_per_mtok.toFixed(2)}
      </td>
      <td className="text-right px-3 py-2 font-mono">
        ${r.thinking_per_mtok.toFixed(2)}
      </td>
    </tr>
  );
}
