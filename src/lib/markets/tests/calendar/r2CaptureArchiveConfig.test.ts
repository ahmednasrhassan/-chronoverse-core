import assert from "node:assert/strict";
import test from "node:test";
import {
  R2_CALENDAR_ARCHIVE_CONFIG_V1, R2CalendarArchiveConfigErrorV1, parseR2CalendarArchiveConfigV1,
} from "../../calendar/r2CaptureArchiveConfig";

const input = () => ({ schemaVersion: R2_CALENDAR_ARCHIVE_CONFIG_V1, accountId: "A".repeat(32),
  accessKeyId: "synthetic-calendar-access", secretAccessKey: "synthetic-calendar-secret",
  jurisdiction: "default", bucket: { name: "synthetic-calendar-test", purpose: "dedicated-calendar-capture-archive", environment: "non-production" } });

test("explicit configuration derives a direct default-jurisdiction endpoint and detaches credentials/bucket", () => {
  const value = input();
  const config = parseR2CalendarArchiveConfigV1(value);
  assert.equal(config.endpoint, `https://${"a".repeat(32)}.r2.cloudflarestorage.com`);
  assert.equal(config.region, "auto");
  assert.equal(config.bucket.name, "synthetic-calendar-test");
  assert.equal(config.accessKeyId, value.accessKeyId);
  assert.equal(config.secretAccessKey, value.secretAccessKey);
  value.bucket.name = "changed-after-parsing";
  value.secretAccessKey = "changed-after-parsing";
  assert.equal(config.bucket.name, "synthetic-calendar-test");
  assert.equal(config.secretAccessKey, "synthetic-calendar-secret");
  assert.ok(Object.isFrozen(config) && Object.isFrozen(config.bucket));
});

const changes: [string, unknown][] = [
  ["schemaVersion", "unsupported"], ["accountId", "bad/host"], ["accountId", "a".repeat(31)],
  ["accountId", " " + "a".repeat(32)], ["accessKeyId", ""], ["accessKeyId", "contains space"],
  ["accessKeyId", "a".repeat(257)], ["secretAccessKey", ""], ["secretAccessKey", "secret\nvalue"],
  ["secretAccessKey", "a".repeat(513)], ["jurisdiction", "eu"], ["jurisdiction", "us"],
  ["bucket.name", ""], ["bucket.name", "ab"], ["bucket.name", "a".repeat(64)],
  ["bucket.name", "bad.bucket"], ["bucket.name", "BAD-BUCKET"], ["bucket.name", "bad/path"],
  ["bucket.name", "chronoverse-backups"], ["bucket.environment", "production"],
  ["bucket.purpose", "backups"], ["endpoint", "https://untrusted.invalid"], ["region", "auto"],
];
for (const [index, [path, replacement]] of changes.entries()) {
  test("configuration rejects " + path + " / " + index, () => {
    const value: Record<string, unknown> = input();
    const [first, second] = path.split(".");
    if (second) (value[first] as Record<string, unknown>)[second] = replacement;
    else value[first] = replacement;
    assert.throws(() => parseR2CalendarArchiveConfigV1(value), error =>
      error instanceof R2CalendarArchiveConfigErrorV1 && error.message === "Invalid calendar R2 archive configuration.");
  });
}
for (const field of ["schemaVersion", "accountId", "accessKeyId", "secretAccessKey", "jurisdiction", "bucket"]) {
  test("missing " + field + " has no default or ambient fallback", () => {
    const value: Record<string, unknown> = input(); delete value[field];
    assert.throws(() => parseR2CalendarArchiveConfigV1(value), R2CalendarArchiveConfigErrorV1);
  });
}
test("configuration proxies and accessors reject without running caller code", () => {
  let invoked = 0;
  const value = input();
  for (const invalid of [
    new Proxy(value, { ownKeys() { invoked++; return []; } }),
    { ...value, get secretAccessKey() { invoked++; return "private"; } },
    { ...value, bucket: new Proxy(value.bucket, { get() { invoked++; return "private"; } }) },
  ]) assert.throws(() => parseR2CalendarArchiveConfigV1(invalid), R2CalendarArchiveConfigErrorV1);
  assert.equal(invoked, 0);
});
