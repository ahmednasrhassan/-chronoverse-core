import {
  calculateOilIntelligence,
} from "../../assets/oil/intelligence";

/**
 * Chronoverse Capital
 * Oil Intelligence + Macro Integration Test
 *
 * Verifies that:
 * 1. Oil still uses the Universal Intelligence Core.
 * 2. Oil macro intelligence is attached correctly.
 * 3. Missing macro input returns null.
 */

const closes = Array.from(
  { length: 260 },
  (_, index) => {
    const trend =
      70 + index * 0.05;

    const cycle =
      Math.sin(index / 8) * 2;

    return trend + cycle;
  },
);

const withMacro =
  calculateOilIntelligence({
    closes,

    macro: {
      inventoriesChangePct: -2.5,
      productionChangePct: 0.4,
      globalDemandChangePct: 1.2,
      usdChangePct: -0.8,
    },
  });

console.log(
  "\nOIL INTELLIGENCE + MACRO\n",
);

console.dir(
  withMacro,
  {
    depth: null,
  },
);

if (
  withMacro.profileId !== "oil"
) {
  throw new Error(
    "Oil Intelligence returned the wrong profile.",
  );
}

if (
  withMacro.price === null
) {
  throw new Error(
    "Oil Intelligence failed to calculate price.",
  );
}

if (
  withMacro.macro === null
) {
  throw new Error(
    "Oil macro result was not attached to Oil Intelligence.",
  );
}

if (
  !Number.isFinite(
    withMacro.macro.score,
  )
) {
  throw new Error(
    "Oil macro score is invalid.",
  );
}

if (
  withMacro.macro.coverage !== 1
) {
  throw new Error(
    "Oil macro coverage should be complete when all drivers are supplied.",
  );
}

if (
  withMacro.macro.reasons.length !== 4
) {
  throw new Error(
    "Oil macro should contain four available driver reasons.",
  );
}

const withoutMacro =
  calculateOilIntelligence({
    closes,
  });

if (
  withoutMacro.macro !== null
) {
  throw new Error(
    "Oil Intelligence should return null macro when macro input is omitted.",
  );
}

console.log(
  "\nPASS: Oil macro is integrated with Oil Intelligence",
);