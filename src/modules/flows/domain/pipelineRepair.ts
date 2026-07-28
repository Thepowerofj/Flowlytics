import type { FlowEdge, FlowGraph, FlowNode, TabularData } from "@/modules/blocks/domain/types";
import { suggestCharts } from "@/modules/analyse/domain/charts";
import {
  forecastMeasureColumns,
  guessPeriodColumn,
} from "@/modules/analyse/domain/stats";
import { checkFlow, type FlowIssue } from "./flowChecks";

function asTable(config: Record<string, unknown>): TabularData | null {
  const table = config.table as TabularData | undefined;
  if (
    !table ||
    !Array.isArray(table.columns) ||
    !table.columns.length ||
    !Array.isArray(table.rows)
  ) {
    return null;
  }
  return table;
}

function sourceColumns(config: Record<string, unknown>): string[] {
  const table = asTable(config);
  if (table) return table.columns;
  if (Array.isArray(config._sourceColumns)) {
    return (config._sourceColumns as unknown[]).filter(
      (c): c is string => typeof c === "string",
    );
  }
  return [];
}

function chartFromTable(table: TabularData): Record<string, unknown> {
  const suggestions = suggestCharts(table);
  const first = suggestions[0];
  if (!first) return { chartType: "bar" };
  return {
    chartType: first.type,
    xColumn: first.xColumn,
    yColumn: first.yColumn,
    suggestionId: first.id,
  };
}

/**
 * After auto-pipeline materialization, fix remaining Builder validation errors
 * (stale columns, AI opt-in, export selection) before the user sees the canvas.
 */
export function repairAutoPipelineGraph(graph: FlowGraph): {
  graph: FlowGraph;
  repairs: string[];
  remainingErrors: FlowIssue[];
} {
  const repairs: string[] = [];
  const nodes: FlowNode[] = graph.nodes.map((n) => ({
    ...n,
    config: { ...n.config },
  }));
  const edges: FlowEdge[] = [...graph.edges];

  // Ensure AI opt-in and export columns against each node's own table snapshot
  for (const node of nodes) {
    if (node.type.startsWith("ai.") && !node.config.aiOptIn) {
      node.config.aiOptIn = true;
      repairs.push(`Enabled AI on ${node.type}`);
    }

    const cols = sourceColumns(node.config);
    if (node.type === "output.structure" && cols.length) {
      const selected = Array.isArray(node.config.selectedColumns)
        ? (node.config.selectedColumns as string[]).filter((c) => cols.includes(c))
        : [];
      if (!selected.length || selected.length !== (node.config.selectedColumns as string[] | undefined)?.length) {
        node.config.selectedColumns = selected.length ? selected : [...cols];
        repairs.push("Aligned export columns to upstream schema");
      }
    }

    if (node.type === "analyse.chart" && cols.length) {
      const table = asTable(node.config) ?? {
        columns: cols,
        rows: [],
      };
      const x = node.config.xColumn as string | undefined;
      const y = node.config.yColumn as string | undefined;
      const xBad = Boolean(x && x !== "__row__" && !cols.includes(x));
      const yBad = Boolean(y && y !== "__count__" && !cols.includes(y));
      if (xBad || yBad || !x || !y) {
        node.config = { ...node.config, ...chartFromTable(table) };
        repairs.push("Rebuilt chart columns from upstream data");
      }
    }

    if (node.type === "analyse.projection" && cols.length) {
      const table = asTable(node.config) ?? { columns: cols, rows: [] };
      const col = node.config.column as string | undefined;
      if (!col || !cols.includes(col)) {
        const measure = forecastMeasureColumns(table)[0] || "";
        const period = guessPeriodColumn(table, measure) || "";
        if (measure) {
          node.config = {
            ...node.config,
            column: measure,
            periodColumn: period && period !== measure ? period : "",
          };
          repairs.push(`Re-bound forecast measure to “${measure}”`);
        }
      }
    }

    if (node.type === "ingest.csv_excel" && Array.isArray(node.config.piiFindings)) {
      if (
        (node.config.piiFindings as unknown[]).length > 0 &&
        !node.config.piiAcknowledged
      ) {
        // Auto-pipeline already profiled this file — acknowledge so Run isn't blocked
        node.config.piiAcknowledged = true;
        repairs.push("Acknowledged personal-data findings on ingest");
      }
    }
  }

  // Wire-repair: ensure every non-root node has an inbound edge in a linear auto graph
  const hasIncoming = new Set(edges.map((e) => e.target));
  const sorted = [...nodes].sort((a, b) => a.x - b.x || a.y - b.y);
  for (let i = 1; i < sorted.length; i++) {
    const node = sorted[i]!;
    if (hasIncoming.has(node.id)) continue;
    if (node.type.startsWith("ingest.")) continue;
    if (
      node.type === "ai.structure" &&
      typeof node.config.rawText === "string" &&
      node.config.rawText.trim()
    ) {
      continue;
    }
    const prev = sorted[i - 1]!;
    edges.push({
      id: `e_repair_${prev.id}_${node.id}`,
      source: prev.id,
      sourcePort: "table",
      target: node.id,
      targetPort: "table",
    });
    hasIncoming.add(node.id);
    repairs.push(`Connected ${prev.type} → ${node.type}`);
  }

  const checkNodes = nodes.map((n) => ({
    id: n.id,
    data: {
      blockType: n.type,
      label: (n.config.datasetName as string) || n.type,
      config: n.config,
    },
  }));
  const checkEdges = edges.map((e) => ({ source: e.source, target: e.target }));
  const remainingErrors = checkFlow(checkNodes, checkEdges).filter(
    (i) => i.severity === "error",
  );

  // Drop unsalvageable forecast if still broken (no measure)
  if (remainingErrors.some((i) => i.id.startsWith("projection-col-missing"))) {
    const nextNodes = nodes.filter((n) => n.type !== "analyse.projection");
    if (nextNodes.length < nodes.length) {
      const keep = new Set(nextNodes.map((n) => n.id));
      const nextEdges = edges.filter(
        (e) => keep.has(e.source) && keep.has(e.target),
      );
      // Re-link gap: connect neighbors of removed forecast nodes
      for (const removed of nodes.filter((n) => n.type === "analyse.projection")) {
        const inbound = edges.find((e) => e.target === removed.id);
        const outbound = edges.find((e) => e.source === removed.id);
        if (inbound && outbound && keep.has(inbound.source) && keep.has(outbound.target)) {
          nextEdges.push({
            id: `e_bridge_${inbound.source}_${outbound.target}`,
            source: inbound.source,
            sourcePort: "table",
            target: outbound.target,
            targetPort: "table",
          });
        }
      }
      repairs.push("Removed forecast step that could not bind a numeric measure");
      const bridged = { nodes: nextNodes, edges: nextEdges };
      const remaining = checkFlow(
        bridged.nodes.map((n) => ({
          id: n.id,
          data: {
            blockType: n.type,
            label: (n.config.datasetName as string) || n.type,
            config: n.config,
          },
        })),
        bridged.edges.map((e) => ({ source: e.source, target: e.target })),
      ).filter((i) => i.severity === "error");
      return { graph: bridged, repairs, remainingErrors: remaining };
    }
  }

  return {
    graph: { nodes, edges },
    repairs,
    remainingErrors,
  };
}

/** Materialize helper: repair then return graph (repairs applied in place). */
export function finalizeAutoPipelineGraph(graph: FlowGraph): FlowGraph {
  return repairAutoPipelineGraph(graph).graph;
}
