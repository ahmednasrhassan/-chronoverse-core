import {
  getGoldMacroSnapshot,
  GOLD_MACRO_SERIES,
  type GoldMacroSnapshot,
} from "../../assets/gold/macro";
import {
  calculateGoldMacroScore,
} from "../../assets/gold/macroScore";
import {
  prepareGoldMacroEvidenceV1,
} from "../../assets/gold/productionCutover";
import type {
  EconomicSeriesProvider,
  FredObservation,
  FredSeries,
} from "../../providers/fred/types";

const observations = Object.freeze({
  realYield10Y: Object.freeze({
    date: "2026-09-04",
    value: 1.5,
  }),
  nominalYield10Y: Object.freeze({
    date: "2026-09-03",
    value: 4,
  }),
  dollarIndexProxy: Object.freeze({
    date: "2026-09-02",
    value: 103,
  }),
  inflationExpectation10Y: Object.freeze({
    date: "2026-09-01",
    value: 2.6,
  }),
});

type DriverBehavior = FredObservation | null | Error;

interface IsolationCase {
  readonly snapshot: GoldMacroSnapshot;
  readonly attempts: readonly string[];
}

class FakeFredProvider implements EconomicSeriesProvider {
  readonly id = "fake-fred";
  readonly attempts: string[] = [];

  constructor(
    private readonly behavior: Readonly<Record<string, DriverBehavior>>,
  ) {}

  isConfigured(): boolean {
    return true;
  }

  async getSeries(): Promise<FredSeries> {
    throw new Error("getSeries must not be called by Gold Macro acquisition.");
  }

  async getLatestValue(
    seriesId: string,
  ): Promise<FredObservation | null> {
    this.attempts.push(seriesId);
    const result = this.behavior[seriesId];

    if (result instanceof Error) {
      throw result;
    }

    return result ?? null;
  }
}

function fullBehavior(): Record<string, DriverBehavior> {
  return {
    [GOLD_MACRO_SERIES.realYield10Y]: observations.realYield10Y,
    [GOLD_MACRO_SERIES.nominalYield10Y]: observations.nominalYield10Y,
    [GOLD_MACRO_SERIES.dollarIndexProxy]: observations.dollarIndexProxy,
    [GOLD_MACRO_SERIES.inflationExpectation10Y]:
      observations.inflationExpectation10Y,
  };
}

async function acquire(
  overrides: Readonly<Record<string, DriverBehavior>> = {},
): Promise<IsolationCase> {
  const provider = new FakeFredProvider({
    ...fullBehavior(),
    ...overrides,
  });
  const snapshot = await getGoldMacroSnapshot(provider);

  assertEqual(provider.attempts.length, 4, "FRED attempt count");
  assertDeep(provider.attempts, [
    "DFII10",
    "DGS10",
    "DTWEXBGS",
    "T10YIE",
  ], "FRED series attempt order");

  return {
    snapshot,
    attempts: provider.attempts,
  };
}

function assertCoverage(
  snapshot: GoldMacroSnapshot,
  expected: number,
  label: string,
): void {
  const macro = calculateGoldMacroScore(snapshot);

  if (
    macro.canonical.availability !== "available" &&
    macro.canonical.availability !== "partial"
  ) {
    throw new Error(`${label}: expected usable Macro.`);
  }

  assertClose(macro.coverage, expected, `${label} compatibility coverage`);
  assertClose(macro.canonical.data.coverage, expected, `${label} canonical coverage`);
}

function unavailableReason(
  snapshot: GoldMacroSnapshot,
  driverId: string,
): string | null {
  const macro = calculateGoldMacroScore(snapshot);

  if (
    macro.canonical.availability !== "available" &&
    macro.canonical.availability !== "partial"
  ) {
    return null;
  }

  const driver = macro.canonical.data.drivers.find(
    (candidate) => candidate.id === driverId,
  );

  return driver?.availability === "unavailable"
    ? driver.reason ?? null
    : null;
}

async function main(): Promise<void> {
  const allSuccess = await acquire();
  assertDeep(allSuccess.snapshot, observations, "all-success snapshot parity");
  const acquiredFull = calculateGoldMacroScore(allSuccess.snapshot);
  const directFull = calculateGoldMacroScore(observations);
  assertDeep(acquiredFull, directFull, "full-success analytical parity");
  assertEqual(acquiredFull.canonical.availability, "available", "all-success Macro");
  assertClose(acquiredFull.coverage, 1, "all-success coverage");

  const oneRejection = await acquire({
    DGS10: new Error("secret provider detail"),
  });
  assertEqual(oneRejection.snapshot.nominalYield10Y, null, "one rejection unavailable");
  assertEqual(oneRejection.snapshot.realYield10Y, observations.realYield10Y, "one rejection retains real yield");
  assertEqual(oneRejection.snapshot.dollarIndexProxy, observations.dollarIndexProxy, "one rejection retains USD");
  assertEqual(
    oneRejection.snapshot.inflationExpectation10Y,
    observations.inflationExpectation10Y,
    "one rejection retains inflation",
  );
  assertCoverage(oneRejection.snapshot, 0.9, "one rejection");
  const oneRejectionMacro = calculateGoldMacroScore(oneRejection.snapshot);
  assertClose(oneRejectionMacro.score, 0.4, "one rejection conditional score");
  assertEqual(
    unavailableReason(oneRejection.snapshot, "nominal-yields"),
    "nominal-yields evidence is unavailable.",
    "stable rejection reason",
  );
  assertEqual(
    JSON.stringify(oneRejection).includes("secret provider detail"),
    false,
    "provider exception does not leak",
  );

  const twoRejections = await acquire({
    DGS10: new Error("nominal rejected"),
    T10YIE: new Error("inflation rejected"),
  });
  assertCoverage(twoRejections.snapshot, 0.7, "two rejections");
  assertEqual(twoRejections.snapshot.realYield10Y, observations.realYield10Y, "two rejections retain real yield");
  assertEqual(twoRejections.snapshot.dollarIndexProxy, observations.dollarIndexProxy, "two rejections retain USD");

  const threeRejections = await acquire({
    DGS10: new Error("nominal rejected"),
    DTWEXBGS: new Error("USD rejected"),
    T10YIE: new Error("inflation rejected"),
  });
  assertCoverage(threeRejections.snapshot, 0.4, "three rejections");
  assertEqual(threeRejections.snapshot.realYield10Y, observations.realYield10Y, "three rejections retain survivor");

  const allRejections = await acquire({
    DFII10: new Error("real rejected"),
    DGS10: new Error("nominal rejected"),
    DTWEXBGS: new Error("USD rejected"),
    T10YIE: new Error("inflation rejected"),
  });
  assertDeep(allRejections.snapshot, {
    realYield10Y: null,
    nominalYield10Y: null,
    dollarIndexProxy: null,
    inflationExpectation10Y: null,
  }, "all rejections snapshot");

  const oneNull = await acquire({
    DGS10: null,
  });
  assertEqual(oneNull.snapshot.nominalYield10Y, null, "one null unavailable");
  assertCoverage(oneNull.snapshot, 0.9, "one null");

  const multipleNulls = await acquire({
    DGS10: null,
    DTWEXBGS: null,
  });
  assertCoverage(multipleNulls.snapshot, 0.6, "multiple nulls");

  const mixed = await acquire({
    DGS10: null,
    T10YIE: new Error("inflation rejected"),
  });
  assertCoverage(mixed.snapshot, 0.7, "mixed null and rejection");
  assertEqual(mixed.snapshot.realYield10Y, observations.realYield10Y, "mixed retains real yield");
  assertEqual(mixed.snapshot.dollarIndexProxy, observations.dollarIndexProxy, "mixed retains USD");

  const allUnusable = await acquire({
    DFII10: null,
    DGS10: new Error("nominal rejected"),
    DTWEXBGS: { date: "2026-09-02", value: null },
    T10YIE: new Error("inflation rejected"),
  });
  const unavailableMacro = calculateGoldMacroScore(allUnusable.snapshot);
  assertEqual(unavailableMacro.canonical.availability, "unavailable", "all unusable Macro");
  assertDeep(unavailableMacro.factors, {
    realYield10Y: null,
    nominalYield10Y: null,
    dollarIndexProxy: null,
    inflationExpectation10Y: null,
  }, "all unusable factor detail");
  assertEqual(
    prepareGoldMacroEvidenceV1(unavailableMacro).applicability,
    "applicable",
    "all unusable remains applicable",
  );

  if (acquiredFull.canonical.availability !== "available") {
    throw new Error("Expected available full-success Macro.");
  }
  assertDeep(
    acquiredFull.canonical.data.drivers.map((driver) => ({
      id: driver.id,
      observedAt:
        driver.availability === "available"
          ? driver.observedAt
          : undefined,
    })),
    [
      { id: "inflation-expectations", observedAt: "2026-09-01" },
      { id: "nominal-yields", observedAt: "2026-09-03" },
      { id: "real-yields", observedAt: "2026-09-04" },
      { id: "usd", observedAt: "2026-09-02" },
    ],
    "successful observedAt preservation",
  );

  const first = await acquire({
    DGS10: new Error("deterministic rejection"),
    DTWEXBGS: null,
  });
  const second = await acquire({
    DGS10: new Error("different hidden detail"),
    DTWEXBGS: null,
  });
  assertDeep(first.snapshot, second.snapshot, "deterministic isolated acquisition");
  assertDeep(
    calculateGoldMacroScore(first.snapshot),
    calculateGoldMacroScore(second.snapshot),
    "deterministic repeated evaluation",
  );

  console.log("PASS: Gold FRED per-driver failure isolation");
}

function assertEqual<T>(
  actual: T,
  expected: T,
  label: string,
): void {
  if (actual !== expected) {
    throw new Error(
      `${label}: expected ${String(expected)}, received ${String(actual)}`,
    );
  }
}

function assertDeep(
  actual: unknown,
  expected: unknown,
  label: string,
): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);

  if (actualJson !== expectedJson) {
    throw new Error(`${label}\nexpected ${expectedJson}\nreceived ${actualJson}`);
  }
}

function assertClose(
  actual: number,
  expected: number,
  label: string,
): void {
  if (Math.abs(actual - expected) > Number.EPSILON * 8) {
    throw new Error(
      `${label}: expected ${String(expected)}, received ${String(actual)}`,
    );
  }
}

void main();
