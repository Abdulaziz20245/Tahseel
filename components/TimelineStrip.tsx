"use client";

import { dateAtStep, useScenario } from "@/lib/ScenarioProvider";
import { date } from "@/lib/format";

const STEP_0_TITLE = "Starting scenario";

export default function TimelineStrip() {
  const { data, stepIndex, stepCount, setStep, next, back, reset } = useScenario();
  const title = stepIndex === 0 ? STEP_0_TITLE : data.events[stepIndex - 1].title;

  const atStart = stepIndex === 0;
  const atEnd = stepIndex === stepCount;

  return (
    <section aria-label="Timeline" className="border-b border-line bg-subtle">
      <div className="mx-auto flex w-full max-w-[1920px] flex-wrap items-center gap-x-6 gap-y-2 px-6 py-2.5">
        <div className="flex min-w-0 flex-1 items-center gap-6">
          <div className="shrink-0">
            <p className="text-xs text-muted">Scenario date</p>
            <p className="num text-sm font-semibold text-ink">{date(dateAtStep(data, stepIndex))}</p>
          </div>
          <div className="shrink-0">
            <p className="text-xs text-muted">Step</p>
            <p className="num text-sm font-semibold text-ink">
              Event {stepIndex} of {stepCount}
            </p>
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted">{atStart ? "Status" : `Event E${String(stepIndex).padStart(2, "0")}`}</p>
            <p aria-live="polite" className="truncate text-sm text-ink" title={title}>
              {title}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <label className="sr-only" htmlFor="event-jump">
            Jump to event
          </label>
          <select
            id="event-jump"
            value={stepIndex}
            onChange={(e) => setStep(Number(e.target.value))}
            className="num max-w-56 rounded-md border border-line bg-canvas px-2 py-1.5 text-sm text-ink focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
          >
            <option value={0}>0 · {STEP_0_TITLE}</option>
            {data.events.map((e, i) => (
              <option key={e.id} value={i + 1}>
                {i + 1} · {e.title}
              </option>
            ))}
          </select>
          <StripButton onClick={back} disabledReason={atStart ? "Already at first event" : null}>
            Back
          </StripButton>
          <StripButton onClick={next} disabledReason={atEnd ? "Already at last event" : null} primary>
            Next event
          </StripButton>
          <StripButton onClick={reset} disabledReason={null}>
            Reset
          </StripButton>
        </div>
      </div>
    </section>
  );
}

// aria-disabled (not `disabled`) keeps the button focusable and its tooltip visible, so the reason is discoverable.
function StripButton({
  onClick,
  disabledReason,
  primary = false,
  children,
}: {
  onClick: () => void;
  disabledReason: string | null;
  primary?: boolean;
  children: React.ReactNode;
}) {
  const disabled = disabledReason !== null;
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      aria-disabled={disabled}
      title={disabledReason ?? undefined}
      className={`rounded-md border px-3 py-1.5 text-sm font-semibold focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:outline-none ${
        primary ? "border-primary bg-primary text-white" : "border-line bg-canvas text-ink hover:border-muted"
      } ${disabled ? "cursor-not-allowed opacity-40" : ""}`}
    >
      {children}
    </button>
  );
}
