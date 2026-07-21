import { getEnv } from "@/shared/config/env";
import { p, strongLine, escapeHtml } from "../domain/emailLayout";
import { appBaseUrl, sendFlowlyticsEmail } from "./sendEmail";

function adminRecipients(): string[] {
  return getEnv()
    .ADMIN_EMAILS.split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export async function sendWelcomeEmail(input: {
  to: string;
  name?: string | null;
  paymentReference: string;
}) {
  const base = appBaseUrl();
  const greet = input.name?.trim() ? `Hi ${input.name.trim()},` : "Welcome,";
  return sendFlowlyticsEmail({
    to: input.to,
    subject: "Welcome to Flowlytics — your payment reference",
    content: {
      preheader: `Your payment reference is ${input.paymentReference}`,
      title: "Welcome to Flowlytics",
      bodyHtml: [
        p(`${greet}`),
        p(
          "Your account is ready. To unlock the product, pay by EFT using the short reference below (not your email), then declare payment on Billing.",
        ),
        `<p style="margin:16px 0;padding:14px 16px;background:#F4F7F6;border:1px solid #E2EAE6;border-radius:12px;font-family:ui-monospace,Menlo,monospace;font-size:22px;font-weight:700;letter-spacing:0.12em;color:#0F1F1C;text-align:center;">${escapeHtml(input.paymentReference)}</p>`,
        p("After an admin confirms your deposit, you’ll get access for your paid window."),
      ].join(""),
      cta: { label: "Open Billing", href: `${base}/billing` },
      footerNote: "Keep this reference handy for your bank transfer.",
    },
  });
}

export async function sendPasswordResetEmail(input: {
  to: string;
  resetUrl: string;
}) {
  return sendFlowlyticsEmail({
    to: input.to,
    subject: "Reset your Flowlytics password",
    content: {
      preheader: "Use this link within the next hour to choose a new password.",
      title: "Reset your password",
      bodyHtml: [
        p("We received a request to reset your Flowlytics password."),
        p("Click the button below to choose a new one. This link expires in 1 hour."),
        p("If you didn’t ask for this, you can ignore this email — your password stays the same."),
      ].join(""),
      cta: { label: "Choose a new password", href: input.resetUrl },
    },
  });
}

export async function sendPasswordChangedEmail(input: { to: string }) {
  const base = appBaseUrl();
  return sendFlowlyticsEmail({
    to: input.to,
    subject: "Your Flowlytics password was changed",
    content: {
      title: "Password updated",
      bodyHtml: [
        p("Your Flowlytics password was changed successfully."),
        p("If this wasn’t you, reset it again immediately and contact info@flowlytics.co.za."),
      ].join(""),
      cta: { label: "Sign in", href: `${base}/login` },
    },
  });
}

export async function sendEftDeclaredEmail(input: {
  to: string;
  paymentReference: string;
  note?: string | null;
}) {
  const base = appBaseUrl();
  return sendFlowlyticsEmail({
    to: input.to,
    subject: "We’ve recorded your EFT declaration",
    content: {
      preheader: `Reference ${input.paymentReference} — awaiting activation`,
      title: "Payment declaration received",
      bodyHtml: [
        p("Thanks — we’ve noted that you’ve completed your EFT."),
        strongLine("Payment reference", input.paymentReference),
        input.note ? strongLine("Your note", input.note) : "",
        p("An admin will match the deposit and activate your access. You’ll get another email when you’re unlocked."),
      ].join(""),
      cta: { label: "View Billing", href: `${base}/billing` },
    },
  });
}

export async function sendEftDeclaredAdminEmail(input: {
  userEmail: string;
  paymentReference: string;
  note?: string | null;
}) {
  if (!getEnv().MAIL_NOTIFY_ADMIN_ON_EFT) return { sent: false };
  const to = adminRecipients();
  if (!to.length) return { sent: false };
  const base = appBaseUrl();
  return sendFlowlyticsEmail({
    to,
    subject: `EFT declared · ${input.paymentReference}`,
    content: {
      title: "User declared EFT payment",
      bodyHtml: [
        strongLine("User", input.userEmail),
        strongLine("Payment reference", input.paymentReference),
        input.note ? strongLine("Note", input.note) : "",
        p("Activate them from the Admin panel after you see the deposit."),
      ].join(""),
      cta: { label: "Open Admin", href: `${base}/admin` },
    },
  });
}

export async function sendAccessActivatedEmail(input: {
  to: string;
  days: number;
  expiresAt: Date;
  paymentReference?: string | null;
}) {
  const base = appBaseUrl();
  return sendFlowlyticsEmail({
    to: input.to,
    subject: "Your Flowlytics access is active",
    content: {
      preheader: `Access for ${input.days} days — start building flows`,
      title: "You’re unlocked",
      bodyHtml: [
        p(`Great news — your Flowlytics access is active for ${input.days} days.`),
        strongLine("Access until", input.expiresAt.toUTCString()),
        input.paymentReference
          ? strongLine("Payment reference", input.paymentReference)
          : "",
        p("You can create flows, run pipelines, and (optionally) use AI with your own API key in Settings."),
      ].join(""),
      cta: { label: "Go to your flows", href: `${base}/home` },
    },
  });
}

export async function sendAccessExpiredEmail(input: {
  to: string;
  paymentReference?: string | null;
}) {
  const base = appBaseUrl();
  return sendFlowlyticsEmail({
    to: input.to,
    subject: "Your Flowlytics access has ended",
    content: {
      title: "Access window ended",
      bodyHtml: [
        p("Your paid access window has ended. You can still sign in to renew."),
        input.paymentReference
          ? p(
              `Pay by EFT again using reference ${input.paymentReference}, then declare payment on Billing.`,
            )
          : p("Open Billing to see your payment reference and renew."),
      ].join(""),
      cta: { label: "Renew on Billing", href: `${base}/billing` },
    },
  });
}

export async function sendRunFailedEmail(input: {
  to: string;
  flowName: string;
  flowId: string;
  runId: string;
  errorMessage: string;
  failedActivity?: string | null;
}) {
  if (!getEnv().MAIL_NOTIFY_RUN_FAILURE) return { sent: false };
  const base = appBaseUrl();
  return sendFlowlyticsEmail({
    to: input.to,
    subject: `Pipeline failed · ${input.flowName}`,
    content: {
      preheader: input.errorMessage.slice(0, 120),
      title: "A pipeline run failed",
      bodyHtml: [
        p(`Your flow “${input.flowName}” didn’t finish.`),
        input.failedActivity
          ? strongLine("Failed activity", input.failedActivity)
          : "",
        strongLine("Error", input.errorMessage),
        p("Open the canvas to fix the step and retry from the failed activity."),
      ].join(""),
      cta: {
        label: "Open flow",
        href: `${base}/flows/${input.flowId}`,
      },
      footerNote: `Run id: ${input.runId}`,
    },
  });
}

export async function sendRunSucceededEmail(input: {
  to: string;
  flowName: string;
  flowId: string;
  runId: string;
}) {
  if (!getEnv().MAIL_NOTIFY_RUN_SUCCESS) return { sent: false };
  const base = appBaseUrl();
  return sendFlowlyticsEmail({
    to: input.to,
    subject: `Pipeline finished · ${input.flowName}`,
    content: {
      title: "Pipeline run completed",
      bodyHtml: [
        p(`Your flow “${input.flowName}” finished successfully.`),
        p("Open Results on the canvas to download tables or review insights."),
      ].join(""),
      cta: {
        label: "View results",
        href: `${base}/flows/${input.flowId}`,
      },
      footerNote: `Run id: ${input.runId}`,
    },
  });
}
