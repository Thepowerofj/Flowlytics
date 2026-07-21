/**
 * Payment gateway port — stubbed for v1.
 * Operator credits wallets manually after EFT; swap this adapter when a provider is approved.
 */
export type PaymentIntent = {
  userId: string;
  amountCredits: number;
  reference: string;
};

export interface PaymentGateway {
  readonly name: string;
  createTopUpIntent(input: PaymentIntent): Promise<{ intentId: string; status: "manual_pending" }>;
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

export const paymentGateway: PaymentGateway = new ManualEftPaymentGateway();
