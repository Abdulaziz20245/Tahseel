"use client";

import { isOpen } from "@/lib/ledger";
import { useLedger, useScenario } from "@/lib/ScenarioProvider";

const STATUS_STYLE = {
  applied: { label: "Applied", className: "border-good text-good" },
  blocked: { label: "Blocked", className: "border-warn text-warn" },
  failed: { label: "Failed", className: "border-bad text-bad" },
} as const;

export default function EventCard() {
  const { data, stepIndex } = useScenario();
  const { ledger, eventResults, isStale } = useLedger();
  const event = stepIndex > 0 ? data.events[stepIndex - 1] : null;
  // Event results come from the solver's replay; while it works on this step, show the title only.
  const result = event && !isStale ? eventResults[stepIndex - 1] : null;

  return (
    <section aria-labelledby="event-card-heading" className="rounded-md border border-line bg-canvas p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 id="event-card-heading" className="text-sm font-semibold text-ink">
          What just happened
        </h2>
        {result && (
          <span className={`rounded-md border px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[result.status].className}`}>
            {STATUS_STYLE[result.status].label}
          </span>
        )}
      </div>
      <div aria-live="polite" className="mt-2 text-sm">
        {event ? (
          <>
            <p className="font-semibold text-ink">
              {event.id} · {event.title}
            </p>
            <p className="mt-1 text-muted">{result ? result.message : "Applying the event and re-planning settlement…"}</p>
          </>
        ) : (
          <p className="text-muted">
            Starting scenario — {ledger.invoices.filter(isOpen).length} open invoices between {data.companies.length}{" "}
            companies.
          </p>
        )}
      </div>
    </section>
  );
}
