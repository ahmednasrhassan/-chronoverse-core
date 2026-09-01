import {
  calculateOilRegimeMemory,
  type OilRegimeSnapshot,
} from "../../assets/oil/regimeMemory";

import {
  calculateMarketRegimeMemory,
} from "../../core/regimeMemory";

function assertEqual(
  actual: unknown,
  expected: unknown,
  message: string,
): void {
  const actualJson =
    JSON.stringify(actual);

  const expectedJson =
    JSON.stringify(expected);

  if (
    actualJson !==
    expectedJson
  ) {
    throw new Error(
      [
        `FAIL: ${message}`,
        `Actual: ${actualJson}`,
        `Expected: ${expectedJson}`,
      ].join("\n"),
    );
  }
}

const previous: OilRegimeSnapshot = {
  timestamp:
    "2026-09-01T10:00:00.000Z",

  state:
    "caution",

  confidence:
    0.55,

  signalDirection:
    "neutral",

  signalConfidence:
    0.55,

  macroBias:
    "neutral",

  macroConfidence:
    0.5,

  riskLevel:
    "moderate",

  riskScore:
    0.4,
};

const current: OilRegimeSnapshot = {
  timestamp:
    "2026-09-01T11:00:00.000Z",

  state:
    "opportunity",

  confidence:
    0.7,

  signalDirection:
    "bullish",

  signalConfidence:
    0.7,

  macroBias:
    "bullish",

  macroConfidence:
    0.65,

  riskLevel:
    "low",

  riskScore:
    0.3,
};

const oil =
  calculateOilRegimeMemory(
    current,
    previous,
  );

const universal =
  calculateMarketRegimeMemory(
    current,
    previous,
    (
      state,
    ) => {
      if (
        state ===
        "opportunity"
      ) {
        return 2;
      }

      if (
        state ===
        "caution"
      ) {
        return 1;
      }

      return 0;
    },
  );

assertEqual(
  oil,
  universal,
  "Oil must match Universal Regime Memory.",
);

console.log(
  "\n========================================",
);

console.log(
  "PASS: Oil matches Universal Regime Memory",
);

console.log(
  "========================================\n",
);