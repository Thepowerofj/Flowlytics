"use client";

import type { AncestorSource } from "./upstreamSources";

const SUPPORTS_SOURCE_PICKER = new Set([
  "analyse.chart",
  "analyse.stats",
  "analyse.projection",
  "output.structure",
  "ai.structure",
  "ai.explain",
  "ai.analyse",
  "ai.chart",
]);

export function supportsSourcePicker(blockType: string): boolean {
  return SUPPORTS_SOURCE_PICKER.has(blockType);
}

function kindHint(blockType: string): string {
  if (blockType.startsWith("transform.")) {
    return blockType === "transform.aggregate" ? "Aggregate" : "Clean / Map";
  }
  if (blockType.startsWith("ai.")) return "AI";
  if (blockType.startsWith("ingest.")) return "Ingest";
  if (blockType === "analyse.projection") return "Forecast";
  if (blockType.startsWith("analyse.")) return "Analyse";
  if (blockType.startsWith("output.")) return "Output";
  return blockType.split(".").slice(1).join(".") || blockType;
}

type Props = {
  blockType: string;
  ancestors: AncestorSource[];
  selectedId: string;
  readOnly?: boolean;
  onSelect: (sourceNodeId: string) => void;
};

export function SourceDataPicker({
  blockType,
  ancestors,
  selectedId,
  readOnly,
  onSelect,
}: Props) {
  if (!supportsSourcePicker(blockType) || ancestors.length < 2) return null;

  const safeId = ancestors.some((a) => a.id === selectedId)
    ? selectedId
    : (ancestors[0]?.id ?? "");

  return (
    <label className="mb-3 block rounded-xl border border-border bg-bg/50 px-3 py-2.5 text-sm">
      <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
        Data source
      </span>
      <p className="mt-0.5 text-[11px] text-muted">
        Choose which named upstream table this activity uses. Rename datasets on Clean,
        Aggregate, or AI steps to tell them apart.
      </p>
      <select
        className="input mt-2 text-sm"
        value={safeId}
        disabled={readOnly}
        onChange={(e) => onSelect(e.target.value)}
      >
        {ancestors.map((a) => {
          const kind = kindHint(a.blockType);
          const named = Boolean(a.datasetName);
          return (
            <option key={a.id} value={a.id}>
              {named ? `${a.datasetName} (${kind})` : `${a.label} · ${kind}`}
            </option>
          );
        })}
      </select>
    </label>
  );
}
