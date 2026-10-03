"use client";

// Network graph (Claude.md §4): fixed layout from companies.json, hub at (0,0). Draws the graph model;
// all figures come from lib/graphModel.ts.

import "@xyflow/react/dist/style.css";
import { MarkerType, ReactFlow, type Edge, type FitViewOptions, type Node } from "@xyflow/react";
import { useMemo, useState } from "react";
import type { GraphModel, PairEdge } from "@/lib/graphModel";
import { date, sar, sarCompact } from "@/lib/format";
import { edgeTypes, type FlowEdgeData, type FlowEdgeType } from "./GraphEdges";
import { nodeTypes, type CompanyNodeType, type HubNodeType } from "./GraphNodes";
import { LEGEND_HEIGHT_PX } from "./RoundLegend";

export const HUB_ID = "HUB";
const MUTED = "#475569";
const BAD = "#B42318";
const LABEL_LIMIT = 15; // above this many edges, labels show only on hover or selection (§10)

export type GraphView = "before" | "after";

interface Props {
  model: GraphModel;
  view: GraphView;
  roundDate: string | null;
  selectedCompanyId: string | null;
  selectedEdgeId: string | null;
  dimmed: boolean;
  pulseStep: number;
  onSelectCompany: (id: string) => void;
  onSelectEdge: (id: string) => void;
  onClear: () => void;
  children?: React.ReactNode; // overlays (legend, view toggle)
}

// Leave room for the view toggle and badges (top) and the legend and node labels (bottom), which sit
// outside the node boxes React Flow fits, so overlays never cover a node or its name.
const FIT: FitViewOptions = { padding: { top: "84px", bottom: `${LEGEND_HEIGHT_PX + 48}px`, left: "48px", right: "48px" } };

const marker = (color: string) => ({ type: MarkerType.ArrowClosed, color, width: 12, height: 12, markerUnits: "userSpaceOnUse" });

export default function GraphCanvas(props: Props) {
  const { model, view, roundDate, selectedCompanyId, selectedEdgeId, dimmed, pulseStep } = props;
  const [hovered, setHovered] = useState<string | null>(null);

  const round = model.rounds.find((r) => r.date === roundDate) ?? null;
  const colourOf = useMemo(() => new Map(model.rounds.map((r) => [r.date, r.colour])), [model.rounds]);

  const nodes = useMemo<Node[]>(() => {
    const companies: CompanyNodeType[] = model.companies.map((c) => ({
      id: c.id,
      type: "company",
      position: { x: c.x, y: c.y },
      data: { company: c, selected: c.id === selectedCompanyId, dimmed },
      draggable: false,
      connectable: false,
      ariaLabel: c.name,
      zIndex: 10, // above every edge, so names are never crossed out
    }));
    const hub: HubNodeType = {
      id: HUB_ID,
      type: "hub",
      position: { x: 0, y: 0 },
      data: { view, roundDate, payIn: round?.payIn ?? 0, dimmed },
      draggable: false,
      connectable: false,
      selectable: false,
      zIndex: 10,
    };
    return [hub, ...companies];
  }, [model.companies, selectedCompanyId, dimmed, view, roundDate, round?.payIn]);

  const edges = useMemo<Edge[]>(() => {
    const out: FlowEdgeType[] = [];
    const many = model.pairEdges.length > LABEL_LIMIT;
    const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

    const pair = (e: PairEdge): FlowEdgeType => {
      const id = `pair:${e.id}`;
      const selected = selectedEdgeId === id;
      let data: FlowEdgeData;
      if (view === "before") {
        data = {
          colours: [MUTED],
          width: [1.5, 3, 5][e.tier - 1],
          opacity: 0.8,
          label: sarCompact(e.total),
          showLabel: !many || hovered === id || selected,
          tooltip: `${e.payerId} pays ${e.payeeId}: ${plural(e.count, "invoice")}, ${sar(e.total)}. Paid as ${plural(e.count, "separate transfer")}.`,
          selected,
        };
      } else {
        const colours = e.roundDates.map((d) => colourOf.get(d) ?? MUTED);
        const inSelected = roundDate !== null && e.roundDates.includes(roundDate);
        data = {
          colours: colours.length ? colours : [MUTED],
          width: 1.5,
          opacity: selected ? 0.9 : inSelected ? 0.45 : 0.18,
          label: sarCompact(e.total),
          showLabel: hovered === id || selected,
          tooltip: `${e.payerId} → ${e.payeeId}: ${plural(e.count, "invoice")}, ${sar(e.total)}, cleared in ${e.roundDates.map(date).join(", ") || "no round"}.`,
          pulseKey: e.changed ? pulseStep : undefined,
          selected,
        };
      }
      return { id, type: "flow", source: e.payerId, target: e.payeeId, data, markerEnd: marker(data.colours[0]), zIndex: 1 };
    };
    out.push(...model.pairEdges.map(pair));

    for (const e of model.problemEdges) {
      const id = `problem:${e.id}`;
      const selected = selectedEdgeId === id;
      out.push({
        id,
        type: "flow",
        source: e.payerId,
        target: e.payeeId,
        markerEnd: marker(BAD),
        zIndex: 2,
        data: {
          colours: [BAD],
          width: 2,
          opacity: 0.9,
          dash: "1 5",
          label: sarCompact(e.total),
          showLabel: hovered === id || selected,
          tooltip: `${e.payerId} → ${e.payeeId}: ${plural(e.count, "invoice")} on hold or escalated, excluded from settlement.`,
          selected,
        },
      });
    }

    if (view === "after" && round) {
      for (const h of round.hubEdges) {
        const into = h.dir === "in";
        out.push({
          id: h.id,
          type: "flow",
          source: into ? h.companyId : HUB_ID,
          target: into ? HUB_ID : h.companyId,
          markerEnd: marker(round.colour),
          zIndex: 3,
          data: {
            colours: [round.colour],
            width: 2.5,
            opacity: 1,
            label: sarCompact(h.amount),
            showLabel: true,
            tooltip: `${date(round.date)}: ${into ? `${h.companyId} pays the hub` : `the hub pays ${h.companyId}`} ${sar(h.amount)}.`,
            sourceIsHub: !into,
            targetIsHub: into,
          },
        });
      }
    }
    return out;
  }, [model, view, round, roundDate, colourOf, hovered, selectedEdgeId, pulseStep]);

  return (
    <div className={`relative h-full w-full transition-opacity ${dimmed ? "opacity-60" : ""}`}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        nodeOrigin={[0.5, 0.5]}
        fitView
        fitViewOptions={FIT}
        minZoom={0.3}
        maxZoom={2.5}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        onNodeClick={(_, n) => n.id !== HUB_ID && props.onSelectCompany(n.id)}
        onEdgeClick={(_, e) => !e.id.startsWith("hub-") && props.onSelectEdge(e.id)}
        onEdgeMouseEnter={(_, e) => setHovered(e.id)}
        onEdgeMouseLeave={() => setHovered(null)}
        onPaneClick={props.onClear}
        aria-label="Network of who owes whom"
      />
      {props.children}
    </div>
  );
}
