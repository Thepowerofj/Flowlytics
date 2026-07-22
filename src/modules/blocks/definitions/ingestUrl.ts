import type { BlockDefinition, TabularData } from "../domain/types";
import { ingestUrlMeta } from "../catalog";

async function fetchTableFromUrl(url: string): Promise<TabularData> {
  const { parseCsv, parseExcel } = await import("@/modules/ingest");
  const res = await fetch(url, {
    redirect: "follow",
    headers: { "User-Agent": "FlowlyticsConnector/1.0" },
  });
  if (!res.ok) {
    throw new Error(`URL fetch failed (${res.status})`);
  }
  const ct = (res.headers.get("content-type") || "").toLowerCase();
  const buf = Buffer.from(await res.arrayBuffer());
  if (
    ct.includes("spreadsheet") ||
    ct.includes("excel") ||
    url.toLowerCase().endsWith(".xlsx") ||
    url.toLowerCase().endsWith(".xls")
  ) {
    return parseExcel(buf);
  }
  const text = buf.toString("utf8");
  return parseCsv(text);
}

export const ingestUrlBlock: BlockDefinition = {
  ...ingestUrlMeta,
  async run(config) {
    const url = String(config.url ?? "").trim();
    if (!url) throw new Error("Set an HTTPS URL to a CSV or Excel file.");
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error("Invalid URL");
    }
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      throw new Error("Only http(s) URLs are allowed");
    }
    try {
      const table = await fetchTableFromUrl(url);
      return {
        table,
        explanation: `Loaded ${table.rows.length} rows from URL.`,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Fetch failed";
      throw new Error(msg);
    }
  },
};
