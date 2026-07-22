import type { BlockDefinition, TabularData } from "../domain/types";
import { outputEmailMeta } from "../catalog";

export const outputEmailBlock: BlockDefinition = {
  ...outputEmailMeta,
  async run(config, inputs) {
    const { sendFlowlyticsEmail } = await import("@/modules/notify");
    const table = inputs.table as TabularData | undefined;
    const to = String(config.to ?? "").trim();
    if (!to || !to.includes("@")) {
      throw new Error("Set a valid recipient email on this activity.");
    }
    const subject = String(config.subject ?? "Flowlytics results");
    const sample =
      table && config.includeSampleRows !== false
        ? table.rows
            .slice(0, 5)
            .map((r) =>
              table.columns
                .slice(0, 4)
                .map((c) => `${c}=${r[c] ?? ""}`)
                .join(", "),
            )
            .join("<br/>")
        : "";

    const bodyHtml = `
      <p>${
        table
          ? `Your pipeline produced <strong>${table.rows.length}</strong> rows × <strong>${table.columns.length}</strong> columns.`
          : "Your pipeline finished."
      }</p>
      ${sample ? `<p><strong>Sample rows</strong></p><p style="font-family:monospace;font-size:12px;">${sample}</p>` : ""}
      <p>Open Flowlytics to download the full results.</p>
    `;

    const result = await sendFlowlyticsEmail({
      to,
      subject,
      content: {
        title: subject,
        bodyHtml,
        cta: {
          label: "Open Flowlytics",
          href: process.env.AUTH_URL || "http://localhost:3000",
        },
      },
    });

    return {
      table: table ?? { columns: [], rows: [] },
      explanation: result.sent
        ? `Email sent to ${to}.`
        : `Email queued/logged for ${to} (SMTP may be unset in this environment).`,
    };
  },
};
