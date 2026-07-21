const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const PHONE = /(?:\+?\d{1,3}[\s-]?)?(?:\(?\d{2,3}\)?[\s-]?)?\d{3}[\s-]?\d{4}/;
const SA_ID = /\b\d{13}\b/;

export type PiiFinding = {
  column: string;
  kind: "email" | "phone" | "sa_id_like";
  sample: string;
};

export function detectPiiInTable(
  columns: string[],
  rows: Record<string, string | number | null>[],
): PiiFinding[] {
  const findings: PiiFinding[] = [];
  const sampleRows = rows.slice(0, 50);

  for (const column of columns) {
    for (const row of sampleRows) {
      const raw = row[column];
      if (raw == null) continue;
      const value = String(raw);
      if (EMAIL.test(value)) {
        findings.push({ column, kind: "email", sample: value });
        break;
      }
      if (SA_ID.test(value)) {
        findings.push({ column, kind: "sa_id_like", sample: value });
        break;
      }
      if (PHONE.test(value) && value.replace(/\D/g, "").length >= 10) {
        findings.push({ column, kind: "phone", sample: value });
        break;
      }
    }
  }

  return findings;
}

export const DATA_DISCLAIMER =
  "Flowlytics is not responsible for personal or sensitive data you choose to upload. Prefer anonymised business data. Detection of personal data is best-effort only and may miss items.";
