import { createCipheriv, createDecipheriv, createHash, randomBytes, scrypt } from "node:crypto";
import { promisify } from "node:util";
import { canonical, requireThat, BackupError } from "./safe.mjs";

const derive = promisify(scrypt);
export const MAX_BYTES = 64 * 1024 * 1024;
const kdf = { name: "scrypt", N: 131072, r: 8, p: 1 };
export const digest = data => createHash("sha256").update(data).digest("hex");
function bytes(value, length) {
  requireThat(typeof value === "string" && /^[A-Za-z0-9+/]*={0,2}$/.test(value) && value.length <= MAX_BYTES * 2, "invalid_backup");
  const result = Buffer.from(value, "base64");
  requireThat(result.toString("base64") === value && (length === undefined || result.length === length), "invalid_backup");
  return result;
}
export async function unlockKey(passphrase, salt = randomBytes(32).toString("base64")) {
  requireThat(typeof passphrase === "string" && passphrase.length >= 20 && passphrase.length <= 512, "passphrase_required");
  const input = Buffer.from(passphrase, "utf8");
  try { return { salt, key: await derive(input, bytes(salt, 32), 32, { ...kdf, maxmem: 256 * 1024 * 1024 }) }; }
  finally { input.fill(0); }
}
export function envelope(raw) {
  try {
    requireThat(Buffer.byteLength(raw) <= MAX_BYTES * 1.5, "backup_too_large");
    const data = JSON.parse(raw);
    requireThat(canonical(Object.keys(data).sort()) === canonical(["ciphertext", "header", "tag"]), "invalid_backup");
    const h = data.header;
    requireThat(h?.format === "chronoverse-owner-backup" && h.version === 1 && ["vault", "snapshot", "recovery"].includes(h.purpose) &&
      canonical(h.kdf) === canonical(kdf) && canonical(Object.keys(h).sort()) === canonical(["format", "iv", "kdf", "purpose", "salt", "version"]), "invalid_backup");
    bytes(h.salt, 32); bytes(h.iv, 12); bytes(data.tag, 16); bytes(data.ciphertext);
    return data;
  } catch { throw new BackupError("invalid_backup"); }
}
export function encrypt(payload, context, purpose) {
  const plain = Buffer.from(canonical(payload), "utf8");
  try {
    requireThat(plain.length <= MAX_BYTES, "backup_too_large");
    const header = { format: "chronoverse-owner-backup", version: 1, purpose, kdf, salt: context.salt, iv: randomBytes(12).toString("base64") };
    const cipher = createCipheriv("aes-256-gcm", context.key, bytes(header.iv, 12));
    cipher.setAAD(Buffer.from(canonical(header)));
    const ciphertext = Buffer.concat([cipher.update(plain), cipher.final()]);
    return Buffer.from(canonical({ header, ciphertext: ciphertext.toString("base64"), tag: cipher.getAuthTag().toString("base64") }));
  } finally { plain.fill(0); }
}
export function decrypt(raw, context, purpose) {
  try {
    const data = envelope(raw);
    requireThat(data.header.salt === context.salt && data.header.purpose === purpose, "invalid_backup");
    const decipher = createDecipheriv("aes-256-gcm", context.key, bytes(data.header.iv, 12));
    decipher.setAAD(Buffer.from(canonical(data.header))); decipher.setAuthTag(bytes(data.tag, 16));
    const plain = Buffer.concat([decipher.update(bytes(data.ciphertext)), decipher.final()]);
    try { requireThat(plain.length <= MAX_BYTES, "backup_too_large"); return JSON.parse(plain.toString("utf8")); }
    finally { plain.fill(0); }
  } catch { throw new BackupError("backup_authentication_failed"); }
}
