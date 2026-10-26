export class BackupError extends Error {
  constructor(code) { super(code); this.name = "BackupError"; this.code = code; }
}
export function requireThat(value, code) { if (!value) throw new BackupError(code); }
export function canonical(value) {
  if (value instanceof Date) { requireThat(Number.isFinite(value.getTime()), "invalid_data"); return JSON.stringify(value.toISOString()); }
  // Match AWS JSON's binary AttributeValue wire representation, including BS.
  if (value instanceof Uint8Array) return JSON.stringify(Buffer.from(value).toString("base64"));
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).filter(k => value[k] !== undefined).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(",")}}`;
  requireThat(value !== undefined && (typeof value !== "number" || Number.isFinite(value)), "invalid_data");
  return JSON.stringify(value);
}
export const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
