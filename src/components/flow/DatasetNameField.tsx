"use client";

type Props = {
  value: string;
  placeholder?: string;
  hint?: string;
  readOnly?: boolean;
  onChange: (datasetName: string) => void;
};

/** Name shown in the downstream Data source picker and on the canvas card. */
export function DatasetNameField({
  value,
  placeholder = "e.g. Monthly sales cleaned",
  hint = "Shown when other activities pick this table as their data source.",
  readOnly,
  onChange,
}: Props) {
  return (
    <label className="mb-3 block rounded-xl border border-border bg-bg/40 px-3 py-2.5 text-sm">
      <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
        Dataset name
      </span>
      <input
        className="input mt-1.5 text-sm"
        value={value}
        placeholder={placeholder}
        maxLength={80}
        disabled={readOnly}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Dataset name"
      />
      <span className="mt-1 block text-[11px] text-muted">{hint}</span>
    </label>
  );
}

export function datasetNameOf(config: Record<string, unknown> | undefined): string {
  const raw = config?.datasetName;
  return typeof raw === "string" ? raw.trim() : "";
}

export function displayDatasetLabel(
  blockLabel: string,
  config: Record<string, unknown> | undefined,
): string {
  return datasetNameOf(config) || blockLabel;
}
