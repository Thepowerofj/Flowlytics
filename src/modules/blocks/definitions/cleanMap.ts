import {
  applyTableTransforms,
  defaultColumnTransform,
  type ColumnTransform,
} from "@/modules/ingest/domain/columnTransform";
import type { BlockDefinition, TabularData } from "../domain/types";
import { cleanMapMeta } from "../catalog";

export const cleanMapBlock: BlockDefinition = {
  ...cleanMapMeta,
  async run(config, inputs) {
    const table = inputs.table as TabularData;
    if (!table) throw new Error("Clean/Map requires a table input");
    const dropColumns = (config.dropColumns as string[]) ?? [];
    const columnMap = (config.columnMap as Record<string, string>) ?? {};
    const transforms = (config.transforms as Record<string, ColumnTransform>) ?? {};
    // Ensure defaults for columns without explicit transform
    const withDefaults: Record<string, ColumnTransform> = { ...transforms };
    for (const c of table.columns) {
      if (!withDefaults[c]) withDefaults[c] = defaultColumnTransform();
    }
    const next = applyTableTransforms(table, {
      dropColumns,
      columnMap,
      transforms: withDefaults,
    });
    return { table: next };
  },
};
