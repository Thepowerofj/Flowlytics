"use client";

import type {
  InsightFinding,
  InsightKind,
  InsightReport,
} from "@/modules/ai/domain/insightReport";

const KIND_LABEL: Record<InsightKind, string> = {
  finding: "Finding",
  metric: "Metric",
  risk: "Watch",
  opportunity: "Opportunity",
  action: "Action",
};

type Props = {
  report: InsightReport;
  /** Smaller padding when inside config window */
  variant?: "canvas" | "panel";
};

function FindingCard({ finding }: { finding: InsightFinding }) {
  return (
    <article
      className={`ai-insight__card ai-insight__card--${finding.kind}${
        finding.priority === "high" ? " ai-insight__card--priority" : ""
      }`}
    >
      <header className="ai-insight__card-head">
        <span className={`ai-insight__badge ai-insight__badge--${finding.kind}`}>
          {KIND_LABEL[finding.kind]}
        </span>
        {finding.metric ? (
          <span className="ai-insight__metric" title="Standout value">
            {finding.metric}
          </span>
        ) : null}
      </header>
      <h4 className="ai-insight__card-title">{finding.title}</h4>
      <p className="ai-insight__card-detail">{finding.detail}</p>
    </article>
  );
}

/** Expanded canvas showcase for AI Analyse / Explain — styled like chart nodes. */
export function AiInsightShowcase({ report, variant = "canvas" }: Props) {
  const findings = report.findings.slice(0, 6);
  const steps = report.nextSteps.slice(0, 4);

  return (
    <div
      className={`ai-insight nodrag nopan ai-insight--${variant}`}
      aria-label={report.headline || "AI insights"}
    >
      <div className="ai-insight__hero">
        <p className="ai-insight__eyebrow">
          AI read-out
          {report.confidence ? (
            <span className={`ai-insight__confidence ai-insight__confidence--${report.confidence}`}>
              {report.confidence} confidence
            </span>
          ) : null}
        </p>
        <h3 className="ai-insight__headline">{report.headline}</h3>
        {report.summary ? (
          <p className="ai-insight__summary">{report.summary}</p>
        ) : null}
      </div>

      {findings.length ? (
        <div className="ai-insight__grid">
          {findings.map((f) => (
            <FindingCard key={f.id} finding={f} />
          ))}
        </div>
      ) : null}

      {steps.length ? (
        <div className="ai-insight__next">
          <p className="ai-insight__next-label">Next steps</p>
          <ol className="ai-insight__next-list">
            {steps.map((step, i) => (
              <li key={`${i}-${step}`}>
                <span className="ai-insight__next-num" aria-hidden>
                  {i + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </div>
  );
}
