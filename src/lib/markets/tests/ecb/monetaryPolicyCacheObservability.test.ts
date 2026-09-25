import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import Module from "node:module";
import path from "node:path";

import { ECB_GOVERNING_COUNCIL_CALENDAR_URL } from
  "../../events/ecbMonetaryPolicy";
import type { EcbMonetaryPolicySourceResultV1 } from
  "../../providers/ecb/monetaryPolicy/client";
import type { EcbMonetaryPolicyScheduleCandidateV1 } from
  "../../providers/ecb/monetaryPolicy/parser";

type ScheduleResult = EcbMonetaryPolicySourceResultV1<
  readonly EcbMonetaryPolicyScheduleCandidateV1[]
>;

interface DiagnosticModule {
  readonly ECB_MONETARY_POLICY_SCHEDULE_CACHE_SECONDS_V1: number;
  readonly observeEcbMonetaryPolicyScheduleSourceV1: (
    result: ScheduleResult,
    logger: {
      readonly info: (entry: Readonly<Record<string, unknown>>) => void;
      readonly warn: (entry: Readonly<Record<string, unknown>>) => void;
    },
  ) => ScheduleResult;
}

interface ModuleLoader {
  _load(
    request: string,
    parent: NodeModule | undefined,
    isMain: boolean,
  ): unknown;
}

async function loadDiagnosticModule(): Promise<DiagnosticModule> {
  const loader = Module as unknown as ModuleLoader;
  const originalLoad = loader._load;

  loader._load = function loadWithServerStubs(request, parent, isMain) {
    if (request === "server-only") return {};
    if (request === "next/cache") {
      return {
        unstable_cache: <TArgs extends readonly unknown[], TResult>(
          operation: (...args: TArgs) => Promise<TResult>,
        ) => operation,
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    return await import("../../providers/ecb/monetaryPolicy/cache") as
      DiagnosticModule;
  } finally {
    loader._load = originalLoad;
  }
}

function candidate(meetingDate: string): EcbMonetaryPolicyScheduleCandidateV1 {
  return Object.freeze({
    sourceInstitution: "ECB",
    sourceUrl: ECB_GOVERNING_COUNCIL_CALENDAR_URL,
    meetingDate,
  });
}

async function main(): Promise<void> {
  const diagnostics = await loadDiagnosticModule();
  const infoEntries: Readonly<Record<string, unknown>>[] = [];
  const warningEntries: Readonly<Record<string, unknown>>[] = [];
  const logger = {
    info: (entry: Readonly<Record<string, unknown>>) => infoEntries.push(entry),
    warn: (entry: Readonly<Record<string, unknown>>) => warningEntries.push(entry),
  };

  const malformed = Object.freeze({
    status: "source-malformed",
    sourceUrl: ECB_GOVERNING_COUNCIL_CALENDAR_URL,
    reason: "ECB calendar contains no supported monetary-policy Day-2 entries.",
  } as const satisfies ScheduleResult);
  assert.equal(
    diagnostics.observeEcbMonetaryPolicyScheduleSourceV1(malformed, logger),
    malformed,
    "malformed result is returned by identity",
  );
  assert.deepEqual(warningEntries.pop(), {
    component: "ecb-monetary-policy-schedule",
    status: "source-malformed",
    reason: malformed.reason,
    sourceUrl: ECB_GOVERNING_COUNCIL_CALENDAR_URL,
  });

  const unavailable = Object.freeze({
    status: "source-unavailable",
    sourceUrl: ECB_GOVERNING_COUNCIL_CALENDAR_URL,
    reason: "request-failed",
  } as const satisfies ScheduleResult);
  assert.equal(
    diagnostics.observeEcbMonetaryPolicyScheduleSourceV1(unavailable, logger),
    unavailable,
    "unavailable result is returned by identity",
  );
  assert.deepEqual(warningEntries.pop(), {
    component: "ecb-monetary-policy-schedule",
    status: "source-unavailable",
    reason: "request-failed",
    sourceUrl: ECB_GOVERNING_COUNCIL_CALENDAR_URL,
  });

  const available = Object.freeze({
    status: "available",
    sourceUrl: ECB_GOVERNING_COUNCIL_CALENDAR_URL,
    fetchedAt: 1_800_000_000,
    data: Object.freeze([
      candidate("2026-10-29"),
      candidate("2026-12-17"),
      candidate("2027-02-04"),
    ]),
  } as const satisfies ScheduleResult);
  assert.equal(
    diagnostics.observeEcbMonetaryPolicyScheduleSourceV1(available, logger),
    available,
    "available result is returned by identity",
  );
  assert.deepEqual(infoEntries.pop(), {
    component: "ecb-monetary-policy-schedule",
    status: "available",
    sourceUrl: ECB_GOVERNING_COUNCIL_CALENDAR_URL,
    fetchedAt: 1_800_000_000,
    candidateCount: 3,
    firstMeetingDate: "2026-10-29",
    lastMeetingDate: "2027-02-04",
  });
  assert.equal(JSON.stringify(infoEntries).includes("html"), false);

  const throwingLogger = {
    info: () => { throw new Error("logger unavailable"); },
    warn: () => { throw new Error("logger unavailable"); },
  };
  assert.equal(
    diagnostics.observeEcbMonetaryPolicyScheduleSourceV1(
      available,
      throwingLogger,
    ),
    available,
    "logging failure cannot alter or reject schedule delivery",
  );

  assert.equal(
    diagnostics.ECB_MONETARY_POLICY_SCHEDULE_CACHE_SECONDS_V1,
    86_400,
    "schedule cache duration remains 24 hours",
  );

  const repositoryRoot = process.cwd();
  const cacheSource = readFileSync(path.join(
    repositoryRoot,
    "src/lib/markets/providers/ecb/monetaryPolicy/cache.ts",
  ), "utf8");
  assert.match(
    cacheSource,
    /\["chronoverse", "providers", "ecb", "monetary-policy-schedule-v2"\]/,
    "only the schedule key advances to generation v2",
  );
  assert.match(cacheSource, /tags: \["ecb-monetary-policy-schedule-v1"\]/);
  assert.equal(
    (cacheSource.match(/ecbMonetaryPolicyClientV1\.getSchedule\(\)/g) ?? [])
      .length,
    1,
    "one shared cached producer owns the schedule call",
  );

  for (const relativePath of [
    "src/components/vip/market-room/VipEcbPolicyEventPanel.tsx",
    "src/components/vip/market-room/VipFxMarketRoom.tsx",
    "src/components/vip/market-room/VipEstrMarketRoom.tsx",
    "src/lib/markets/projections/fiveProductProjections.ts",
    "src/lib/markets/services/vipDeepDelivery.ts",
    "src/lib/markets/services/vipMarketRoomDelivery.ts",
  ]) {
    const source = readFileSync(path.join(repositoryRoot, relativePath), "utf8");
    assert.equal(
      source.includes("ecb-monetary-policy-schedule"),
      false,
      `${relativePath} contains no schedule diagnostics`,
    );
    assert.doesNotMatch(
      source,
      /console\.(?:info|warn)/,
      `${relativePath} contains no observability logging`,
    );
  }

  console.log("PASS: ECB monetary-policy schedule cache observability");
}

void main();
