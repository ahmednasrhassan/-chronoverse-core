import {
  calculateOilIntelligence,
} from "../../assets/oil/intelligence";

function assert(
  condition: boolean,
  message: string,
): void {
  if (!condition) {
    throw new Error(
      `FAIL: ${message}`,
    );
  }
}

const closes =
  Array.from(
    {
      length: 600,
    },
    (
      _,
      index,
    ) =>
      70 +
      index * 0.05,
  );

const result =
  calculateOilIntelligence({
    closes,

    macro: {
      inventoriesChangePct:
        -2,

      productionChangePct:
        0.25,

      globalDemandChangePct:
        1,

      usdChangePct:
        -0.5,
    },
  });

assert(
  result.state ===
    "opportunity" ||
    result.state ===
    "caution" ||
    result.state ===
    "risk",
  "Oil must return a valid universal market state.",
);

assert(
  Number.isFinite(
    result.confidence,
  ) &&
    result.confidence >= 0 &&
    result.confidence <= 1,
  "Oil confidence must be between 0 and 1.",
);

assert(
  result.macro !== null,
  "Oil macro result must be available.",
);

console.log(
  "\n========================================",
);

console.log(
  "PASS: Oil uses Universal Market State",
);

console.log(
  "========================================\n",
);