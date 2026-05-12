import {
  CheckCircle2,
  CircleDot,
  FileText,
  Languages,
  ListChecks,
  Save,
  Sparkles,
} from "lucide-react";
import type { ReactNode } from "react";
import type { DerivedStatus } from "../../../shared/types.ts";

type StepKey =
  | "metadata"
  | "context"
  | "translate"
  | "review"
  | "export";

interface Step {
  key: StepKey;
  label: string;
  anchor: string;
  icon: ReactNode;
}

const STEPS: Step[] = [
  {
    key: "metadata",
    label: "Metadata",
    anchor: "metadata",
    icon: <FileText className="h-4 w-4" />,
  },
  {
    key: "context",
    label: "Context",
    anchor: "context",
    icon: <Sparkles className="h-4 w-4" />,
  },
  {
    key: "translate",
    label: "Translate",
    anchor: "translate",
    icon: <Languages className="h-4 w-4" />,
  },
  {
    key: "review",
    label: "Review",
    anchor: "lines",
    icon: <ListChecks className="h-4 w-4" />,
  },
  {
    key: "export",
    label: "Export",
    anchor: "translate",
    icon: <Save className="h-4 w-4" />,
  },
];

function stateForStep(step: StepKey, status: DerivedStatus): "done" | "current" | "todo" {
  const order: DerivedStatus[] = [
    "draft",
    "metadata_ready",
    "context_extracted",
    "translated",
    "reviewed",
    "exported",
  ];
  const currentIdx = order.indexOf(status);

  switch (step) {
    case "metadata":
      // Done as soon as the episode passes 'draft' (i.e. video_type set).
      return currentIdx >= 1 ? "done" : "current";
    case "context":
      if (currentIdx >= 2) return "done";
      return currentIdx === 1 ? "current" : "todo";
    case "translate":
      if (currentIdx >= 3) return "done";
      return currentIdx === 2 ? "current" : "todo";
    case "review":
      if (currentIdx >= 4) return "done";
      return currentIdx === 3 ? "current" : "todo";
    case "export":
      if (currentIdx >= 5) return "done";
      return currentIdx === 4 ? "current" : "todo";
  }
}

export default function WorkflowStepper({
  status,
}: {
  status: DerivedStatus;
}) {
  return (
    <nav
      className="rounded-lg border border-stone-200 bg-white px-2 py-2"
      aria-label="Episode workflow"
    >
      <ol className="flex items-center justify-between gap-1">
        {STEPS.map((step, i) => {
          const state = stateForStep(step.key, status);
          const connectorState = stateForStep(
            STEPS[i + 1]?.key ?? step.key,
            status,
          );
          return (
            <li key={step.key} className="flex items-center flex-1">
              <a
                href={`#${step.anchor}`}
                className={`group flex flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors ${
                  state === "current"
                    ? "bg-amber-50 text-amber-900"
                    : state === "done"
                      ? "text-stone-700 hover:bg-stone-50"
                      : "text-stone-400 hover:bg-stone-50"
                }`}
              >
                <StepIcon state={state} icon={step.icon} />
                <span className="font-medium">{step.label}</span>
              </a>
              {i < STEPS.length - 1 && (
                <span
                  aria-hidden
                  className={`mx-1 h-px flex-1 ${
                    connectorState === "done"
                      ? "bg-amber-300"
                      : "bg-stone-200"
                  }`}
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function StepIcon({
  state,
  icon,
}: {
  state: "done" | "current" | "todo";
  icon: ReactNode;
}) {
  if (state === "done") {
    return <CheckCircle2 className="h-5 w-5 text-emerald-600" />;
  }
  if (state === "current") {
    return <CircleDot className="h-5 w-5 text-amber-700" />;
  }
  return <span className="text-stone-400">{icon}</span>;
}
