import { getEnv } from "@/shared/config/env";
import {
  buildPayfastCheckout,
  type PayFastCheckoutFields,
} from "../domain/payfast";

/**
 * Payment gateway port.
 * PayFast is the primary adapter; ManualEft remains as offline fallback.
 */
export type PaymentIntent = {
  userId: string;
  amountCredits: number;
  reference: string;
};

export type AccessCheckoutInput = {
  userId: string;
  email: string;
  paymentReference: string;
  amountZar: number;
  itemName: string;
  returnUrl: string;
  cancelUrl: string;
  notifyUrl: string;
};

export type AccessCheckoutResult = {
  provider: "payfast" | "manual_eft";
  actionUrl: string;
  fields: PayFastCheckoutFields;
  paymentId: string;
};

export interface PaymentGateway {
  readonly name: string;
  createTopUpIntent(input: PaymentIntent): Promise<{
    intentId: string;
    status: "manual_pending";
  }>;
  createAccessCheckout?(
    input: AccessCheckoutInput,
  ): Promise<AccessCheckoutResult>;
}

export class ManualEftPaymentGateway implements PaymentGateway {
  readonly name = "manual_eft";

  async createTopUpIntent(input: PaymentIntent) {
    return {
      intentId: `eft_${input.userId}_${input.reference}`,
      status: "manual_pending" as const,
    };
  }
}

export class PayFastPaymentGateway implements PaymentGateway {
  readonly name = "payfast";

  async createTopUpIntent(input: PaymentIntent) {
    return {
      intentId: `pf_topup_${input.userId}_${input.reference}`,
      status: "manual_pending" as const,
    };
  }

  async createAccessCheckout(
    input: AccessCheckoutInput,
  ): Promise<AccessCheckoutResult> {
    const env = getEnv();
    const sandbox = env.PAYFAST_SANDBOX;
    const built = buildPayfastCheckout({
      merchantId: env.PAYFAST_MERCHANT_ID,
      merchantKey: env.PAYFAST_MERCHANT_KEY,
      passphrase: env.PAYFAST_PASSPHRASE || undefined,
      amountZar: input.amountZar,
      itemName: input.itemName,
      mPaymentId: input.paymentReference,
      email: input.email,
      returnUrl: input.returnUrl,
      cancelUrl: input.cancelUrl,
      notifyUrl: input.notifyUrl,
      customStr1: input.userId,
      customStr2: input.paymentReference,
    });
    const host = sandbox
      ? "https://sandbox.payfast.co.za"
      : "https://www.payfast.co.za";
    return {
      provider: "payfast",
      actionUrl: `${host}/eng/process`,
      fields: built.fields,
      paymentId: input.paymentReference,
    };
  }
}

export function getPaymentGateway(): PaymentGateway {
  const env = getEnv();
  if (env.PAYFAST_MERCHANT_ID && env.PAYFAST_MERCHANT_KEY) {
    return new PayFastPaymentGateway();
  }
  return new ManualEftPaymentGateway();
}

/** @deprecated prefer getPaymentGateway() */
export const paymentGateway: PaymentGateway = {
  get name() {
    return getPaymentGateway().name;
  },
  createTopUpIntent(input) {
    return getPaymentGateway().createTopUpIntent(input);
  },
  createAccessCheckout(input) {
    const g = getPaymentGateway();
    if (!g.createAccessCheckout) {
      throw new Error("PayFast is not configured");
    }
    return g.createAccessCheckout(input);
  },
};
