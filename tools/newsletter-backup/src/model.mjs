import { createHash } from "node:crypto";
import { canonical, requireThat } from "./safe.mjs";

export const TOPIC = "weekly-research";
export function validateStats(stats) {
  const keys = ["identities", "confirmedObserved", "pending", "suppressed", "held", "consentReviewCandidates", "conflicts", "complaints", "hardBounces", "bounceEvents", "complaintEvents", "sendable"];
  requireThat(stats && Object.keys(stats).length === keys.length && keys.every(k => Number.isSafeInteger(stats[k]) && stats[k] >= 0 && stats[k] <= 1000000) && stats.sendable === 0, "invalid_snapshot");
  return stats;
}
export const sha = text => createHash("sha256").update(text).digest("hex");
export function email(value) {
  if (typeof value !== "string") return null;
  const result = value.trim().toLowerCase();
  return result.length <= 254 && /^[^\s@\x00-\x1f\x7f]+@[^\s@\x00-\x1f\x7f]+\.[^\s@\x00-\x1f\x7f]+$/.test(result) ? result : null;
}
export function unique(rows) {
  const seen = new Set();
  return rows.filter(row => { const key = canonical(row); if (seen.has(key)) return false; seen.add(key); return true; });
}
// Raw DynamoDB AttributeValue maps are preserved in snapshots, including numbers
// and nonces. Only known fields are interpreted for statistics/recovery review.
const s = (row, key) => typeof row[key]?.S === "string" ? row[key].S : undefined;
const n = (row, key) => /^\d{1,16}$/.test(row[key]?.N || "") && Number.isSafeInteger(Number(row[key].N)) ? Number(row[key].N) : null;
function normalized(item) {
  if (item?.S !== undefined) return item.S;
  if (item?.BOOL !== undefined) return item.BOOL;
  if (item?.NULL) return null;
  if (item?.N !== undefined) return item.N; // Preserve arbitrary precision in evidence.
  if (item?.L) return item.L.map(normalized);
  if (item?.M) return Object.fromEntries(Object.entries(item.M).map(([k, v]) => [k, normalized(v)]));
  return null;
}
export function reconcile(data, previous = []) {
  requireThat(Array.isArray(data.ledger) && Array.isArray(data.contacts) && Array.isArray(data.accountChecks), "invalid_snapshot");
  const people = new Map();
  function person(id, address) {
    let p = people.get(id);
    if (!p) { p = { id, emails: new Set(), reasons: new Set(), rows: [], consentEvidence: [], confirmed: false, pending: false, conflicted: false, sesOptin: false, accountChecked: false }; people.set(id, p); }
    if (address) p.emails.add(address);
    return p;
  }
  for (const entry of previous) {
    requireThat(/^[a-f0-9]{64}$/.test(entry.id) && Array.isArray(entry.reasons) && entry.reasons.length > 0, "invalid_snapshot");
    const p = person(entry.id, email(entry.email)); for (const reason of entry.reasons) p.reasons.add(reason);
  }
  const events = { bounce: new Set(), complaint: new Set() };
  for (const row of unique(data.ledger)) {
    const pk = s(row, "pk"); requireThat(typeof pk === "string", "invalid_snapshot");
    if (pk.startsWith("EVENT#")) { if (s(row, "type") === "Bounce") events.bounce.add(pk); if (s(row, "type") === "Complaint") events.complaint.add(pk); }
    const audit = /^AUDIT#([a-f0-9]{64})#(request|confirm|suppress)#([^#]+)$/.exec(pk);
    if (audit) {
      const p = person(audit[1]);
      p.consentEvidence.push({ evidenceId: sha(pk), consentLink: sha(`${audit[1]}#${audit[3]}`), kind: s(row, "kind") || null, at: n(row, "at"), consentVersion: s(row, "consentVersion") || null,
        consentText: s(row, "consentText") || null, source: s(row, "source") || null, reason: s(row, "reason") || null });
      if (audit[2] === "suppress") p.reasons.add(s(row, "reason") || "historical-suppression");
    }
    const idMatch = /^SUB#([a-f0-9]{64})$/.exec(pk), migration = /^MIGRATION#[^#]+#([a-f0-9]{64})$/.exec(pk);
    if (!idMatch && !migration) continue;
    const id = (idMatch || migration)[1], address = email(s(row, "email")), p = person(id, address);
    const related = address && sha(address) !== id ? person(sha(address), address) : p;
    if (related !== p) { p.conflicted = true; related.conflicted = true; }
    const sources = normalized(row.sources) || [];
    const blocked = s(row, "state") === "SUPPRESSED" || row.suppressedAt !== undefined || row.suppressionReason !== undefined ||
      (Array.isArray(sources) && sources.some(x => x?.originalActive === false || x?.originalSuppressed === true || ["unsubscribe", "manual", "complaint", "hard-bounce"].includes(x?.originalReason) || x?.sourceType === "newsletterSuppression"));
    if (blocked) { const reason = s(row, "suppressionReason") || "legacy-suppression"; p.reasons.add(reason); related.reasons.add(reason); }
    if (migration) { p.consentEvidence.push({ evidenceId: sha(pk), kind: "legacy-provenance", sources }); continue; }
    p.rows.push(row); p.confirmed ||= s(row, "state") === "CONFIRMED"; p.pending ||= s(row, "state") === "PENDING";
  }
  for (const contact of unique(data.contacts)) {
    const address = email(contact.EmailAddress); requireThat(address, "invalid_snapshot");
    const p = person(sha(address), address);
    // List defaults are not an individual's unsubscribe. Explicit opt-outs win;
    // default opt-in never supplies missing individual consent.
    if (contact.UnsubscribeAll === true || contact.TopicPreferences?.some(t => t.TopicName === TOPIC && t.SubscriptionStatus === "OPT_OUT")) p.reasons.add("ses-optout");
    if (contact.TopicPreferences?.some(t => t.TopicName === TOPIC && t.SubscriptionStatus === "OPT_IN")) p.sesOptin = true;
  }
  for (const check of unique(data.accountChecks)) {
    const address = email(check.email); requireThat(address && typeof check.suppressed === "boolean", "invalid_snapshot");
    const p = person(sha(address), address); p.accountChecked = true;
    if (check.suppressed) p.reasons.add(check.reason === "COMPLAINT" ? "complaint" : "hard-bounce");
  }
  const records = [...people.values()].map(p => {
    const conflict = p.conflicted || p.emails.size > 1 || p.rows.length > 1;
    const requested = p.consentEvidence.some(e => e.kind === "requested" && e.consentText && e.consentVersion && e.at &&
      p.consentEvidence.some(c => c.kind === "confirmed" && c.consentLink === e.consentLink && c.consentVersion === e.consentVersion && c.at >= e.at));
    const confirmedAudit = p.consentEvidence.some(e => e.kind === "confirmed" && e.consentVersion && e.at);
    return { emailHash: p.id, email: p.emails.size === 1 ? [...p.emails][0] : null, targetState: p.reasons.size ? "SUPPRESSED" : "HOLD",
      reasons: [...p.reasons].sort(), observedLedgerState: p.confirmed ? "CONFIRMED" : p.pending ? "PENDING" : p.rows.length ? "HOLD_OR_UNKNOWN" : "MISSING",
      historicallyConfirmed: p.confirmed && confirmedAudit, consentEvidence: p.consentEvidence, conflict,
      consentReviewCandidate: !p.reasons.size && !conflict && p.confirmed && requested && confirmedAudit && p.sesOptin && p.accountChecked,
      activationAuthorized: false };
  }).sort((a, b) => a.emailHash.localeCompare(b.emailHash));
  const stats = { identities: records.length, confirmedObserved: records.filter(r => r.observedLedgerState === "CONFIRMED").length,
    pending: records.filter(r => r.observedLedgerState === "PENDING").length, suppressed: records.filter(r => r.targetState === "SUPPRESSED").length,
    held: records.filter(r => r.targetState === "HOLD").length, consentReviewCandidates: records.filter(r => r.consentReviewCandidate).length,
    conflicts: records.filter(r => r.conflict).length, complaints: records.filter(r => r.reasons.includes("complaint")).length,
    hardBounces: records.filter(r => r.reasons.includes("hard-bounce")).length, bounceEvents: events.bounce.size, complaintEvents: events.complaint.size, sendable: 0 };
  return { records, stats, stickySuppressions: records.filter(r => r.targetState === "SUPPRESSED").map(r => ({ id: r.emailHash, email: r.email, reasons: r.reasons })) };
}
export function recoveryBundle(snapshots, scope) {
  requireThat(snapshots.length > 0, "no_snapshot");
  const latest = snapshots.at(-1);
  requireThat(snapshots.every(snap => canonical(snap.scope) === canonical(scope)), "wrong_backup_scope");
  const historicalEvidence = snapshots.flatMap(snap => snap.data.ledger.filter(row => /^(AUDIT|MIGRATION)#/.test(s(row, "pk") || "")));
  const result = reconcile({ ...latest.data, ledger: unique([...latest.data.ledger, ...historicalEvidence]) }, snapshots.flatMap(snap => snap.stickySuppressions));
  return { format: "chronoverse-recovery-review", version: 1, scope, sourceCompletedAt: latest.completedAt,
    atomicPointInTime: false, policy: "SUPPRESSION_FIRST_REVIEW_ONLY", activationAuthorized: false, stats: result.stats, records: result.records };
}
