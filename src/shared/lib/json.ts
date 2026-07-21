/** Serialize a value into a plain JSON-compatible structure for Prisma Json columns. */
export function toJsonValue<T>(value: T): object {
  return JSON.parse(JSON.stringify(value)) as object;
}
