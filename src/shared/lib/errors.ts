export class AppError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Unknown error";
}
