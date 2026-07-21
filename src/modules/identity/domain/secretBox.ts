import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

function keyFromSecret(secret: string): Buffer {
  return createHash("sha256").update(secret).digest();
}

/** Encrypt a short secret (e.g. LLM API key) for DB storage. */
export function encryptSecret(plain: string, authSecret: string): string {
  const key = keyFromSecret(authSecret);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${enc.toString("base64")}`;
}

export function decryptSecret(payload: string, authSecret: string): string | null {
  try {
    const [ver, ivB64, tagB64, dataB64] = payload.split(":");
    if (ver !== "v1" || !ivB64 || !tagB64 || !dataB64) return null;
    const key = keyFromSecret(authSecret);
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    const dec = Buffer.concat([
      decipher.update(Buffer.from(dataB64, "base64")),
      decipher.final(),
    ]);
    return dec.toString("utf8");
  } catch {
    return null;
  }
}

export function maskSecret(plain: string): string {
  if (plain.length <= 8) return "••••••••";
  return `${plain.slice(0, 3)}…${plain.slice(-4)}`;
}
