import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z
    .string()
    .default("postgresql://flowlytics:flowlytics@localhost:5433/flowlytics?schema=public"),
  AUTH_SECRET: z.string().min(16).default("dev-only-change-me-please"),
  AUTH_URL: z.string().default("http://localhost:3000"),
  GOOGLE_CLIENT_ID: z.string().optional().default(""),
  GOOGLE_CLIENT_SECRET: z.string().optional().default(""),
  ADMIN_EMAILS: z.string().default("admin@example.com"),
  UPLOAD_DIR: z.string().default("./storage/uploads"),
  MAX_UPLOAD_BYTES: z.coerce.number().default(10 * 1024 * 1024),
  WORKER_ID: z.string().default("worker-1"),
  WORKER_CONCURRENCY: z.coerce.number().default(1),
  LLM_ENABLED: z
    .string()
    .default("true")
    .transform((v) => v === "true" || v === "1"),
  LLM_API_KEY: z.string().optional().default(""),
  LLM_BASE_URL: z.string().default("https://api.openai.com/v1"),
  LLM_MODEL: z.string().default("gpt-4o-mini"),
  AI_CREDIT_COST: z.coerce.number().default(10),
  INITIAL_WALLET_CREDITS: z.coerce.number().default(100),
  /** Access window granted when admin activates after EFT (days). */
  ACCESS_PERIOD_DAYS: z.coerce.number().default(30),
  /** Banking details shown on the user billing / EFT screen. */
  BANK_NAME: z.string().default("Your Bank Name"),
  BANK_ACCOUNT_NAME: z.string().default("Flowlytics Operator"),
  BANK_ACCOUNT_NUMBER: z.string().default("0000000000"),
  BANK_BRANCH_CODE: z.string().default("000000"),
  /** Optional extra bank note; the short FL-XXXXXX ref is always shown from the user record. */
  BANK_REFERENCE_HINT: z
    .string()
    .default("Use your short Flowlytics payment reference (shown on Billing) — not your email"),
  /** SMTP (transactional email). Leave SMTP_PASS empty to log emails in dev instead of sending. */
  SMTP_HOST: z.string().default("mail.flowlytics.co.za"),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_SECURE: z
    .string()
    .default("false")
    .transform((v) => v === "true" || v === "1"),
  SMTP_USER: z.string().default("info@flowlytics.co.za"),
  SMTP_PASS: z.string().default(""),
  /**
   * When the SMTP cert is issued for the shared host (e.g. zada141.webway.host)
   * rather than mail.flowlytics.co.za, set this so TLS verification succeeds.
   */
  SMTP_TLS_SERVERNAME: z.string().optional().default(""),
  MAIL_FROM: z.string().default("Flowlytics <info@flowlytics.co.za>"),
  MAIL_REPLY_TO: z.string().default("info@flowlytics.co.za"),
  /** Notify admins when a user declares EFT. */
  MAIL_NOTIFY_ADMIN_ON_EFT: z
    .string()
    .default("true")
    .transform((v) => v === "true" || v === "1"),
  MAIL_NOTIFY_RUN_FAILURE: z
    .string()
    .default("true")
    .transform((v) => v === "true" || v === "1"),
  MAIL_NOTIFY_RUN_SUCCESS: z
    .string()
    .default("false")
    .transform((v) => v === "true" || v === "1"),
});

export type AppEnv = z.infer<typeof envSchema>;

let cached: AppEnv | null = null;

export function getEnv(): AppEnv {
  if (cached) return cached;
  cached = envSchema.parse(process.env);
  return cached;
}

export function isAdminEmail(email: string): boolean {
  const list = getEnv()
    .ADMIN_EMAILS.split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(email.toLowerCase());
}
