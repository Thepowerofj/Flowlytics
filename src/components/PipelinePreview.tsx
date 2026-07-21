"use client";

/**
 * Decorative looping demo of a Flowlytics pipeline for the marketing home page.
 * Nodes and connectors share one flex row so arrows always meet the handles.
 */
function Connector({ step }: { step: 1 | 2 }) {
  return (
    <div
      className={`pipeline-preview__connector pipeline-preview__connector--${step}`}
      aria-hidden
    >
      <svg
        className="pipeline-preview__connector-svg"
        viewBox="0 0 64 24"
        preserveAspectRatio="none"
      >
        <path
          className={`pipeline-preview__edge pipeline-preview__edge--${step}`}
          d="M2 12 H50"
          fill="none"
          stroke="#0D9488"
          strokeWidth="2.5"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        <path
          className={`pipeline-preview__arrowhead pipeline-preview__arrowhead--${step}`}
          d="M48 7.5 L62 12 L48 16.5 Z"
          fill="#0D9488"
        />
        <circle
          className={`pipeline-preview__pulse pipeline-preview__pulse--${step}`}
          r="3.5"
          cx="2"
          cy="12"
          fill={step === 1 ? "#0D9488" : "#0F766E"}
        />
      </svg>
    </div>
  );
}

export function PipelinePreview() {
  return (
    <div className="pipeline-preview" aria-hidden>
      <div className="pipeline-preview__canvas">
        <div className="pipeline-preview__flow">
          <article className="pipeline-preview__node pipeline-preview__node--1">
            <span className="pipeline-preview__cat" style={{ color: "#0D9488" }}>
              Ingest
            </span>
            <strong>Spreadsheet</strong>
            <p>sales_q2.xlsx · 248 rows</p>
            <span className="pipeline-preview__handle pipeline-preview__handle--out" />
          </article>

          <Connector step={1} />

          <article className="pipeline-preview__node pipeline-preview__node--2">
            <span className="pipeline-preview__handle pipeline-preview__handle--in" />
            <span className="pipeline-preview__cat" style={{ color: "#3D5A52" }}>
              Transform
            </span>
            <strong>Clean / Map</strong>
            <p>6 columns · types set</p>
            <span className="pipeline-preview__handle pipeline-preview__handle--out" />
          </article>

          <Connector step={2} />

          <article className="pipeline-preview__node pipeline-preview__node--3">
            <span className="pipeline-preview__handle pipeline-preview__handle--in" />
            <span className="pipeline-preview__cat" style={{ color: "#0F766E" }}>
              Analyse
            </span>
            <strong>Chart</strong>
            <div className="pipeline-preview__bars">
              <span style={{ ["--h" as string]: "42%" }} />
              <span style={{ ["--h" as string]: "68%" }} />
              <span style={{ ["--h" as string]: "55%" }} />
              <span style={{ ["--h" as string]: "86%" }} />
              <span style={{ ["--h" as string]: "72%" }} />
            </div>
          </article>
        </div>
      </div>
      <p className="pipeline-preview__caption">
        Ingest → clean → chart — watch data move through your flow
      </p>
    </div>
  );
}
