"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CURRENCY_OPTIONS,
  displayFormatFromTransform,
  formatDisplayValue,
  formatsFromCleanMap,
} from "@/modules/ingest/domain/columnFormat";
import {
  applyTableTransforms,
  defaultColumnTransform,
  type ColumnTransform,
  type CurrencyCode,
} from "@/modules/ingest/domain/columnTransform";
import { DatasetNameField } from "./DatasetNameField";

type Props = {
  columns: string[];
  columnMap: Record<string, string>;
  dropColumns: string[];
  transforms: Record<string, ColumnTransform>;
  sampleRows: Record<string, string | number | null>[];
  datasetName?: string;
  onChange: (patch: Record<string, unknown>) => void;
};

function sampleFingerprint(
  columns: string[],
  rows: Record<string, string | number | null>[],
): string {
  return rows
    .slice(0, 12)
    .map((r) => columns.map((c) => String(r[c] ?? "")).join("\u001f"))
    .join("\u001e");
}

const TYPE_LABEL: Record<ColumnTransform["type"], string> = {
  auto: "Auto",
  string: "Text",
  number: "Number",
  currency: "Currency",
  boolean: "Bool",
  date: "Date",
};

function transformChips(t: ColumnTransform): string[] {
  const chips: string[] = [];
  if (t.type !== "auto") chips.push(TYPE_LABEL[t.type]);
  if (!t.trim) chips.push("no trim");
  if (t.textCase !== "none") chips.push(t.textCase);
  if (t.fillNull) chips.push(`fill “${t.fillNull}”`);
  if (t.dropIfEmpty) chips.push("drop empty");
  if (t.decimals != null) chips.push(`${t.decimals} dp`);
  if (t.type === "currency") chips.push(t.currencyCode ?? "ZAR");
  if (t.useGrouping && (t.type === "number" || t.type === "currency")) {
    chips.push("1,000s");
  }
  if (t.stripCurrency) chips.push("strip $");
  if (t.dateFormat !== "auto") chips.push(t.dateFormat.toUpperCase());
  return chips;
}

function sampleFor(
  rows: Record<string, string | number | null>[],
  col: string,
): string {
  for (const row of rows) {
    const v = row[col];
    if (v != null && String(v).trim() !== "") return String(v);
  }
  return "—";
}

export function CleanMapConfig({
  columns,
  columnMap,
  dropColumns,
  transforms,
  sampleRows,
  datasetName = "",
  onChange,
}: Props) {
  // Draft is authoritative while editing. Parent props can lag (re-bind) and must
  // not clobber the draft after each keystroke — only re-sync when the *input* changes.
  const [draftMap, setDraftMap] = useState(columnMap);
  const [draftDrop, setDraftDrop] = useState(dropColumns);
  const [draftTransforms, setDraftTransforms] = useState(transforms);
  const [inputSample, setInputSample] = useState(sampleRows);
  const inputEpoch = useRef("");

  const incomingEpoch = `${columns.join("\0")}::${sampleFingerprint(columns, sampleRows)}`;

  useEffect(() => {
    if (incomingEpoch === inputEpoch.current) return;
    inputEpoch.current = incomingEpoch;
    setDraftMap(columnMap);
    setDraftDrop(dropColumns);
    setDraftTransforms(transforms);
    setInputSample(sampleRows.map((r) => ({ ...r })));
  }, [incomingEpoch, columnMap, dropColumns, transforms, sampleRows]);

  const dropped = useMemo(() => new Set(draftDrop), [draftDrop]);
  const keptColumns = useMemo(
    () => columns.filter((c) => !dropped.has(c)),
    [columns, dropped],
  );
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    if (!columns.length) {
      setSelected(null);
      return;
    }
    setSelected((prev) => {
      if (prev && columns.includes(prev) && !draftDrop.includes(prev)) return prev;
      return columns.find((c) => !draftDrop.includes(c)) ?? columns[0] ?? null;
    });
  }, [columns, draftDrop]);

  // Preview from draft + frozen input sample — recomputed every render so edits show instantly
  const withDefaults: Record<string, ColumnTransform> = { ...draftTransforms };
  for (const c of columns) {
    if (!withDefaults[c]) withDefaults[c] = defaultColumnTransform();
  }
  const transformedPreview =
    columns.length && inputSample.length
      ? applyTableTransforms(
          { columns, rows: inputSample },
          {
            dropColumns: draftDrop,
            columnMap: draftMap,
            transforms: withDefaults,
          },
        )
      : null;

  const outFormats = formatsFromCleanMap({
    columnMap: draftMap,
    dropColumns: draftDrop,
    transforms: draftTransforms,
    _sourceColumns: columns,
  });

  if (!columns.length) {
    return (
      <p className="rounded-xl bg-bg px-3 py-3 text-sm text-muted">
        Connect this activity to an ingest first. Columns auto-map when you wire handles — then clean,
        convert types, and format here.
      </p>
    );
  }

  function emit(
    next: Partial<{
      columnMap: Record<string, string>;
      dropColumns: string[];
      transforms: Record<string, ColumnTransform>;
    }>,
  ) {
    const columnMapNext = next.columnMap ?? draftMap;
    const dropNext = next.dropColumns ?? draftDrop;
    const transformsNext = next.transforms ?? draftTransforms;
    setDraftMap(columnMapNext);
    setDraftDrop(dropNext);
    setDraftTransforms(transformsNext);
    onChange({
      columnMap: columnMapNext,
      dropColumns: dropNext,
      transforms: transformsNext,
      _columnFormats: formatsFromCleanMap({
        columnMap: columnMapNext,
        dropColumns: dropNext,
        transforms: transformsNext,
        _sourceColumns: columns,
      }),
    });
  }

  function patchTransform(col: string, patch: Partial<ColumnTransform>) {
    const current = draftTransforms[col] ?? defaultColumnTransform();
    emit({
      transforms: {
        ...draftTransforms,
        [col]: { ...current, ...patch },
      },
    });
  }

  function setKept(col: string, keep: boolean) {
    const next = keep
      ? draftDrop.filter((c) => c !== col)
      : [...new Set([...draftDrop, col])];
    emit({ dropColumns: next });
    if (!keep && selected === col) {
      const remaining = columns.filter((c) => c !== col && !next.includes(c));
      setSelected(remaining[0] ?? null);
    }
  }

  function keepAll() {
    emit({ dropColumns: [] });
  }

  function trimAllKept() {
    const next = { ...draftTransforms };
    for (const col of keptColumns) {
      next[col] = { ...(next[col] ?? defaultColumnTransform()), trim: true };
    }
    emit({ transforms: next });
  }

  const active = selected && !dropped.has(selected) ? selected : null;
  const activeTransform = active
    ? (draftTransforms[active] ?? defaultColumnTransform())
    : null;

  return (
    <div className="clean-map">
      <DatasetNameField
        value={datasetName}
        placeholder="e.g. Orders cleaned"
        onChange={(next) => onChange({ datasetName: next })}
      />
      <div className="clean-map__toolbar">
        <p className="text-xs text-muted">
          Scan columns on the left. Open one to clean, convert, and format — options stay in one
          panel instead of repeating on every row.
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          <button type="button" className="btn btn-sm btn-ghost" onClick={keepAll}>
            Keep all
          </button>
          <button type="button" className="btn btn-sm btn-ghost" onClick={trimAllKept}>
            Trim kept
          </button>
          <span className="ml-auto text-[11px] text-muted">
            {keptColumns.length}/{columns.length} kept
          </span>
        </div>
      </div>

      <div className="clean-map__layout">
        <div className="clean-map__list" role="listbox" aria-label="Columns">
          <div className="clean-map__list-head">
            <span className="w-8" />
            <span>Column</span>
            <span>Mapped name</span>
            <span>Type</span>
          </div>
          {columns.map((col) => {
            const t = draftTransforms[col] ?? defaultColumnTransform();
            const disabled = dropped.has(col);
            const chips = disabled ? [] : transformChips(t).filter((c) => c !== TYPE_LABEL[t.type]);
            const isActive = active === col;
            return (
              <div
                key={col}
                role="option"
                tabIndex={disabled ? -1 : 0}
                aria-selected={isActive}
                className={`clean-map__row ${disabled ? "clean-map__row--dropped" : ""} ${
                  isActive ? "clean-map__row--active" : ""
                }`}
                onClick={() => {
                  if (!disabled) setSelected(col);
                }}
                onKeyDown={(e) => {
                  if (disabled) return;
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSelected(col);
                  }
                }}
              >
                <label
                  className="clean-map__keep"
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    checked={!disabled}
                    onChange={(e) => setKept(col, e.target.checked)}
                    aria-label={`Keep ${col}`}
                  />
                </label>
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-semibold text-ink">{col}</div>
                  <div className="truncate text-[10px] text-muted">
                    {sampleFor(inputSample, col)}
                  </div>
                  {chips.length > 0 && (
                    <div className="clean-map__chips">
                      {chips.slice(0, 3).map((chip) => (
                        <span key={chip}>{chip}</span>
                      ))}
                      {chips.length > 3 && <span>+{chips.length - 3}</span>}
                    </div>
                  )}
                </div>
                <input
                  className="input clean-map__rename"
                  value={draftMap[col] ?? col}
                  disabled={disabled}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) =>
                    emit({ columnMap: { ...draftMap, [col]: e.target.value } })
                  }
                  aria-label={`Mapped name for ${col}`}
                />
                <select
                  className="input clean-map__type"
                  value={t.type}
                  disabled={disabled}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => {
                    setSelected(col);
                    const type = e.target.value as ColumnTransform["type"];
                    patchTransform(col, {
                      type,
                      ...(type === "currency"
                        ? {
                            stripCurrency: true,
                            decimals: t.decimals ?? 2,
                            currencyCode: t.currencyCode ?? "ZAR",
                            useGrouping: t.useGrouping ?? true,
                          }
                        : type === "number"
                          ? { useGrouping: t.useGrouping ?? true }
                          : {}),
                    });
                  }}
                  aria-label={`Type for ${col}`}
                >
                  <option value="auto">Auto</option>
                  <option value="string">Text</option>
                  <option value="number">Number</option>
                  <option value="currency">Currency</option>
                  <option value="boolean">Bool</option>
                  <option value="date">Date</option>
                </select>
              </div>
            );
          })}
        </div>

        <aside className="clean-map__inspector" aria-live="polite">
          {!active || !activeTransform ? (
            <div className="clean-map__inspector-empty">
              <p className="text-sm font-medium text-ink">Select a kept column</p>
              <p className="mt-1 text-xs text-muted">
                Cleaning and formatting options appear here for one column at a time.
              </p>
            </div>
          ) : (
            <>
              <div className="mb-3 border-b border-border pb-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted">
                  Clean & format
                </p>
                <h3 className="mt-0.5 truncate text-base font-semibold tracking-tight">
                  {draftMap[active] ?? active}
                </h3>
                <p className="mt-0.5 truncate text-[11px] text-muted">
                  Source: {active} · sample {sampleFor(inputSample, active)}
                </p>
              </div>

              <div className="space-y-3">
                <label className="block text-[11px] text-muted">
                  Type
                  <select
                    className="input mt-1 py-1.5 text-sm text-ink"
                    value={activeTransform.type}
                    onChange={(e) => {
                      const type = e.target.value as ColumnTransform["type"];
                      patchTransform(active, {
                        type,
                        ...(type === "currency"
                          ? {
                              stripCurrency: true,
                              decimals: activeTransform.decimals ?? 2,
                              currencyCode: activeTransform.currencyCode ?? "ZAR",
                              useGrouping: activeTransform.useGrouping ?? true,
                            }
                          : type === "number"
                            ? { useGrouping: activeTransform.useGrouping ?? true }
                            : {}),
                      });
                    }}
                  >
                    <option value="auto">Auto-detect</option>
                    <option value="string">Text</option>
                    <option value="number">Number</option>
                    <option value="currency">Currency</option>
                    <option value="boolean">True / False</option>
                    <option value="date">Date</option>
                  </select>
                </label>

                <fieldset className="clean-map__fieldset">
                  <legend>Text cleaning</legend>
                  <label className="clean-map__check">
                    <input
                      type="checkbox"
                      checked={activeTransform.trim}
                      onChange={(e) => patchTransform(active, { trim: e.target.checked })}
                    />
                    Trim spaces
                  </label>
                  <label className="block text-[11px] text-muted">
                    Case
                    <select
                      className="input mt-1 py-1 text-xs text-ink"
                      value={activeTransform.textCase}
                      onChange={(e) =>
                        patchTransform(active, {
                          textCase: e.target.value as ColumnTransform["textCase"],
                        })
                      }
                    >
                      <option value="none">No change</option>
                      <option value="lower">lowercase</option>
                      <option value="upper">UPPERCASE</option>
                      <option value="title">Title Case</option>
                    </select>
                  </label>
                  <label className="block text-[11px] text-muted">
                    Fill blanks with
                    <input
                      className="input mt-1 py-1 text-xs text-ink"
                      value={activeTransform.fillNull}
                      placeholder="Leave blank to keep empty"
                      onChange={(e) =>
                        patchTransform(active, { fillNull: e.target.value })
                      }
                    />
                  </label>
                  <label className="clean-map__check">
                    <input
                      type="checkbox"
                      checked={activeTransform.dropIfEmpty}
                      onChange={(e) =>
                        patchTransform(active, { dropIfEmpty: e.target.checked })
                      }
                    />
                    Drop whole row if this field is empty
                  </label>
                </fieldset>

                {(activeTransform.type === "number" ||
                  activeTransform.type === "currency" ||
                  activeTransform.type === "auto") && (
                  <fieldset className="clean-map__fieldset">
                    <legend>
                      {activeTransform.type === "currency" ? "Currency" : "Number"}
                    </legend>
                    {activeTransform.type === "currency" && (
                      <>
                        <p className="mb-2 text-[11px] leading-snug text-muted">
                          Parses amounts like R 1,234.50, $99, €12.00 into numbers, then
                          displays with your chosen currency. Charts and stats use the same
                          formatting.
                        </p>
                        <label className="block text-[11px] text-muted">
                          Currency
                          <select
                            className="input mt-1 py-1 text-xs text-ink"
                            value={activeTransform.currencyCode ?? "ZAR"}
                            onChange={(e) =>
                              patchTransform(active, {
                                currencyCode: e.target.value as CurrencyCode,
                                stripCurrency: true,
                              })
                            }
                          >
                            {CURRENCY_OPTIONS.map((opt) => (
                              <option key={opt.code} value={opt.code}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        </label>
                      </>
                    )}
                    <label className="block text-[11px] text-muted">
                      Decimal places
                      <input
                        className="input mt-1 py-1 text-xs text-ink"
                        type="number"
                        min={0}
                        max={8}
                        value={activeTransform.decimals ?? ""}
                        placeholder={
                          activeTransform.type === "currency" ? "2" : "No change"
                        }
                        onChange={(e) =>
                          patchTransform(active, {
                            decimals:
                              e.target.value === "" ? null : Number(e.target.value),
                          })
                        }
                      />
                    </label>
                    <label className="clean-map__check">
                      <input
                        type="checkbox"
                        checked={activeTransform.useGrouping !== false}
                        onChange={(e) =>
                          patchTransform(active, { useGrouping: e.target.checked })
                        }
                      />
                      Thousand separators (e.g. 1,234.56)
                    </label>
                    <p className="rounded-lg bg-bg px-2 py-1.5 text-[11px] text-muted">
                      Formatted sample:{" "}
                      <span className="font-semibold text-ink">
                        {formatDisplayValue(
                          sampleFor(sampleRows, active),
                          displayFormatFromTransform(activeTransform),
                        )}
                      </span>
                    </p>
                    {activeTransform.type !== "currency" && (
                      <label className="clean-map__check">
                        <input
                          type="checkbox"
                          checked={activeTransform.stripCurrency}
                          onChange={(e) =>
                            patchTransform(active, { stripCurrency: e.target.checked })
                          }
                        />
                        Strip currency / symbols before parse
                      </label>
                    )}
                  </fieldset>
                )}

                {(activeTransform.type === "date" ||
                  activeTransform.type === "auto") && (
                  <fieldset className="clean-map__fieldset">
                    <legend>Date</legend>
                    <label className="block text-[11px] text-muted">
                      Parse as
                      <select
                        className="input mt-1 py-1 text-xs text-ink"
                        value={activeTransform.dateFormat}
                        onChange={(e) =>
                          patchTransform(active, {
                            dateFormat: e.target.value as ColumnTransform["dateFormat"],
                          })
                        }
                      >
                        <option value="auto">Auto</option>
                        <option value="iso">ISO</option>
                        <option value="dmy">DD/MM/YYYY</option>
                        <option value="mdy">MM/DD/YYYY</option>
                      </select>
                    </label>
                  </fieldset>
                )}
              </div>
            </>
          )}
        </aside>
      </div>

      <section className="clean-map__preview mt-4 rounded-xl border border-border bg-white p-3">
        <h3 className="text-sm font-semibold text-ink">Transformed preview</h3>
        <p className="mt-0.5 text-[11px] text-muted">
          Live sample from your ingest — updates the moment you change type, mapping, or
          clean options.
        </p>
        {transformedPreview && transformedPreview.columns.length > 0 ? (
          <div className="mt-2 max-h-52 overflow-auto">
            <table
              className="w-full text-left text-[11px]"
              key={`preview-${draftDrop.join(",")}-${Object.keys(draftMap).length}-${Object.values(draftTransforms)
                .map((t) => t.type)
                .join(".")}`}
            >
              <thead>
                <tr className="border-b border-border text-muted">
                  {transformedPreview.columns.map((c) => (
                    <th key={c} className="px-1.5 py-1 font-semibold">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {transformedPreview.rows.slice(0, 8).map((row, i) => (
                  <tr key={i} className="border-b border-border/60">
                    {transformedPreview.columns.map((c) => (
                      <td key={c} className="px-1.5 py-1 text-ink">
                        {formatDisplayValue(row[c], outFormats[c])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {transformedPreview.rows.length === 0 ? (
              <p className="mt-2 text-[11px] text-muted">
                All sample rows were dropped by “drop if empty” rules.
              </p>
            ) : null}
          </div>
        ) : (
          <p className="mt-2 text-[11px] text-muted">
            No sample rows yet — upload or connect an ingest with data to preview transforms.
          </p>
        )}
      </section>
    </div>
  );
}
