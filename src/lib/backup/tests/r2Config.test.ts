import assert from "node:assert/strict";

import {
  R2BackupConfigErrorV1,
  parseR2BackupConfigV1,
} from "../r2Config";

const syntheticEnvironment = {
  CHRONOVERSE_R2_ACCOUNT_ID: "A".repeat(32),
  CHRONOVERSE_R2_ACCESS_KEY_ID: "synthetic-access-id",
  CHRONOVERSE_R2_SECRET_ACCESS_KEY: "synthetic-secret-value",
  CHRONOVERSE_R2_BUCKET: "chronoverse-backups",
};

const config = parseR2BackupConfigV1({
  CHRONOVERSE_R2_ACCOUNT_ID: ` ${syntheticEnvironment.CHRONOVERSE_R2_ACCOUNT_ID} `,
  CHRONOVERSE_R2_ACCESS_KEY_ID: ` ${syntheticEnvironment.CHRONOVERSE_R2_ACCESS_KEY_ID} `,
  CHRONOVERSE_R2_SECRET_ACCESS_KEY: ` ${syntheticEnvironment.CHRONOVERSE_R2_SECRET_ACCESS_KEY} `,
  CHRONOVERSE_R2_BUCKET: ` ${syntheticEnvironment.CHRONOVERSE_R2_BUCKET} `,
});
assert.equal(config.bucket, "chronoverse-backups");
assert.equal(config.region, "auto");
assert.equal(config.endpoint, `https://${"a".repeat(32)}.r2.cloudflarestorage.com`);
assert.equal(config.accessKeyId, syntheticEnvironment.CHRONOVERSE_R2_ACCESS_KEY_ID);
assert.equal(config.secretAccessKey, syntheticEnvironment.CHRONOVERSE_R2_SECRET_ACCESS_KEY);
assert.ok(Object.isFrozen(config));

for (const [field, code] of [
  ["CHRONOVERSE_R2_ACCOUNT_ID", "invalid-account-id"],
  ["CHRONOVERSE_R2_ACCESS_KEY_ID", "invalid-access-key-id"],
  ["CHRONOVERSE_R2_SECRET_ACCESS_KEY", "invalid-secret-access-key"],
  ["CHRONOVERSE_R2_BUCKET", "invalid-bucket"],
] as const) {
  for (const replacement of [undefined, "   "]) {
    assert.throws(
      () => parseR2BackupConfigV1({ ...syntheticEnvironment, [field]: replacement }),
      (error: unknown) => error instanceof R2BackupConfigErrorV1 &&
        error.code === code &&
        !error.message.includes(syntheticEnvironment.CHRONOVERSE_R2_SECRET_ACCESS_KEY) &&
        !error.message.includes(syntheticEnvironment.CHRONOVERSE_R2_ACCESS_KEY_ID),
    );
  }
}
assert.throws(
  () => parseR2BackupConfigV1({ ...syntheticEnvironment, CHRONOVERSE_R2_BUCKET: "wrong-bucket" }),
  (error: unknown) => error instanceof R2BackupConfigErrorV1 && error.code === "invalid-bucket",
);
assert.throws(
  () => parseR2BackupConfigV1({ ...syntheticEnvironment, CHRONOVERSE_R2_ACCOUNT_ID: "bad/host" }),
  (error: unknown) => error instanceof R2BackupConfigErrorV1 && error.code === "invalid-account-id",
);

console.log("PASS: R2 backup configuration V1");
