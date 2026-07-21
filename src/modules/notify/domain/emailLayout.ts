/** Flowlytics-branded HTML email shell (inline CSS for clients). */

export type EmailContent = {
  preheader?: string;
  title: string;
  bodyHtml: string;
  cta?: { label: string; href: string };
  footerNote?: string;
};

const ACCENT = "#0D9488";
const ACCENT_DEEP = "#0F766E";
const INK = "#0F1F1C";
const MUTED = "#5A6E67";
const BG = "#F4F7F6";
const BORDER = "#E2EAE6";

export function renderFlowlyticsEmail(content: EmailContent): string {
  const cta = content.cta
    ? `<p style="margin:28px 0 8px;">
        <a href="${escapeHtml(content.cta.href)}"
           style="display:inline-block;background:${ACCENT};color:#ffffff;text-decoration:none;
                  font-family:Georgia,'Times New Roman',serif;font-size:15px;font-weight:700;
                  padding:12px 22px;border-radius:12px;">
          ${escapeHtml(content.cta.label)}
        </a>
      </p>`
    : "";

  const preheader = content.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">
        ${escapeHtml(content.preheader)}
      </div>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(content.title)}</title>
</head>
<body style="margin:0;padding:0;background:${BG};color:${INK};">
  ${preheader}
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${BG};padding:28px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0"
               style="max-width:560px;background:#ffffff;border:1px solid ${BORDER};
                      border-radius:16px;overflow:hidden;box-shadow:0 10px 30px rgba(15,31,28,0.07);">
          <tr>
            <td style="background:linear-gradient(135deg,${ACCENT} 0%,${ACCENT_DEEP} 100%);padding:22px 28px;">
              <div style="font-family:Georgia,'Times New Roman',serif;font-size:22px;font-weight:700;color:#fff;letter-spacing:-0.02em;">
                Flowlytics
              </div>
              <div style="margin-top:4px;font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:12px;color:rgba(255,255,255,0.88);">
                Visual data analytics flows
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 28px 12px;font-family:system-ui,-apple-system,Segoe UI,sans-serif;">
              <h1 style="margin:0 0 14px;font-family:Georgia,'Times New Roman',serif;
                         font-size:22px;line-height:1.25;font-weight:700;color:${INK};">
                ${escapeHtml(content.title)}
              </h1>
              <div style="font-size:15px;line-height:1.55;color:${MUTED};">
                ${content.bodyHtml}
              </div>
              ${cta}
            </td>
          </tr>
          <tr>
            <td style="padding:8px 28px 24px;font-family:system-ui,-apple-system,Segoe UI,sans-serif;
                       font-size:12px;line-height:1.45;color:${MUTED};border-top:1px solid ${BORDER};">
              ${content.footerNote ? `<p style="margin:12px 0 0;">${escapeHtml(content.footerNote)}</p>` : ""}
              <p style="margin:12px 0 0;">
                You’re receiving this because you have a Flowlytics account.
                Questions? Reply to this email or write to info@flowlytics.co.za.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function p(text: string): string {
  return `<p style="margin:0 0 12px;">${escapeHtml(text)}</p>`;
}

export function strongLine(label: string, value: string): string {
  return `<p style="margin:0 0 8px;"><span style="color:${INK};font-weight:600;">${escapeHtml(label)}:</span> ${escapeHtml(value)}</p>`;
}
