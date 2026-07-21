/** Server/worker mail API — do not import from Client Components. */
export * from "./application/sendEmail";
export * from "./application/notifications";
export * from "./domain/emailLayout";
export { mailConfigured } from "./infrastructure/smtpTransport";
