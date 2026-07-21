import type { TabularData } from "@/modules/blocks/domain/types";
import { portsFor } from "./ports";

function configColumns(cfg: Record<string, unknown>): string[] {
  const table = cfg.table as TabularData | undefined;
  if (table?.columns?.length) return table.columns;
  if (Array.isArray(cfg._sourceColumns)) return cfg._sourceColumns as string[];
  return [];
}

export type FlowIssue = {
  id: string;
  severity: "error" | "warning";
  message: string;
  nodeId?: string;
};

type CheckNode = {
  id: string;
  data: {
    blockType: string;
    label: string;
    config: Record<string, unknown>;
  };
};

type CheckEdge = {
  source: string;
  target: string;
};

function hasCycle(nodes: CheckNode[], edges: CheckEdge[]): boolean {
  const outgoing = new Map<string, string[]>();
  for (const n of nodes) outgoing.set(n.id, []);
  for (const e of edges) {
    outgoing.get(e.source)?.push(e.target);
  }
  const visiting = new Set<string>();
  const done = new Set<string>();

  function dfs(id: string): boolean {
    if (done.has(id)) return false;
    if (visiting.has(id)) return true;
    visiting.add(id);
    for (const next of outgoing.get(id) ?? []) {
      if (dfs(next)) return true;
    }
    visiting.delete(id);
    done.add(id);
    return false;
  }

  for (const n of nodes) {
    if (dfs(n.id)) return true;
  }
  return false;
}

function incomingCount(nodeId: string, edges: CheckEdge[]) {
  return edges.filter((e) => e.target === nodeId).length;
}

function outgoingCount(nodeId: string, edges: CheckEdge[]) {
  return edges.filter((e) => e.source === nodeId).length;
}

/** Lightweight pre-run checks so novices see wiring/config problems early. */
export function checkFlow(nodes: CheckNode[], edges: CheckEdge[]): FlowIssue[] {
  const issues: FlowIssue[] = [];

  if (!nodes.length) {
    issues.push({
      id: "empty",
      severity: "warning",
      message: "Canvas is empty — add an Ingest or use a quick path.",
    });
    return issues;
  }

  if (hasCycle(nodes, edges)) {
    issues.push({
      id: "cycle",
      severity: "error",
      message: "Flow has a loop — remove a connection so data only moves forward.",
    });
  }

  const hasIngest = nodes.some((n) => n.data.blockType.startsWith("ingest."));
  const hasTextAiStructure = nodes.some(
    (n) =>
      n.data.blockType === "ai.structure" &&
      typeof n.data.config.rawText === "string" &&
      n.data.config.rawText.trim().length > 0,
  );
  if (!hasIngest && !hasTextAiStructure) {
    issues.push({
      id: "no-ingest",
      severity: "error",
      message:
        "No data source — start with a spreadsheet upload, or AI Structure with pasted text.",
    });
  }

  for (const n of nodes) {
    const ports = portsFor(n.data.blockType);
    const label = n.data.label || n.data.blockType;
    const cfg = n.data.config;

    const aiStructureHasText =
      n.data.blockType === "ai.structure" &&
      typeof cfg.rawText === "string" &&
      cfg.rawText.trim().length > 0;

    if (ports.hasInput && incomingCount(n.id, edges) === 0 && !aiStructureHasText) {
      issues.push({
        id: `unwired-in-${n.id}`,
        severity: "error",
        message:
          n.data.blockType === "ai.structure"
            ? `${label} needs pasted text or an In connection from upstream data.`
            : `${label} needs an In connection from upstream data.`,
        nodeId: n.id,
      });
    }

    if (ports.hasOutput && outgoingCount(n.id, edges) === 0 && nodes.length > 1) {
      // Only warn for non-terminal-looking last steps when something else exists
      const isLikelyTerminal =
        n.data.blockType.startsWith("output.") ||
        n.data.blockType === "analyse.chart" ||
        n.data.blockType === "ai.explain" ||
        n.data.blockType === "ai.analyse" ||
        n.data.blockType === "ai.chart";
      if (!isLikelyTerminal) {
        issues.push({
          id: `unwired-out-${n.id}`,
          severity: "warning",
          message: `${label} has no Out connection — data won’t reach later steps.`,
          nodeId: n.id,
        });
      }
    }

    if (
      n.data.blockType === "ai.structure" &&
      outgoingCount(n.id, edges) > 0 &&
      !(Array.isArray(cfg.outputColumns) && cfg.outputColumns.length)
    ) {
      issues.push({
        id: `ai-schema-${n.id}`,
        severity: "warning",
        message: `${label}: set output columns so downstream steps can pick fields before Run.`,
        nodeId: n.id,
      });
    }

    if (n.data.blockType === "ingest.csv_excel" && !cfg.fileName && !cfg.table) {
      issues.push({
        id: `ingest-file-${n.id}`,
        severity: "error",
        message: `${label}: open and upload a CSV/Excel file.`,
        nodeId: n.id,
      });
    }

    if (n.data.blockType === "transform.clean_map") {
      const cols = (cfg._sourceColumns as string[]) ?? [];
      if (incomingCount(n.id, edges) > 0 && !cols.length && !cfg.table) {
        issues.push({
          id: `clean-cols-${n.id}`,
          severity: "warning",
          message: `${label}: connected but no columns yet — upload on Ingest first.`,
          nodeId: n.id,
        });
      }
    }

    if (n.data.blockType === "analyse.chart") {
      if (incomingCount(n.id, edges) > 0 && !cfg.xColumn && !cfg.yColumn && !cfg.table) {
        issues.push({
          id: `chart-cfg-${n.id}`,
          severity: "warning",
          message: `${label}: open to pick chart columns (or connect data with a table).`,
          nodeId: n.id,
        });
      }
      const cols = configColumns(cfg);
      const x = cfg.xColumn as string | undefined;
      const y = cfg.yColumn as string | undefined;
      if (cols.length && x && x !== "__row__" && !cols.includes(x)) {
        issues.push({
          id: `chart-x-missing-${n.id}`,
          severity: "error",
          message: `${label}: X column “${x}” isn’t in the upstream (cleaned) data — re-open Chart or fix Clean/Map.`,
          nodeId: n.id,
        });
      }
      if (cols.length && y && y !== "__count__" && !cols.includes(y)) {
        issues.push({
          id: `chart-y-missing-${n.id}`,
          severity: "error",
          message: `${label}: Y column “${y}” isn’t in the upstream (cleaned) data — re-open Chart or fix Clean/Map.`,
          nodeId: n.id,
        });
      }
    }

    if (n.data.blockType === "output.structure") {
      const cols = new Set(configColumns(cfg));
      const selected = (cfg.selectedColumns as string[]) ?? [];
      const missing = selected.filter((c) => !cols.has(c));
      if (cols.size && missing.length) {
        issues.push({
          id: `structure-cols-missing-${n.id}`,
          severity: "error",
          message: `${label}: export still references dropped columns (${missing.slice(0, 3).join(", ")}). Re-open Structure or update Clean/Map.`,
          nodeId: n.id,
        });
      }
    }

    if (n.data.blockType === "analyse.projection") {
      const cols = configColumns(cfg);
      const col = cfg.column as string | undefined;
      if (cols.length && col && !cols.includes(col)) {
        issues.push({
          id: `projection-col-missing-${n.id}`,
          severity: "error",
          message: `${label}: column “${col}” isn’t available after Clean/Map.`,
          nodeId: n.id,
        });
      }
    }

    if (n.data.blockType.startsWith("ai.") && !cfg.aiOptIn) {
      issues.push({
        id: `ai-optin-${n.id}`,
        severity: "warning",
        message: `${label}: open the activity and enable “Use AI on Run”.`,
        nodeId: n.id,
      });
    }
  }

  // Prefer errors first, then warnings; cap list for the palette
  return issues
    .sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "error" ? -1 : 1))
    .slice(0, 8);
}

export function issueCounts(issues: FlowIssue[]) {
  return {
    errors: issues.filter((i) => i.severity === "error").length,
    warnings: issues.filter((i) => i.severity === "warning").length,
  };
}
