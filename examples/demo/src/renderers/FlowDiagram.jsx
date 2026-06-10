/*
 * FlowDiagram: vendorable reference renderer for the sqnce "flow" kind
 * ({ nodes: [{ id, label, group? }], edges: [{ from, to, label? }] }).
 *
 * COPY THIS FILE INTO YOUR PROJECT. It is not a published package and
 * carries no semver promise. It exists to prove the sqnce renderer
 * contract ({ spec, value, onChange, context }) under a demanding load:
 * async layout in a worker, re-fit on the inline-to-overlay transition,
 * and strictly view-only behavior (onChange is never called; selection
 * and viewport are renderer view state and stay internal).
 *
 * Dependencies (pin guidance, June 2026): @xyflow/react ^12.11.0 (MIT),
 * elkjs ^0.11.1 (EPL-2.0). elkjs is consumed unmodified as a separate
 * lazy chunk; the EPL-2.0 notice travels with its bundled worker file.
 *
 * Bundler note: elkjs's automatic worker loading does not survive
 * bundling (kieler/elkjs#142, #272). Under Vite, import elk-api and the
 * worker URL explicitly (below). Under webpack or Next, replace the
 * workerFactory with: new Worker(new URL("elkjs/lib/elk-worker.min.js",
 * import.meta.url)).
 */
import React, { useEffect, useState } from "react";
import { ReactFlow, ReactFlowProvider, Background, Controls, useReactFlow } from "@xyflow/react";
import ELK from "elkjs/lib/elk-api";
import elkWorkerUrl from "elkjs/lib/elk-worker.min.js?url";
import "@xyflow/react/dist/style.css";

const NODE_W = 190;
const NODE_H = 48;

const elk = new ELK({
  workerFactory: () => new Worker(elkWorkerUrl, { type: "classic" }),
});

function useElkLayout(value) {
  const [positions, setPositions] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    let alive = true;
    setPositions(null);
    setError(null);
    const nodes = (value && value.nodes) || [];
    const ids = new Set(nodes.map((n) => n.id));
    const edges = ((value && value.edges) || []).filter((e) => ids.has(e.from) && ids.has(e.to));
    if (!nodes.length) {
      /* Fail soft on an empty graph: an empty positions map renders the
         empty state instead of spinning on "Laying out…" forever. */
      setPositions(new Map());
      return undefined;
    }
    elk
      .layout({
        id: "root",
        layoutOptions: {
          "elk.algorithm": "layered",
          "elk.direction": "RIGHT",
          "elk.layered.spacing.nodeNodeBetweenLayers": "70",
          "elk.spacing.nodeNode": "22",
        },
        children: nodes.map((n) => ({ id: n.id, width: NODE_W, height: NODE_H })),
        edges: edges.map((e, i) => ({ id: `e${i}`, sources: [e.from], targets: [e.to] })),
      })
      .then(
        (res) => {
          if (!alive) return;
          setPositions(new Map(res.children.map((c) => [c.id, { x: c.x, y: c.y }])));
        },
        (err) => {
          if (alive) setError(String(err));
        }
      );
    return () => {
      alive = false;
    };
  }, [value]);
  return { positions, error };
}

function Diagram({ value, context }) {
  const { positions, error } = useElkLayout(value);
  const { fitView } = useReactFlow();
  const expanded = !!(context && context.expanded);
  useEffect(() => {
    if (positions) requestAnimationFrame(() => fitView({ padding: 0.15 }));
  }, [positions, expanded, fitView]);
  if (error) return <div style={{ padding: 10, color: "#B3402A", fontSize: 13 }}>Layout failed: {error}</div>;
  if (!positions) return <div style={{ padding: 10, fontSize: 13 }}>Laying out…</div>;
  if (!positions.size) return <div style={{ padding: 10, fontSize: 13 }}>No flow nodes to show.</div>;
  const ids = new Set(((value && value.nodes) || []).map((n) => n.id));
  const nodes = ((value && value.nodes) || []).map((n) => ({
    id: n.id,
    position: positions.get(n.id) || { x: 0, y: 0 },
    data: { label: n.label || n.id },
    sourcePosition: "right",
    targetPosition: "left",
    style: {
      width: NODE_W,
      fontSize: 11.5,
      borderRadius: 6,
      border: "1px solid " + (n.group === "table" ? "#2E8F62" : "#D9A441"),
      background: n.group === "table" ? "#F2F8F3" : "#FBF3DD",
    },
  }));
  const edges = ((value && value.edges) || [])
    .filter((e) => ids.has(e.from) && ids.has(e.to))
    .map((e, i) => ({ id: `e${i}`, source: e.from, target: e.to, label: e.label }));
  return (
    <ReactFlow nodes={nodes} edges={edges} nodesDraggable={false} nodesConnectable={false} fitView>
      <Background />
      <Controls showInteractive={false} />
    </ReactFlow>
  );
}

export default function FlowDiagram({ spec, value, onChange, context }) {
  const expanded = !!(context && context.expanded);
  return (
    <div style={{ height: expanded ? "100%" : 300, minHeight: 220 }}>
      <ReactFlowProvider>
        <Diagram value={value} context={context} />
      </ReactFlowProvider>
    </div>
  );
}
