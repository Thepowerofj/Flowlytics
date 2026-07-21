"use client";

import { useState } from "react";
import { NodeResizer, Position, type NodeProps, type Node } from "@xyflow/react";
import {
  describeAggregate,
  type AggregateMetric,
} from "@/modules/analyse/domain/aggregate";
import { buildChartSpec, summarizeForNode, type ChartSpec } from "@/modules/analyse/domain/charts";
import {
  buildForecast,
  type ForecastMethod,
} from "@/modules/analyse/domain/forecast";
import { buildForecastInsights } from "@/modules/analyse/domain/insights";
import { computeStats, type ColumnStats } from "@/modules/analyse/domain/stats";
import {
  resolveValueFormat,
  type ColumnDisplayFormat,
} from "@/modules/ingest/domain/columnFormat";
import type { ActivityNodeData } from "./types";
import { tablePreview } from "./types";
import { needsConfigWindow, portsFor } from "./ports";
import { iconForBlock } from "./activityMeta";
import { MiniChart } from "./MiniChart";
import { LabeledHandle } from "./LabeledHandle";
import {
  normalizeInsightReport,
  parseInsightReportReply,
  type InsightReport,
} from "@/modules/ai/domain/insightReport";
import { AiInsightShowcase } from "./AiInsightShowcase";
import { ForecastKpiStrip } from "./InsightCard";
import { StatsInfoBlock } from "./StatsInfoBlock";
import { StructureOutputPanel } from "./StructureOutputPanel";

function columnFormatsOf(
  config: Record<string, unknown>,
): Record<string, ColumnDisplayFormat> {
  const raw = config._columnFormats;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, ColumnDisplayFormat>;
  }
  return {};
}

/** True when the activity is showing a canvas preview sample, not a full Run result. */
function showsPreviewSample(data: ActivityNodeData): boolean {
  if (data.blockType === "ingest.csv_excel") return false;
  return data.config._previewSample === true && Boolean(tablePreview(data.config));
}

type ActivityNodeType = Node<ActivityNodeData, "activity">;

const CATEGORY: Record<string, { label: string; color: string }> = {
  ingest: { label: "Ingest", color: "#0D9488" },
  transform: { label: "Transform", color: "#3D5A52" },
  analyse: { label: "Analyse", color: "#0F766E" },
  ai: { label: "AI", color: "#A16207" },
  output: { label: "Output", color: "#027A48" },
};

const DEFAULT_CHART = { w: 480, h: 420 };
const DEFAULT_STATS = { w: 340, h: 340 };
const DEFAULT_INSIGHT = { w: 440, h: 400 };

function insightReportFromConfig(
  config: Record<string, unknown>,
): InsightReport | null {
  const structured = normalizeInsightReport(config.insightReport);
  if (structured) return structured;
  if (typeof config.explanation === "string" && config.explanation.trim()) {
    return parseInsightReportReply(config.explanation);
  }
  if (Array.isArray(config.insights) && config.insights.length) {
    return parseInsightReportReply(
      (config.insights as string[]).map((l) => `• ${l}`).join("\n"),
    );
  }
  return null;
}

function categoryOf(type: string) {
  const key = type.split(".")[0] ?? "analyse";
  return CATEGORY[key] ?? CATEGORY.analyse;
}

function summaryFor(data: ActivityNodeData): string {
  const table = tablePreview(data.config);
  const cols = table?.columns ?? (data.config._sourceColumns as string[]) ?? [];

  if (data.blockType === "ingest.csv_excel") {
    if (data.config.uploadError) return "Upload issue — open for details";
    const name = (data.config.fileName as string) || "";
    if (!name) return "No file yet — open to upload";
    const sheet = (data.config.excelSheet as string) || "";
    if (table) {
      return sheet
        ? `${name} · ${sheet} · ${table.rows.length} rows`
        : `${name} · ${table.rows.length} rows (full file)`;
    }
    return sheet ? `${name} · ${sheet}` : name;
  }
  if (data.blockType === "transform.clean_map") {
    if (!cols.length) return "Wire an ingest · then clean & map";
    const dropped = ((data.config.dropColumns as string[]) ?? []).length;
    return `${cols.length - dropped} columns out · clean & types`;
  }
  if (data.blockType === "transform.aggregate") {
    if (!cols.length) return "Wire upstream · then group & sum";
    return describeAggregate({
      groupBy: (data.config.groupBy as string[]) ?? [],
      metrics: (data.config.metrics as AggregateMetric[]) ?? [],
    });
  }
  if (data.blockType === "output.structure") {
    if (!cols.length) return "Wire upstream · then choose export columns";
    const selected = (data.config.selectedColumns as string[]) ?? cols;
    return `${selected.length} columns for export`;
  }
  if (data.blockType === "analyse.projection") {
    const col = (data.config.column as string) || "";
    const method = (data.config.method as string) || "trend";
    return col ? `Forecast ${col} · ${method}` : "Choose numeric column";
  }
  if (data.blockType === "analyse.chart") {
    if (!table) return "Connect data · then pick a chart";
    const kind = (data.config.chartType as string) || "chart";
    return data.config._previewSample
      ? `${kind} · preview sample`
      : `${kind} · ${table.rows.length} rows`;
  }
  if (data.blockType === "analyse.stats") {
    if (!table) return "Connect data · open for summary";
    return data.config._previewSample
      ? `Preview · ${table.rows.length} rows · ${table.columns.length} cols`
      : `Full run · ${table.rows.length} rows · ${table.columns.length} columns`;
  }
  if (data.blockType.startsWith("ai.")) {
    if (data.blockType === "ai.structure") {
      const cols = Array.isArray(data.config.outputColumns)
        ? data.config.outputColumns
        : [];
      const names = cols
        .map((c) =>
          c && typeof c === "object" && "name" in c
            ? String((c as { name: unknown }).name)
            : "",
        )
        .filter(Boolean);
      if (names.length) {
        const preview = names.slice(0, 3).join(", ");
        return data.config.aiOptIn
          ? `Schema: ${preview}${names.length > 3 ? "…" : ""} · ready`
          : `Schema: ${preview}${names.length > 3 ? "…" : ""} · enable AI`;
      }
    }
    if (data.config.explanation || (Array.isArray(data.config.insights) && data.config.insights.length)) {
      return "Insights ready · open for full read-out";
    }
    return data.config.aiOptIn ? "AI ready · Run for insights" : "Open to enable AI";
  }
  if (cols.length) return `${cols.length} columns ready`;
  return "Connect upstream to auto-map";
}

export function ActivityNode({
  id,
  data,
  selected,
  width: rfWidth,
  height: rfHeight,
}: NodeProps<ActivityNodeType>) {
  const status = data.runStatus ?? "idle";
  const cat = categoryOf(data.blockType);
  const ports = portsFor(data.blockType);
  const showConfig = needsConfigWindow(data.blockType);
  const table = tablePreview(data.config);
  const formats = columnFormatsOf(data.config);
  const previewSample = showsPreviewSample(data);
  const [resizing, setResizing] = useState(false);
  const [liveSize, setLiveSize] = useState<{ w: number; h: number } | null>(null);

  let chartPreview: ChartSpec | null = null;
  let forecastKpis: {
    lastActual: number | null;
    nextForecast: number | null;
    changePct: number | null;
  } | null = null;
  const measureCol = (data.config.column as string) || "";
  const forecastFormat =
    resolveValueFormat(formats, measureCol) ??
    ({ kind: "number", useGrouping: true } as const);

  if (data.blockType === "analyse.chart" && table) {
    const runChart = data.config._runChart as ChartSpec | undefined;
    chartPreview =
      runChart?.points?.length
        ? { ...runChart, valueFormat: runChart.valueFormat ?? formats[String(data.config.yColumn ?? "")] }
        : buildChartSpec(table, {
            chartType: data.config.chartType as "bar" | "line" | "pie" | undefined,
            xColumn: (data.config.xColumn as string) || undefined,
            yColumn: (data.config.yColumn as string) || undefined,
            suggestionId: (data.config.suggestionId as string) || undefined,
            columnFormats: formats,
          });
  } else if (data.blockType === "analyse.projection" && table) {
    const runChart = data.config._runChart as ChartSpec | undefined;
    const runOut = data.config._runOutputTable as
      | { columns: string[]; rows: Record<string, string | number | null>[] }
      | undefined;
    const runProj = data.config._runProjection as
      | { kpis?: { lastActual: number | null; nextForecast: number | null; changePct: number | null } }
      | undefined;
    if (runProj?.kpis) forecastKpis = runProj.kpis;

    if (runChart?.points?.length) {
      chartPreview = {
        ...runChart,
        valueFormat: runChart.valueFormat ?? forecastFormat,
      };
    } else if (runOut?.columns?.includes("series") && runOut.columns.includes("value")) {
      const col = measureCol || "value";
      chartPreview = {
        type: "line",
        title: `Forecast · ${col}`,
        xLabel: "Period",
        yLabel: col,
        forecastSplit: true,
        valueFormat: forecastFormat,
        points: runOut.rows.map((r) => ({
          x: String(r.period ?? ""),
          y: Number(r.value) || 0,
          series: (r.series === "Forecast" ? "Forecast" : "Actual") as
            | "Actual"
            | "Forecast",
          low: r.low == null ? null : Number(r.low),
          high: r.high == null ? null : Number(r.high),
        })),
      };
    } else {
      const col = measureCol;
      if (col) {
        try {
          const result = buildForecast(table, {
            column: col,
            periodColumn: (data.config.periodColumn as string) || undefined,
            periods: Number(data.config.periods ?? 3),
            futureMode: (data.config.futureMode as string) || "count",
            untilDate: (data.config.untilDate as string) || "",
            customFutureDates: (data.config.customFutureDates as string) || "",
            method: (data.config.method as ForecastMethod) || "trend",
            window: Number(data.config.window ?? 3),
            seasonLength: Number(data.config.seasonLength ?? 12),
            alpha: Number(data.config.alpha ?? 0.3),
            confidenceBand: data.config.confidenceBand !== false,
          });
          if (result.actual.length >= 2) {
            const { insights, kpis } = buildForecastInsights(result, forecastFormat);
            forecastKpis = kpis;
            chartPreview = {
              type: "line",
              title: `Forecast · ${col}`,
              xLabel: "Period",
              yLabel: col,
              forecastSplit: true,
              valueFormat: forecastFormat,
              insights: insights.map((i) => `${i.title}: ${i.detail}`),
              points: result.points.map((p) => ({
                x: p.period,
                y: p.value,
                series: p.series,
                low: p.low,
                high: p.high,
              })),
            };
          }
        } catch {
          chartPreview = null;
        }
      }
    }
  }

  const isChartShowcase = Boolean(chartPreview?.points.length);
  const isStatsBlock = data.blockType === "analyse.stats" && Boolean(table);
  const aiReport =
    data.blockType === "ai.analyse" || data.blockType === "ai.explain"
      ? insightReportFromConfig(data.config)
      : null;
  const isAiInsight = Boolean(aiReport);
  const isStructure = data.blockType === "output.structure";
  const isForecast = data.blockType === "analyse.projection";
  const runStats = data.config._runStats as ColumnStats[] | undefined;
  const columnStats =
    isStatsBlock && table
      ? runStats?.length
        ? runStats
        : computeStats(table)
      : [];
  const statsSummary =
    isStatsBlock && table
      ? Array.isArray(data.config.insights) && data.config.insights.length
        ? {
            rows: table.rows.length,
            columns: table.columns.length,
            highlights: data.config.insights as string[],
          }
        : summarizeForNode(table, formats)
      : null;
  const structureCols = table?.columns ?? (data.config._sourceColumns as string[]) ?? [];
  const structureSelected = (
    (data.config.selectedColumns as string[]) ?? structureCols
  ).filter((c) => structureCols.includes(c));

  const resizable = isChartShowcase || isStatsBlock || isAiInsight;
  const defaultSize = isChartShowcase
    ? DEFAULT_CHART
    : isAiInsight
      ? DEFAULT_INSIGHT
      : DEFAULT_STATS;
  const savedW = Number(data.config.nodeWidth) || defaultSize.w;
  const savedH = Number(data.config.nodeHeight) || defaultSize.h;
  // Prefer live drag size, then RF measured size, then saved config — fill parent, don't fight the resizer
  const nodeW = liveSize?.w || rfWidth || savedW;
  const nodeH = liveSize?.h || rfHeight || savedH;

  const statusClass =
    status === "running"
      ? "activity-node--run-active node-running"
      : status === "failed"
        ? "activity-node--run-failed"
        : status === "succeeded"
          ? "activity-node--run-done"
          : status === "pending"
            ? "activity-node--run-pending"
            : "";

  const statusBadge =
    status === "running"
      ? "Running"
      : status === "failed"
        ? "Failed"
        : status === "succeeded"
          ? "Done"
          : status === "pending"
            ? "Queued"
            : null;

  return (
    <div
      className={`activity-node settle ${resizable ? "activity-node--showcase" : ""} ${
        isChartShowcase ? "activity-node--chart" : ""
      } ${isStatsBlock ? "activity-node--stats" : ""} ${
        isAiInsight ? "activity-node--ai-showcase" : ""
      } ${isStructure ? "activity-node--structure" : ""} ${
        isForecast && isChartShowcase ? "activity-node--forecast" : ""
      } ${statusClass} ${selected ? "activity-node--selected" : ""} ${
        resizing ? "activity-node--resizing" : ""
      }`}
      style={resizable ? { width: "100%", height: "100%" } : undefined}
      data-size={`${Math.round(nodeW)}x${Math.round(nodeH)}`}
      data-run-status={status}
      onDoubleClick={() => data.onOpenConfig?.(id)}
    >
      {resizable && (
        <NodeResizer
          isVisible={selected || resizing}
          minWidth={isChartShowcase || isAiInsight ? 360 : 280}
          minHeight={isChartShowcase || isAiInsight ? 280 : 240}
          maxWidth={720}
          maxHeight={560}
          color="#0D9488"
          handleStyle={{
            width: 12,
            height: 12,
            borderRadius: 3,
            border: "2px solid #fff",
            background: "#0D9488",
            boxShadow: "0 0 0 1px rgba(13,148,136,0.45)",
          }}
          lineStyle={{
            borderWidth: 2,
            borderColor: "rgba(13, 148, 136, 0.85)",
            borderStyle: "solid",
          }}
          onResizeStart={() => setResizing(true)}
          onResize={(_e, params) => {
            setLiveSize({
              w: Math.round(params.width),
              h: Math.round(params.height),
            });
          }}
          onResizeEnd={(_e, params) => {
            const w = Math.round(params.width);
            const h = Math.round(params.height);
            setLiveSize({ w, h });
            setResizing(false);
            data.onChangeConfig?.(id, {
              nodeWidth: w,
              nodeHeight: h,
            });
          }}
        />
      )}

      {ports.hasInput && (
        <LabeledHandle type="target" position={Position.Left} id="table" label="In" />
      )}

      <button
        type="button"
        className="activity-node__delete nodrag nopan"
        title="Delete activity"
        aria-label={`Delete ${data.label}`}
        onClick={(e) => {
          e.stopPropagation();
          data.onDelete?.(id);
        }}
      >
        ×
      </button>

      {statusBadge ? (
        <span className={`activity-node__run-badge activity-node__run-badge--${status}`}>
          {status === "running" ? <span className="activity-node__run-pulse" aria-hidden /> : null}
          {statusBadge}
        </span>
      ) : null}

      {previewSample ? (
        <span
          className="activity-node__sample-dot nodrag nopan"
          title="Preview sample — click Run for the full dataset"
          aria-label="Preview sample. Click Run for the full dataset."
          role="img"
        />
      ) : null}

      <div className="activity-node__clip">
        <div className="activity-node__header">
          <span
            className="activity-node__icon"
            style={{ color: cat.color, background: `${cat.color}14` }}
            aria-hidden
          >
            {iconForBlock(data.blockType)}
          </span>
          <div className="min-w-0 flex-1 pr-5">
            <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">
              {cat.label}
            </div>
            <div className="truncate text-[13px] font-semibold tracking-tight text-ink">
              {typeof data.config.datasetName === "string" &&
              data.config.datasetName.trim()
                ? data.config.datasetName.trim()
                : data.label}
            </div>
            {typeof data.config.datasetName === "string" &&
            data.config.datasetName.trim() &&
            data.config.datasetName.trim() !== data.label ? (
              <div className="truncate text-[10px] text-muted">{data.label}</div>
            ) : null}
          </div>
        </div>

        <div className="activity-node__body nodrag nopan">
          {isChartShowcase && chartPreview ? (
            <>
              <MiniChart chart={chartPreview} size="lg" interactive />
              {isForecast && forecastKpis ? (
                <ForecastKpiStrip
                  lastActual={forecastKpis.lastActual}
                  nextForecast={forecastKpis.nextForecast}
                  changePct={forecastKpis.changePct}
                  valueFormat={forecastFormat}
                />
              ) : null}
            </>
          ) : statsSummary ? (
            <StatsInfoBlock
              summary={statsSummary}
              stats={columnStats}
              columnFormats={formats}
            />
          ) : isAiInsight && aiReport ? (
            <AiInsightShowcase report={aiReport} />
          ) : isStructure ? (
            <StructureOutputPanel
              compact
              columns={structureCols}
              selectedColumns={structureSelected}
              fileName={(data.config.fileName as string) || "flowlytics-export.csv"}
              table={table}
              columnFormats={formats}
              previewSample={previewSample}
              onEdit={() => data.onOpenConfig?.(id)}
            />
          ) : (
            <p className="text-[11px] leading-snug text-muted">{summaryFor(data)}</p>
          )}

          {showConfig && !isStructure && (
            <button
              type="button"
              className="btn btn-sm btn-secondary w-full shrink-0"
              onClick={() => data.onOpenConfig?.(id)}
            >
              {data.blockType === "ingest.csv_excel"
                ? "Open · upload"
                : data.blockType === "transform.clean_map"
                  ? "Open · clean & map"
                  : data.blockType === "transform.aggregate"
                    ? "Open · aggregate"
                    : data.blockType === "analyse.chart"
                      ? isChartShowcase
                        ? "Edit chart"
                        : "Choose chart"
                      : data.blockType === "analyse.projection"
                        ? isChartShowcase
                          ? "Edit forecast"
                          : "Configure forecast"
                        : data.blockType === "analyse.stats"
                          ? "Edit summary"
                          : data.blockType === "ai.analyse" ||
                              data.blockType === "ai.explain"
                            ? isAiInsight
                              ? "Open · full insights"
                              : "Open · enable AI"
                            : "Open · configure"}
            </button>
          )}
        </div>
      </div>

      {ports.hasOutput && (
        <LabeledHandle type="source" position={Position.Right} id="table" label="Out" />
      )}
    </div>
  );
}
