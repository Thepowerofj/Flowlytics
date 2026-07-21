/** Port rules for canvas handles — keep canvas wiring honest to block contracts. */
export function portsFor(blockType: string): { hasInput: boolean; hasOutput: boolean } {
  if (blockType.startsWith("ingest.")) {
    return { hasInput: false, hasOutput: true };
  }
  // Terminal-style outputs still allow a table out for chaining/export preview
  if (blockType.startsWith("output.")) {
    return { hasInput: true, hasOutput: true };
  }
  return { hasInput: true, hasOutput: true };
}

export function needsConfigWindow(blockType: string): boolean {
  return (
    blockType === "ingest.csv_excel" ||
    blockType === "transform.clean_map" ||
    blockType === "transform.aggregate" ||
    blockType === "output.structure" ||
    blockType === "analyse.projection" ||
    blockType === "analyse.chart" ||
    blockType === "analyse.stats" ||
    blockType.startsWith("ai.")
  );
}
