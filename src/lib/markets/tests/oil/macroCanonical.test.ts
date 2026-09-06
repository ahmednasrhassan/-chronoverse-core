import {
  calculateOilMacro,
  OIL_MACRO_WEIGHTS,
} from "../../assets/oil/macro";
import {
  mapOilFundamentalsToMacroInput,
} from "../../assets/oil/macroData";

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(
      `${label}: expected ${String(expected)}, received ${String(actual)}`,
    );
  }
}

function assertClose(actual: number, expected: number, label: string): void {
  if (Math.abs(actual - expected) > Number.EPSILON * 8) {
    throw new Error(
      `${label}: expected ${String(expected)}, received ${String(actual)}`,
    );
  }
}

const liveInput = mapOilFundamentalsToMacroInput({
  inventories: { latest: 90, previous: 100, changePct: -4, period: "2026-W04" },
  production: { latest: 90, previous: 100, changePct: -2, period: "2026-W03" },
  globalDemand: { latest: 110, previous: 100, changePct: 2, period: "2025" },
  provider: "eia",
  fetchedAt: "2099-01-01T00:00:00.000Z",
});
const live = calculateOilMacro(liveInput);

if (live.canonical.availability !== "partial") {
  throw new Error(`live Oil canonical macro: received ${live.canonical.availability}`);
}

assertClose(live.canonical.data.score, 1, "Oil representative score");
assertClose(live.score, 1, "Oil legacy score compatibility");
assertClose(live.canonical.data.coverage, 0.85, "Oil maximum live coverage");
assertEqual(live.canonical.missing.join(","), "usd", "Oil USD missing");
assertEqual(
  live.canonical.data.drivers.map((driver) => driver.id).join(","),
  "global-demand,inventories,production,usd",
  "Oil deterministic driver order",
);
assertEqual(
  live.canonical.data.drivers
    .map((driver) => driver.availability === "available" ? driver.observedAt : null)
    .join(","),
  "2025,2026-W04,2026-W03,",
  "Oil source-period preservation",
);
assertEqual(OIL_MACRO_WEIGHTS.inventories, 0.35, "Oil inventories weight");
assertEqual(OIL_MACRO_WEIGHTS.production, 0.25, "Oil production weight");
assertEqual(OIL_MACRO_WEIGHTS.globalDemand, 0.25, "Oil demand weight");
assertEqual(OIL_MACRO_WEIGHTS.usd, 0.15, "Oil USD weight");

const liveContribution = live.canonical.data.drivers.reduce(
  (sum, driver) =>
    sum + (driver.availability === "available" ? driver.weightedContribution : 0),
  0,
);
assertClose(
  liveContribution,
  live.canonical.data.coverage * live.canonical.data.score,
  "Oil contribution sum invariant",
);

const inventoriesDriver = live.canonical.data.drivers.find(
  (driver) => driver.id === "inventories",
);
assertClose(
  inventoriesDriver?.availability === "available"
    ? inventoriesDriver.weightedContribution
    : Number.NaN,
  0.35,
  "Oil inventories weighted contribution",
);

const full = calculateOilMacro({
  inventoriesChangePct: -4,
  productionChangePct: -2,
  globalDemandChangePct: 2,
  usdChangePct: -2,
});
assertEqual(full.canonical.availability, "available", "Oil full availability");
if (full.canonical.availability === "available") {
  assertClose(full.canonical.data.coverage, 1, "Oil full coverage");
}

const unavailable = calculateOilMacro({
  inventoriesChangePct: null,
  productionChangePct: null,
  globalDemandChangePct: null,
  usdChangePct: null,
});
assertEqual(unavailable.canonical.availability, "unavailable", "Oil all missing");

console.log("PASS: Oil canonical macro integration");
