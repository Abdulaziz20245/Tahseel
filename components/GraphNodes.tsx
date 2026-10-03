"use client";

// Custom React Flow nodes for the network graph (Claude.md §4.1). Each node's centre is its JSON
// position (nodeOrigin [0.5, 0.5]); one invisible handle sits at the centre for all edges.

import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import type { GraphCompany } from "@/lib/graphModel";
import { sar, sarCompact } from "@/lib/format";

export const COMPANY_SIZE = 52;
export const HUB_SIZE = 84;

const centreHandle = { left: "50%", top: "50%", width: 1, height: 1, minWidth: 0, minHeight: 0, opacity: 0, border: 0, transform: "translate(-50%, -50%)" } as const;

function CentreHandles() {
  return (
    <>
      <Handle type="target" position={Position.Top} style={centreHandle} isConnectable={false} />
      <Handle type="source" position={Position.Top} style={centreHandle} isConnectable={false} />
    </>
  );
}

export type CompanyNodeData = { company: GraphCompany; selected: boolean; dimmed: boolean };
export type CompanyNodeType = Node<CompanyNodeData, "company">;

function ringClass(net: number): { ring: string; label: string } {
  if (net > 0.5) return { ring: "border-good", label: "Net receiver" };
  if (net < -0.5) return { ring: "border-primary", label: "Net payer" };
  return { ring: "border-line", label: "Net zero" };
}

export function CompanyNode({ data }: NodeProps<CompanyNodeType>) {
  const c = data.company;
  const ring = ringClass(c.net);
  const badges = [
    c.badges.changed && { text: "Changed", cls: "border-warn text-warn" },
    c.badges.escalation && { text: "Escalation", cls: "border-bad text-bad" },
    c.badges.cap && { text: "Cap", cls: "border-muted text-muted" },
    c.badges.timeLimit && { text: "Time limit", cls: "border-muted text-muted" },
  ].filter(Boolean) as { text: string; cls: string }[];

  return (
    <div
      className={`group relative ${data.dimmed ? "opacity-40" : ""}`}
      style={{ width: COMPANY_SIZE, height: COMPANY_SIZE }}
      aria-label={`${c.name}. ${ring.label}. Incoming ${sar(c.incoming)}, outgoing ${sar(c.outgoing)}, net ${sar(c.net)}.`}
    >
      <CentreHandles />
      {badges.length > 0 && (
        <div className="absolute bottom-full left-1/2 mb-1 flex -translate-x-1/2 gap-1 whitespace-nowrap">
          {badges.map((b) => (
            <span key={b.text} className={`rounded-md border bg-canvas px-1 text-xs leading-4 font-semibold ${b.cls}`}>
              {b.text}
            </span>
          ))}
        </div>
      )}
      <div
        className={`num flex h-full w-full items-center justify-center rounded-full border-[3px] bg-canvas text-[13px] font-semibold text-ink ${ring.ring} ${
          data.selected ? "outline-2 outline-offset-2 outline-accent" : ""
        }`}
      >
        {c.id}
      </div>
      <div className="absolute top-full left-1/2 mt-1 -translate-x-1/2 rounded-md bg-canvas/85 px-1 text-center whitespace-nowrap">
        <p className="text-[15px] leading-tight font-semibold text-ink">{c.shortName}</p>
        <p className="text-xs leading-tight text-muted">{c.city}</p>
      </div>
      {/* Hover card: figures come from lib/metrics via the graph model. */}
      <div className="pointer-events-none absolute top-0 left-full z-10 ml-3 hidden w-60 rounded-md border border-line bg-canvas p-3 text-left shadow-sm group-hover:block">
        <p className="text-sm font-semibold text-ink">{c.name}</p>
        <p className="text-xs text-muted">
          {c.sector} · {c.city} · {ring.label}
        </p>
        <dl className="num mt-2 grid grid-cols-[auto_1fr] gap-x-3 text-xs">
          <dt className="text-muted">Incoming</dt>
          <dd className="text-right">{sar(c.incoming)}</dd>
          <dt className="text-muted">Outgoing</dt>
          <dd className="text-right">{sar(c.outgoing)}</dd>
          <dt className="text-muted">Net</dt>
          <dd className="text-right font-semibold">{sar(c.net)}</dd>
        </dl>
      </div>
    </div>
  );
}

export type HubNodeData = { view: "before" | "after"; roundDate: string | null; payIn: number; dimmed: boolean };
export type HubNodeType = Node<HubNodeData, "hub">;

export function HubNode({ data }: NodeProps<HubNodeType>) {
  return (
    <div className={`relative ${data.dimmed ? "opacity-40" : ""}`} style={{ width: HUB_SIZE, height: HUB_SIZE }}>
      <CentreHandles />
      <div className="flex h-full w-full flex-col items-center justify-center rounded-full border-2 border-accent bg-canvas text-center">
        <p className="text-[13px] leading-tight font-semibold text-accent">Tahseel Hub</p>
        {data.view === "after" && data.roundDate && <p className="num mt-0.5 text-xs leading-tight text-ink">{sarCompact(data.payIn)} in</p>}
      </div>
    </div>
  );
}

export const nodeTypes = { company: CompanyNode, hub: HubNode };
