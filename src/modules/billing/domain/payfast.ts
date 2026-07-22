import { createHash } from "crypto";

export type PayFastCheckoutFields = Record<string, string>;

/** Build PayFast signature (MD5) over ordered param pairs + optional passphrase. */
export function payfastSignature(
  fields: Record<string, string>,
  passphrase?: string,
): string {
  const keys = Object.keys(fields)
    .filter((k) => k !== "signature" && fields[k] !== "" && fields[k] != null)
    .sort();
  const pairs = keys.map(
    (k) => `${k}=${encodeURIComponent(fields[k]!).replace(/%20/g, "+")}`,
  );
  let paramString = pairs.join("&");
  if (passphrase) {
    paramString += `&passphrase=${encodeURIComponent(passphrase).replace(/%20/g, "+")}`;
  }
  return createHash("md5").update(paramString).digest("hex");
}

export function verifyPayfastSignature(
  fields: Record<string, string>,
  passphrase?: string,
): boolean {
  const provided = (fields.signature || "").toLowerCase();
  if (!provided) return false;
  const expected = payfastSignature(fields, passphrase).toLowerCase();
  return provided === expected;
}

export function payfastHost(sandbox: boolean): string {
  return sandbox ? "https://sandbox.payfast.co.za" : "https://www.payfast.co.za";
}

export function buildPayfastCheckout(input: {
  merchantId: string;
  merchantKey: string;
  passphrase?: string;
  amountZar: number;
  itemName: string;
  mPaymentId: string;
  email: string;
  returnUrl: string;
  cancelUrl: string;
  notifyUrl: string;
  customStr1?: string; // userId
  customStr2?: string; // eftReference
}): { actionUrl: string; fields: PayFastCheckoutFields } {
  const fields: PayFastCheckoutFields = {
    merchant_id: input.merchantId,
    merchant_key: input.merchantKey,
    return_url: input.returnUrl,
    cancel_url: input.cancelUrl,
    notify_url: input.notifyUrl,
    m_payment_id: input.mPaymentId,
    amount: input.amountZar.toFixed(2),
    item_name: input.itemName.slice(0, 100),
    email_address: input.email,
  };
  if (input.customStr1) fields.custom_str1 = input.customStr1;
  if (input.customStr2) fields.custom_str2 = input.customStr2;
  fields.signature = payfastSignature(fields, input.passphrase);
  return {
    actionUrl: `${payfastHost(false)}/eng/process`,
    fields,
  };
}
