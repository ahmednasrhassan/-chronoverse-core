import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { normalizeEmail } from "./config";

export function emailKey(email: string): string {
  return createHash("sha256").update(email).digest("hex");
}

// Opaque authenticated capability: neither an address nor a subscriber ID is
// exposed in the URL. It authorizes opt-out only, never reads or reactivation.
export function createUnsubscribeToken(email: string, secret: string): string {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", createHash("sha256").update(secret).digest(), nonce);
  cipher.setAAD(Buffer.from("chronoverse-newsletter-optout-v1"));
  const encrypted = Buffer.concat([cipher.update(email, "utf8"), cipher.final()]);
  return "v1." + Buffer.concat([nonce, cipher.getAuthTag(), encrypted]).toString("base64url");
}

export function readUnsubscribeToken(token: string, secret: string): string | null {
  try {
    if (!/^v1\.[A-Za-z0-9_-]{40,500}$/.test(token)) return null;
    const bytes = Buffer.from(token.slice(3), "base64url");
    const decipher = createDecipheriv("aes-256-gcm", createHash("sha256").update(secret).digest(), bytes.subarray(0, 12));
    decipher.setAAD(Buffer.from("chronoverse-newsletter-optout-v1"));
    decipher.setAuthTag(bytes.subarray(12, 28));
    return normalizeEmail(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString("utf8"));
  } catch { return null; }
}
