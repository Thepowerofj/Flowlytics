import "dotenv/config";
import { getMailTransporter, mailConfigured } from "../src/modules/notify/infrastructure/smtpTransport";

async function main() {
  console.log("mailConfigured:", mailConfigured());
  const t = getMailTransporter();
  if (!t) {
    console.error("No transporter (check SMTP_* in .env)");
    process.exit(1);
  }
  await t.verify();
  console.log("SMTP verify: OK");
}

main().catch((err: unknown) => {
  const e = err as { code?: string; message?: string };
  console.error("SMTP verify FAILED:", e.code || "", e.message || err);
  process.exit(1);
});
