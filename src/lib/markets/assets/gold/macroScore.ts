import type {
  GoldMacroSnapshot,
} from "./macro";

export type GoldMacroBias =
  | "bullish"
  | "neutral"
  | "bearish";

export type GoldMacroStrength =
  | "weak"
  | "moderate"
  | "strong";

export type GoldMacroScoreResult = {
  score: number;
  bias: GoldMacroBias;
  strength: GoldMacroStrength;

  confidence: number;
  coverage: number;

  factors: {
    realYield10Y: number | null;
    nominalYield10Y: number | null;
    dollarIndexProxy: number | null;
    inflationExpectation10Y: number | null;
  };

  reasons: string[];
};

/**
 * Chronoverse Capital
 * Gold Macro Score Engine — V1
 *
 * Converts normalized macro observations into
 * a directional macro bias for gold.
 *
 * Score:
 * -1 = strongly bearish macro environment
 *  0 = neutral / mixed
 * +1 = strongly bullish macro environment
 *
 * Important:
 * This module has NO knowledge of FRED.
 * It consumes normalized GoldMacroSnapshot only.
 */
export function calculateGoldMacroScore(
  snapshot: GoldMacroSnapshot,
): GoldMacroScoreResult {
  let weightedScore = 0;
  let availableWeight = 0;

  const reasons: string[] = [];

  const realYield10Y =
    snapshot.realYield10Y?.value ?? null;

  const nominalYield10Y =
    snapshot.nominalYield10Y?.value ?? null;

  const dollarIndexProxy =
    snapshot.dollarIndexProxy?.value ?? null;

  const inflationExpectation10Y =
    snapshot.inflationExpectation10Y?.value ??
    null;

  /*
   * ======================================================
   * REAL YIELD
   * Weight: 40%
   *
   * Higher real yields generally increase the
   * opportunity cost of holding non-yielding gold.
   * ======================================================
   */

  if (realYield10Y !== null) {
    const weight = 0.4;

    availableWeight += weight;

    const factorScore =
      scoreRealYield(realYield10Y);

    weightedScore +=
      factorScore * weight;

    if (factorScore >= 0.5) {
      reasons.push(
        "Low real yields provide a supportive macro backdrop for gold.",
      );
    } else if (factorScore > 0) {
      reasons.push(
        "Real yields are moderately supportive for gold.",
      );
    } else if (factorScore <= -0.5) {
      reasons.push(
        "Elevated real yields create meaningful pressure on gold.",
      );
    } else if (factorScore < 0) {
      reasons.push(
        "Real yields create moderate pressure on gold.",
      );
    } else {
      reasons.push(
        "Real yields are broadly neutral for gold.",
      );
    }
  }

  /*
   * ======================================================
   * DOLLAR INDEX PROXY
   * Weight: 30%
   *
   * A stronger broad USD environment generally
   * creates a headwind for dollar-denominated gold.
   * ======================================================
   */

  if (dollarIndexProxy !== null) {
    const weight = 0.3;

    availableWeight += weight;

    const factorScore =
      scoreDollarIndex(
        dollarIndexProxy,
      );

    weightedScore +=
      factorScore * weight;

    if (factorScore >= 0.5) {
      reasons.push(
        "A relatively soft dollar environment is supportive for gold.",
      );
    } else if (factorScore > 0) {
      reasons.push(
        "Dollar conditions are moderately supportive for gold.",
      );
    } else if (factorScore <= -0.5) {
      reasons.push(
        "A strong dollar environment is a significant headwind for gold.",
      );
    } else if (factorScore < 0) {
      reasons.push(
        "Dollar conditions create moderate pressure on gold.",
      );
    } else {
      reasons.push(
        "Dollar conditions are broadly neutral for gold.",
      );
    }
  }

  /*
   * ======================================================
   * INFLATION EXPECTATIONS
   * Weight: 20%
   *
   * Higher inflation expectations can increase
   * demand for inflation hedges, but extreme levels
   * must still be interpreted alongside real yields.
   * ======================================================
   */

  if (
    inflationExpectation10Y !== null
  ) {
    const weight = 0.2;

    availableWeight += weight;

    const factorScore =
      scoreInflationExpectation(
        inflationExpectation10Y,
      );

    weightedScore +=
      factorScore * weight;

    if (factorScore >= 0.5) {
      reasons.push(
        "Elevated inflation expectations strengthen gold's hedge appeal.",
      );
    } else if (factorScore > 0) {
      reasons.push(
        "Inflation expectations provide moderate support for gold.",
      );
    } else if (factorScore < 0) {
      reasons.push(
        "Contained inflation expectations reduce macro hedge demand for gold.",
      );
    } else {
      reasons.push(
        "Inflation expectations are broadly neutral for gold.",
      );
    }
  }

  /*
   * ======================================================
   * NOMINAL 10Y YIELD
   * Weight: 10%
   *
   * Secondary factor because the real yield already
   * contains more useful information for gold.
   * ======================================================
   */

  if (nominalYield10Y !== null) {
    const weight = 0.1;

    availableWeight += weight;

    const factorScore =
      scoreNominalYield(
        nominalYield10Y,
      );

    weightedScore +=
      factorScore * weight;

    if (factorScore > 0) {
      reasons.push(
        "Nominal Treasury yields remain relatively supportive for gold.",
      );
    } else if (factorScore < 0) {
      reasons.push(
        "Elevated nominal Treasury yields create an additional gold headwind.",
      );
    } else {
      reasons.push(
        "Nominal Treasury yields are broadly neutral.",
      );
    }
  }

  /*
   * ======================================================
   * NO MACRO DATA
   * ======================================================
   */

  if (availableWeight === 0) {
    return {
      score: 0,
      bias: "neutral",
      strength: "weak",

      confidence: 0,
      coverage: 0,

      factors: {
        realYield10Y,
        nominalYield10Y,
        dollarIndexProxy,
        inflationExpectation10Y,
      },

      reasons: [
        "Insufficient macroeconomic data for gold macro scoring.",
      ],
    };
  }

  /*
   * ======================================================
   * NORMALIZATION
   * ======================================================
   */

  const normalizedScore =
    clamp(
      weightedScore /
        availableWeight,
      -1,
      1,
    );

  /*
   * ======================================================
   * BIAS
   * ======================================================
   */

  let bias: GoldMacroBias =
    "neutral";

  if (normalizedScore >= 0.2) {
    bias = "bullish";
  } else if (
    normalizedScore <= -0.2
  ) {
    bias = "bearish";
  }

  /*
   * ======================================================
   * STRENGTH
   * ======================================================
   */

  const absoluteScore =
    Math.abs(normalizedScore);

  let strength: GoldMacroStrength =
    "weak";

  if (absoluteScore >= 0.7) {
    strength = "strong";
  } else if (
    absoluteScore >= 0.4
  ) {
    strength = "moderate";
  }

  /*
   * ======================================================
   * COVERAGE + CONFIDENCE
   * ======================================================
   */

  const coverage =
    clamp(
      availableWeight,
      0,
      1,
    );

  const confidence =
    clamp(
      coverage *
        (
          0.55 +
          absoluteScore * 0.45
        ),
      0,
      1,
    );

  return {
    score: Number(
      normalizedScore.toFixed(4),
    ),

    bias,
    strength,

    confidence: Number(
      confidence.toFixed(4),
    ),

    coverage: Number(
      coverage.toFixed(4),
    ),

    factors: {
      realYield10Y,
      nominalYield10Y,
      dollarIndexProxy,
      inflationExpectation10Y,
    },

    reasons,
  };
}

/**
 * Real yield scoring.
 *
 * Lower real yield = more supportive for gold.
 */
function scoreRealYield(
  value: number,
): number {
  if (value <= 0) {
    return 1;
  }

  if (value <= 1) {
    return 0.65;
  }

  if (value <= 1.75) {
    return 0.25;
  }

  if (value <= 2.25) {
    return -0.15;
  }

  if (value <= 3) {
    return -0.6;
  }

  return -1;
}

/**
 * Broad dollar proxy scoring.
 *
 * This is deliberately conservative.
 * Later versions should also use rate-of-change
 * rather than relying only on the absolute level.
 */
function scoreDollarIndex(
  value: number,
): number {
  if (value <= 100) {
    return 0.8;
  }

  if (value <= 105) {
    return 0.5;
  }

  if (value <= 110) {
    return 0.15;
  }

  if (value <= 115) {
    return -0.25;
  }

  if (value <= 120) {
    return -0.6;
  }

  return -0.9;
}

/**
 * Inflation expectations scoring.
 */
function scoreInflationExpectation(
  value: number,
): number {
  if (value < 1.5) {
    return -0.5;
  }

  if (value < 2) {
    return -0.15;
  }

  if (value < 2.5) {
    return 0.2;
  }

  if (value < 3) {
    return 0.55;
  }

  return 0.8;
}

/**
 * Nominal Treasury yield scoring.
 *
 * Kept at a low weight because real yield
 * is the more important rate signal.
 */
function scoreNominalYield(
  value: number,
): number {
  if (value <= 2.5) {
    return 0.6;
  }

  if (value <= 3.5) {
    return 0.25;
  }

  if (value <= 4.25) {
    return 0;
  }

  if (value <= 5) {
    return -0.35;
  }

  return -0.65;
}

function clamp(
  value: number,
  min: number,
  max: number,
): number {
  return Math.min(
    max,
    Math.max(
      min,
      value,
    ),
  );
}