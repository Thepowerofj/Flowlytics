type Props = {
  compact?: boolean;
};

/** Explains why schedules are limited until external ingest exists. */
export function ScheduleEarlyAccessNotice({ compact = false }: Props) {
  return (
    <div
      className={`schedule-early-notice ${compact ? "schedule-early-notice--compact" : ""}`}
      role="note"
    >
      <span className="schedule-early-notice__badge">Early</span>
      <p className="schedule-early-notice__text">
        {compact
          ? "Schedules re-run the same uploaded files. External connections aren’t available yet."
          : "Pipelines can’t pull from external sources yet, so a schedule only re-runs the data already on the canvas (same uploads). Useful for testing the runner — live connectors come later."}
      </p>
    </div>
  );
}
