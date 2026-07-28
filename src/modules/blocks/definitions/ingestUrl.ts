import { lookup } from "node:dns/promises";
import net from "node:net";
import type { BlockDefinition, TabularData } from "../domain/types";
import { ingestUrlMeta } from "../catalog";

const MAX_URL_BYTES = 20 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 20_000;

export function isBlockedHostname(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return (
    h === "localhost" ||
    h.endsWith(".localhost") ||
    h === "metadata.google.internal"
  );
}

export function isBlockedIp(address: string): boolean {
  const family = net.isIP(address);
  if (family === 4) {
    const parts = address.split(".").map((p) => Number(p));
    const [a, b] = parts;
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b != null && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    return false;
  }
  if (family === 6) {
    const compact = address.toLowerCase();
    return (
      compact === "::1" ||
      compact.startsWith("fc") ||
      compact.startsWith("fd") ||
      compact.startsWith("fe80:")
    );
  }
  return false;
}

async function assertSafeUrl(url: string): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Invalid URL");
  }
  if (parsed.protocol !== "https:") {
    throw new Error("Only HTTPS URLs are allowed.");
  }
  if (!parsed.hostname || isBlockedHostname(parsed.hostname)) {
    throw new Error("This URL host is not allowed.");
  }

  const ipLiteral = net.isIP(parsed.hostname);
  if (ipLiteral && isBlockedIp(parsed.hostname)) {
    throw new Error("Private or local network URLs are not allowed.");
  }

  const records = await lookup(parsed.hostname, { all: true, verbatim: false });
  if (!records.length || records.some((r) => isBlockedIp(r.address))) {
    throw new Error("Private or local network URLs are not allowed.");
  }
  return parsed;
}

async function fetchSafeUrl(url: string): Promise<Response> {
  let current = url;
  for (let i = 0; i < 5; i++) {
    const parsed = await assertSafeUrl(current);
    const res = await fetch(parsed.toString(), {
      redirect: "manual",
      headers: { "User-Agent": "FlowlyticsConnector/1.0" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (res.status >= 300 && res.status < 400) {
      const next = res.headers.get("location");
      if (!next) throw new Error("URL redirect is missing a Location header.");
      current = new URL(next, parsed).toString();
      continue;
    }
    return res;
  }
  throw new Error("URL has too many redirects.");
}

async function fetchTableFromUrl(url: string): Promise<TabularData> {
  const { parseCsv, parseExcel } = await import("@/modules/ingest");
  const res = await fetchSafeUrl(url);
  if (!res.ok) {
    throw new Error(`URL fetch failed (${res.status})`);
  }
  const contentLength = Number(res.headers.get("content-length") ?? 0);
  if (contentLength > MAX_URL_BYTES) {
    throw new Error("URL file is too large. Maximum size is 20MB.");
  }
  const ct = (res.headers.get("content-type") || "").toLowerCase();
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.byteLength > MAX_URL_BYTES) {
    throw new Error("URL file is too large. Maximum size is 20MB.");
  }
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
    try {
      const parsed = await assertSafeUrl(url);
      const table = await fetchTableFromUrl(url);
      return {
        table,
        explanation: `Loaded ${table.rows.length} rows from ${parsed.hostname}.`,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Fetch failed";
      throw new Error(msg);
    }
  },
};
