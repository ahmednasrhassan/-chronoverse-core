import { emailAddress, subscriberId, hash } from "./domain.mjs";

// Pure offline planning. Reading/exporting production data needs separate approval.
// Every legacy opt-out wins. No legacy record becomes sendable by importing it.
export function prepareMigration(records, batchId) {
  if (!Array.isArray(records) || records.length > 100000 || !/^[a-zA-Z0-9_-]{1,80}$/.test(batchId)) throw new Error("invalid_migration");
  const byId = new Map();
  for (const record of records) {
    if (!record || typeof record.sourceId !== "string" || record.sourceId.length > 256) throw new Error("invalid_migration_record");
    const email = record.email ? emailAddress(record.email) : undefined;
    const id = email ? subscriberId(email) : record.emailHash;
    if (!/^[a-f0-9]{64}$/.test(id || "")) throw new Error("invalid_migration_record");
    if (email && record.emailHash && record.emailHash !== id) throw new Error("migration_hash_mismatch");
    const suppressed = record.suppressed === true || record.active === false || ["unsubscribe", "manual", "complaint", "hard-bounce"].includes(record.reason) || record.type === "newsletterSuppression";
    const previous = byId.get(id);
    const sources = [...(previous?.sources || []), { sourceId: record.sourceId, sourceType: record.type || "subscriber", consentEvidence: record.consentEvidence ?? null,
      subscribedAt: record.subscribedAt ?? null, source: record.source ?? null, originalActive: record.active ?? null, originalSuppressed: record.suppressed ?? null, originalReason: record.reason ?? null }];
    byId.set(id, { pk: `SUB#${id}`, id, email: email || previous?.email, state: suppressed || previous?.state === "SUPPRESSED" ? "SUPPRESSED" : "HOLD", batchId, sources });
  }
  const items = [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
  return { version: 1, batchId, sourceCount: records.length, uniqueCount: items.length,
    suppressedCount: items.filter(x => x.state === "SUPPRESSED").length, holdCount: items.filter(x => x.state === "HOLD").length,
    planDigest: hash(JSON.stringify(items)), items };
}
