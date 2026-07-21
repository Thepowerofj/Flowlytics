import { getEnv } from "@/shared/config/env";
import {
  getMailTransporter,
  mailConfigured,
} from "../infrastructure/smtpTransport";
import {
  renderFlowlyticsEmail,
  type EmailContent,
} from "../domain/emailLayout";

export type SendEmailInput = {
  to: string | string[];
  subject: string;
  content: EmailContent;
};

/**
 * Send a branded Flowlytics email. If SMTP is not configured, logs and resolves
 * (so local/dev flows never break).
 */
export async function sendFlowlyticsEmail(
  input: SendEmailInput,
): Promise<{ sent: boolean; preview?: string }> {
  const env = getEnv();
  const html = renderFlowlyticsEmail(input.content);
  const to = Array.isArray(input.to) ? input.to.join(", ") : input.to;

  if (!mailConfigured()) {
    console.info(
      `[mail:dev] To: ${to} | Subject: ${input.subject}\n${input.content.title}`,
    );
    return { sent: false, preview: html };
  }

  const transport = getMailTransporter();
  if (!transport) return { sent: false };

  try {
    await transport.sendMail({
      from: env.MAIL_FROM,
      replyTo: env.MAIL_REPLY_TO,
      to,
      subject: input.subject,
      html,
      text: stripHtml(html),
    });
    return { sent: true };
  } catch (error) {
    console.error("[mail] send failed", error);
    return { sent: false };
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function appBaseUrl(): string {
  return getEnv().AUTH_URL.replace(/\/$/, "");
}
