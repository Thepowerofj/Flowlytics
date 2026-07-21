import { randomInt } from "crypto";

/**
 * Unambiguous alphabet for bank payment references.
 * Excludes 0/O, 1/I/L so users (and tellers) mis-type less often.
 */
const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

/** Display + stored form: FL-XXXXXX (8 visible chars + hyphen). */
export const PAYMENT_REF_PREFIX = "FL";
export const PAYMENT_REF_BODY_LEN = 6;

/** Generate a short distinct EFT reference, e.g. FL-K7M3PQ */
export function generatePaymentReference(): string {
  let body = "";
  for (let i = 0; i < PAYMENT_REF_BODY_LEN; i++) {
    body += ALPHABET[randomInt(ALPHABET.length)]!;
  }
  return formatPaymentReference(`${PAYMENT_REF_PREFIX}${body}`);
}

/** Normalize user/admin input for lookup (case, spaces, hyphens). */
export function normalizePaymentReference(raw: string): string {
  const compact = String(raw ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  if (!compact) return "";
  // Accept bare body or full code
  if (compact.startsWith(PAYMENT_REF_PREFIX) && compact.length >= 3) {
    return formatPaymentReference(compact);
  }
  if (compact.length === PAYMENT_REF_BODY_LEN) {
    return formatPaymentReference(`${PAYMENT_REF_PREFIX}${compact}`);
  }
  return formatPaymentReference(compact);
}

export function formatPaymentReference(raw: string): string {
  const compact = String(raw ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  if (compact.length <= 2) return compact;
  // FL + rest → FL-REST
  if (compact.startsWith(PAYMENT_REF_PREFIX)) {
    return `${PAYMENT_REF_PREFIX}-${compact.slice(PAYMENT_REF_PREFIX.length)}`;
  }
  return compact;
}

/** True when a string looks like our payment reference. */
export function looksLikePaymentReference(raw: string): boolean {
  const n = normalizePaymentReference(raw);
  return /^FL-[2-9A-HJ-NP-Z]{6}$/.test(n);
}

export function paymentReferenceHint(reference: string): string {
  return `Use payment reference ${formatPaymentReference(reference)} (not your email)`;
}
