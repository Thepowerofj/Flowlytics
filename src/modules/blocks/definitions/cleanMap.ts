import {
  applyTableTransforms,
  defaultColumnTransform,
  type ColumnTransform,
} from "@/modules/ingest/domain/columnTransform";
import type { BlockDefinition, TabularData } from "../domain/types";

export const cleanMapBlock: BlockDefinition = {
  type: "transform.clean_map",
  label: "Clean / Map Columns",
  description: "Rename, clean, convert types, and format fields",
  category: "transform",
  inputs: [{ id: "table", label: "Table", dataType: "table" }],
  outputs: [{ id: "table", label: "Table", dataType: "table" }],
  defaultConfig: {
    columnMap: {} as Record<string, string>,
    dropColumns: [] as string[],
    transforms: {} as Record<string, ColumnTransform>,
  },
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
