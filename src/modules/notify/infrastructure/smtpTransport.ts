import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import { getEnv } from "@/shared/config/env";

let transporter: Transporter | null = null;

export function mailConfigured(): boolean {
  const env = getEnv();
  return Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS);
}

export function getMailTransporter(): Transporter | null {
  if (!mailConfigured()) return null;
  if (transporter) return transporter;
  const env = getEnv();
  transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
    },
    requireTLS: !env.SMTP_SECURE && env.SMTP_PORT === 587,
    ...(env.SMTP_TLS_SERVERNAME
      ? { tls: { servername: env.SMTP_TLS_SERVERNAME } }
      : {}),
  });
  return transporter;
}
