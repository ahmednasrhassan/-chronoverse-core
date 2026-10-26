import { canonical, requireThat } from "./safe.mjs";
import { unique, email, reconcile } from "./model.mjs";

export async function pages(read, field, tokenField, requestField, limit = 10000) {
  const rows = [], seen = new Set(); let token, bytes = 0;
  for (let page = 0; ; page++) {
    requireThat(page < limit, "pagination_limit");
    const result = await read(token === undefined ? {} : { [requestField]: token });
    requireThat(Array.isArray(result?.[field]), "invalid_page");
    bytes += Buffer.byteLength(JSON.stringify(result[field]));
    requireThat(bytes <= 48 * 1024 * 1024 && rows.length + result[field].length <= 100000, "backup_too_large");
    rows.push(...result[field]); token = result[tokenField];
    if (token === undefined || token === null) break;
    if (tokenField === "LastEvaluatedKey") {
      requireThat(token && typeof token === "object" && !Array.isArray(token), "invalid_page");
      if (!Object.keys(token).length) break;
      requireThat(Object.keys(token).length === 1 && typeof token.pk?.S === "string" && token.pk.S.length > 0, "invalid_page");
    } else requireThat(typeof token === "string" && token.length > 0 && token.length <= 16384, "invalid_page");
    const encoded = canonical(token); requireThat(!seen.has(encoded), "pagination_loop"); seen.add(encoded);
  }
  return unique(rows);
}
export async function collect(source, scope, previous = [], now = () => new Date().toISOString()) {
  const startedAt = now(); await source.verify();
  const ledger = await pages(input => source.scan(input), "Items", "LastEvaluatedKey", "ExclusiveStartKey");
  const contacts = await pages(input => source.contacts(input), "Contacts", "NextToken", "NextToken");
  const addresses = new Set(contacts.map(c => { const value = email(c.EmailAddress); requireThat(value, "invalid_page"); return value; }));
  for (const row of ledger) {
    if (/^(SUB|MIGRATION)#/.test(row.pk?.S || "") && row.email?.S !== undefined) {
      const address = email(row.email.S); requireThat(address, "invalid_page"); addresses.add(address);
    }
  }
  requireThat(addresses.size <= 10000, "backup_too_large");
  const accountChecks = [];
  for (const address of [...addresses].sort()) {
    const result = await source.suppression(address);
    requireThat(result === null || (email(result.EmailAddress) === address && ["BOUNCE", "COMPLAINT"].includes(result.Reason)), "invalid_page");
    accountChecks.push({ email: address, suppressed: result !== null, reason: result?.Reason || null, observedAt: now(), ...(result ? { raw: result } : {}) });
  }
  const data = { ledger, contacts, accountChecks }, result = reconcile(data, previous);
  return { format: "chronoverse-subscriber-snapshot", version: 1, scope, startedAt, completedAt: now(), atomicPointInTime: false,
    data, stickySuppressions: result.stickySuppressions, stats: result.stats };
}
export class SyncSession {
  constructor({ sync, announce = () => {}, intervalMs = 3600000, set = setTimeout, clear = clearTimeout }) {
    requireThat(intervalMs >= 3600000, "interval_too_short");
    Object.assign(this, { sync, announce, intervalMs, set, clear }); this.active = false; this.busy = false; this.timer = null; this.stopped = false;
  }
  pause() { this.active = false; this.controller?.abort(); if (this.timer !== null) this.clear(this.timer); this.timer = null; this.announce(this.busy ? "AUTOMATIC_SYNC_INACTIVE_REFRESH_CANCELLING" : "AUTOMATIC_SYNC_INACTIVE"); }
  async stop() { this.stopped = true; this.pause(); this.controller?.abort(); await this.inFlight?.catch(() => {}); }
  schedule() { if (this.active && !this.stopped) this.timer = this.set(() => { this.timer = null; if (this.active && !this.stopped && !this.busy) void this.refresh().catch(() => {}); }, this.intervalMs); }
  enable() { requireThat(!this.stopped, "session_stopped"); this.active = true; if (this.timer !== null) this.clear(this.timer); this.timer = null; if (!this.busy) this.schedule(); this.announce("AUTOMATIC_SYNC_ACTIVE_ONLY_WHILE_THIS_PROCESS_RUNS"); }
  refresh() {
    requireThat(!this.stopped && !this.busy, "sync_busy_or_stopped");
    this.busy = true; if (this.timer !== null) this.clear(this.timer); this.timer = null;
    this.controller = new AbortController();
    this.announce("SYNC_STARTED");
    this.inFlight = (async () => {
      try { const value = await this.sync(this.controller.signal); this.announce("SYNC_COMMITTED"); return value; }
      catch { this.pause(); this.announce("SYNC_FAILED_PREVIOUS_BACKUP_PRESERVED"); throw new Error("sync_failed"); }
      finally { this.busy = false; this.schedule(); }
    })();
    return this.inFlight;
  }
}
