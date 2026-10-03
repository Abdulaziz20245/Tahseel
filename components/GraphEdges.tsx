"use client";

// Custom edge for the network graph (Claude.md §4.2): a gently curved line between node centres,
// trimmed to the node circles, so A→B and B→A never overlap. Draws one or more colours (dashed
// multi-colour when an edge's invoices settle in several rounds) and an optional label.

import { EdgeLabelRenderer, type Edge, type EdgeProps } from "@xyflow/react";
import { COMPANY_SIZE, HUB_SIZE } from "./GraphNodes";

export type FlowEdgeData = {
  colours: string[];
  width: number;
  opacity: number;
  dash?: string; // explicit dash pattern (dotted red for held/escalated)
  label?: string;
  showLabel: boolean;
  tooltip: string;
  sourceIsHub?: boolean;
  targetIsHub?: boolean;
  pulseKey?: number; // when set, the edge pulses once (decorative) — the key restarts the animation
  selected?: boolean;
};
export type FlowEdgeType = Edge<FlowEdgeData, "flow">;

const CURVE = 0.12;

function geometry(sx: number, sy: number, tx: number, ty: number, rs: number, rt: number) {
  const dx = tx - sx;
  const dy = ty - sy;
  const len = Math.hypot(dx, dy) || 1;
  // Control point offset to the left of the direction of travel.
  const cx = (sx + tx) / 2 - dy * CURVE;
  const cy = (sy + ty) / 2 + dx * CURVE;
  const trim = (px: number, py: number, qx: number, qy: number, r: number) => {
    const d = Math.hypot(qx - px, qy - py) || 1;
    return [px + ((qx - px) / d) * r, py + ((qy - py) / d) * r];
  };
  const [x1, y1] = trim(sx, sy, cx, cy, rs);
  const [x2, y2] = trim(tx, ty, cx, cy, rt);
  return {
    path: `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`,
    labelX: 0.25 * x1 + 0.5 * cx + 0.25 * x2,
    labelY: 0.25 * y1 + 0.5 * cy + 0.25 * y2,
    len,
  };
}

export function FlowEdge({ id, sourceX, sourceY, targetX, targetY, data, markerEnd }: EdgeProps<FlowEdgeType>) {
  if (!data) return null;
  const rs = (data.sourceIsHub ? HUB_SIZE : COMPANY_SIZE) / 2 + 3;
  const rt = (data.targetIsHub ? HUB_SIZE : COMPANY_SIZE) / 2 + 6;
  const g = geometry(sourceX, sourceY, targetX, targetY, rs, rt);
  const n = data.colours.length;
  const seg = 8;

  return (
    <>
      <g key={data.pulseKey ?? "static"} className={data.pulseKey !== undefined ? "edge-pulse" : undefined} opacity={data.opacity}>
        <title>{data.tooltip}</title>
        {/* Wide transparent path makes thin edges easy to hover and click. */}
        <path d={g.path} fill="none" stroke="transparent" strokeWidth={14} className="react-flow__edge-interaction" />
        {data.colours.map((colour, i) => (
          <path
            key={colour + i}
            id={i === 0 ? id : undefined}
            d={g.path}
            fill="none"
            stroke={colour}
            strokeWidth={data.selected ? data.width + 1.5 : data.width}
            strokeLinecap={data.dash ? "round" : "butt"}
            strokeDasharray={data.dash ?? (n > 1 ? `${seg} ${seg * (n - 1)}` : undefined)}
            strokeDashoffset={n > 1 && !data.dash ? -seg * i : undefined}
            markerEnd={i === 0 ? markerEnd : undefined}
          />
        ))}
      </g>
      {data.label && data.showLabel && (
        <EdgeLabelRenderer>
          <div
            className="num pointer-events-none absolute rounded-md border border-line bg-canvas/95 px-1 text-xs leading-4 text-ink"
            style={{ transform: `translate(-50%, -50%) translate(${g.labelX}px, ${g.labelY}px)` }}
          >
            {data.label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export const edgeTypes = { flow: FlowEdge };
