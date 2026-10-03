"use client";

// Legend and round chips (Claude.md §4.3). Always visible along the bottom of the canvas; the graph
// is fitted above it, so it never covers a node.

import type { GraphRound } from "@/lib/graphModel";
import type { GraphView } from "./GraphCanvas";
import { date, sarCompact } from "@/lib/format";

export const LEGEND_HEIGHT_PX = 88;

interface Props {
  view: GraphView;
  rounds: GraphRound[];
  selected: string | null;
  onSelect: (date: string) => void;
}

function Line({ colour, dash, width = 2, opacity = 1 }: { colour: string; dash?: string; width?: number; opacity?: number }) {
  return (
    <svg width="24" height="8" aria-hidden className="shrink-0">
      <line x1="1" y1="4" x2="23" y2="4" stroke={colour} strokeWidth={width} strokeDasharray={dash} strokeLinecap={dash ? "round" : "butt"} opacity={opacity} />
    </svg>
  );
}

function Item({ children }: { children: React.ReactNode }) {
  return <li className="flex items-center gap-1.5 whitespace-nowrap">{children}</li>;
}

function Ring({ cls }: { cls: string }) {
  return <span aria-hidden className={`inline-block h-3 w-3 shrink-0 rounded-full border-[3px] bg-canvas ${cls}`} />;
}

export default function RoundLegend({ view, rounds, selected, onSelect }: Props) {
  return (
    <div
      className="absolute right-0 bottom-0 left-0 z-10 flex flex-col justify-center gap-2 border-t border-line bg-canvas/95 px-3 py-2 text-xs text-ink"
      style={{ minHeight: LEGEND_HEIGHT_PX }}
    >
      {view === "after" && (
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Choose a settlement round">
          <span className="mr-1 font-semibold">Settlement rounds</span>
          {rounds.length === 0 && <span className="text-muted">none at this step</span>}
          {rounds.map((r) => {
            const active = r.date === selected;
            return (
              <button
                key={r.date}
                type="button"
                onClick={() => onSelect(r.date)}
                aria-pressed={active}
                className={`num flex items-center gap-1.5 rounded-md border px-2 py-0.5 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none ${
                  active ? "border-accent bg-subtle font-semibold outline-1 outline-accent" : "border-line hover:border-muted"
                }`}
                title={`${r.hubEdges.length} transfers, ${sarCompact(r.payIn)} through the hub`}
              >
                <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: r.colour }} />
                {date(r.date)}
                <span className="font-normal text-muted">
                  · {r.hubEdges.length} transfer{r.hubEdges.length === 1 ? "" : "s"}
                </span>
              </button>
            );
          })}
        </div>
      )}
      <ul className="flex flex-wrap items-center gap-x-4 gap-y-1">
        {view === "after" ? (
          <>
            <Item>
              <Line colour="#12355B" width={2.5} /> Hub transfer, selected round
            </Item>
            <Item>
              <Line colour="#12355B" opacity={0.45} /> Invoice cleared in that round
            </Item>
            <Item>
              <Line colour="#12355B" dash="6 6" /> Split across rounds
            </Item>
          </>
        ) : (
          <Item>
            <Line colour="#475569" width={3} /> Payer → payee; thicker = more SAR; one transfer per invoice
          </Item>
        )}
        <Item>
          <Line colour="#B42318" dash="1 5" /> On hold or escalated
        </Item>
        <Item>
          <Ring cls="border-good" /> Net receiver
        </Item>
        <Item>
          <Ring cls="border-primary" /> Net payer
        </Item>
        <Item>
          <Ring cls="border-line" /> Zero
        </Item>
      </ul>
    </div>
  );
}
