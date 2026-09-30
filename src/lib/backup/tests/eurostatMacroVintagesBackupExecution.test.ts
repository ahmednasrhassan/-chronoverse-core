import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CHRONOVERSE_BACKUP_MAX_PAYLOAD_BYTES_V1,
  validateChronoverseBackupObjectV1,
  type ChronoverseBackupObjectV1,
} from "../backupObject";
import {
  createEurostatMacroVintagesBackupExecutionV1,
  type EurostatMacroVintagesBackupExecutionDependenciesV1,
} from "../eurostatMacroVintagesBackupExecution";
import { EurostatMacroVintagesRedisReaderErrorV1 } from
  "../eurostatMacroVintagesRedisReader";
import type { R2BackupWriteResultV1 } from "../r2BackupWriter";

const timestamp = 1_704_067_200;
const vintages = {
  hicp: [{ score: 10, member: "synthetic-hicp" }],
  gdp: [{ score: 20, member: "synthetic-gdp" }],
} as const;

function dependencies(
  overrides: Partial<EurostatMacroVintagesBackupExecutionDependenciesV1> = {},
): EurostatMacroVintagesBackupExecutionDependenciesV1 {
  return {
    readVintages: async () => vintages,
    nowUnixSeconds: () => timestamp,
    writeBackup: async (object) => ({
      status: "written",
      objectKey: object.objectKey,
      sha256: object.sha256,
    }),
    ...overrides,
  };
}

test("construction is inert; capture completes before one clock call and one write", async () => {
  let resolveRead!: (value: typeof vintages) => void;
  const pendingRead = new Promise<typeof vintages>((resolve) => { resolveRead = resolve; });
  const calls: string[] = [];
  let writtenObject: ChronoverseBackupObjectV1 | undefined;
  const execution = createEurostatMacroVintagesBackupExecutionV1(dependencies({
    readVintages: () => { calls.push("read"); return pendingRead; },
    nowUnixSeconds: () => { calls.push("clock"); return timestamp; },
    writeBackup: async (object) => {
      calls.push("write");
      writtenObject = object;
      return { status: "written", objectKey: object.objectKey, sha256: object.sha256 };
    },
  }));
  assert.deepEqual(calls, []);
  const resultPromise = execution.execute();
  assert.deepEqual(calls, ["read"]);
  resolveRead(vintages);
  const result = await resultPromise;
  assert.deepEqual(calls, ["read", "clock", "write"]);
  assert.ok(writtenObject);
  assert.equal(validateChronoverseBackupObjectV1(writtenObject).objectKey, writtenObject.objectKey);
  assert.equal(writtenObject.createdAtUnixSeconds, timestamp);
  assert.equal(writtenObject.objectKey,
    "production/2024/01/01/eurostat-macro-vintages-1704067200.json");
  const manifest = JSON.parse(Buffer.from(writtenObject.payloadBytes).toString("utf8"));
  assert.deepEqual(manifest.series.map((series: { entries: unknown }) => series.entries),
    [vintages.hicp, vintages.gdp]);
  assert.deepEqual(result, {
    stage: "write",
    result: { status: "written", objectKey: writtenObject.objectKey, sha256: writtenObject.sha256 },
  });
});

for (const code of ["configuration-failure", "redis-failure", "invalid-response"] as const) {
  test(`reader ${code} stays in read stage without clock or write`, async () => {
    let clockCalls = 0;
    let writeCalls = 0;
    const execution = createEurostatMacroVintagesBackupExecutionV1(dependencies({
      readVintages: async () => { throw new EurostatMacroVintagesRedisReaderErrorV1(code); },
      nowUnixSeconds: () => { clockCalls++; return timestamp; },
      writeBackup: async () => { writeCalls++; return { status: "transport-failure" }; },
    }));
    assert.deepEqual(await execution.execute(), { stage: "read", status: code });
    assert.equal(clockCalls, 0);
    assert.equal(writeCalls, 0);
  });
}

for (const [name, error] of [
  ["ReferenceError", new ReferenceError("synthetic")],
  ["TypeError", new TypeError("synthetic")],
] as const) {
  test(`reader ${name} is unexpected`, async () => {
    let clockCalls = 0;
    const execution = createEurostatMacroVintagesBackupExecutionV1(dependencies({
      readVintages: async () => { throw error; },
      nowUnixSeconds: () => { clockCalls++; return timestamp; },
    }));
    assert.deepEqual(await execution.execute(), { stage: "unexpected", origin: "read" });
    assert.equal(clockCalls, 0);
  });
}

test("invalid timestamp is classified by the real builder", async () => {
  let writes = 0;
  const execution = createEurostatMacroVintagesBackupExecutionV1(dependencies({
    nowUnixSeconds: () => timestamp + 0.5,
    writeBackup: async () => { writes++; return { status: "transport-failure" }; },
  }));
  assert.deepEqual(await execution.execute(), {
    stage: "build", status: "backup-object-validation", code: "invalid-timestamp",
  });
  assert.equal(writes, 0);
});

test("oversized payload remains a build validation failure", async () => {
  let writes = 0;
  const execution = createEurostatMacroVintagesBackupExecutionV1(dependencies({
    readVintages: async () => ({
      hicp: [{ score: 1, member: "x".repeat(CHRONOVERSE_BACKUP_MAX_PAYLOAD_BYTES_V1) }],
      gdp: [],
    }),
    writeBackup: async () => { writes++; return { status: "transport-failure" }; },
  }));
  assert.deepEqual(await execution.execute(), {
    stage: "build", status: "backup-object-validation", code: "payload-too-large",
  });
  assert.equal(writes, 0);
});

test("invalid input remains distinct from backup-object validation", async () => {
  const execution = createEurostatMacroVintagesBackupExecutionV1(dependencies({
    readVintages: async () => ({ hicp: [{ score: -1, member: "synthetic" }], gdp: [] }),
  }));
  assert.deepEqual(await execution.execute(), {
    stage: "build", status: "invalid-input", code: "invalid-score",
  });
});

const writerResults: readonly R2BackupWriteResultV1[] = [
  { status: "written", objectKey: "synthetic-key", sha256: "synthetic-sha" },
  { status: "already-exists", objectKey: "synthetic-key" },
  { status: "configuration-failure", code: "synthetic-code" as Extract<
    R2BackupWriteResultV1, { status: "configuration-failure" }
  >["code"] },
  { status: "validation-failure", code: "invalid-object" },
  { status: "transport-failure" },
  { status: "unexpected-failure" },
];

for (const writerResult of writerResults) {
  test(`writer ${writerResult.status} is preserved without retries`, async () => {
    let reads = 0;
    let clocks = 0;
    let writes = 0;
    const execution = createEurostatMacroVintagesBackupExecutionV1(dependencies({
      readVintages: async () => { reads++; return vintages; },
      nowUnixSeconds: () => { clocks++; return timestamp; },
      writeBackup: async () => { writes++; return writerResult; },
    }));
    assert.deepEqual(await execution.execute(), { stage: "write", result: writerResult });
    assert.deepEqual([reads, clocks, writes], [1, 1, 1]);
  });
}

test("a thrown writer programming error is not a transport result", async () => {
  const execution = createEurostatMacroVintagesBackupExecutionV1(dependencies({
    writeBackup: async () => { throw new ReferenceError("synthetic"); },
  }));
  assert.deepEqual(await execution.execute(), { stage: "unexpected", origin: "write" });
});
