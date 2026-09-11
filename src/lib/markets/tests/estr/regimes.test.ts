import {
  classifyEstrRateLevelRegimeV1,
  classifyEstrRateVolatilityRegimeV1,
} from "../../assets/estr/regimes";
import { estrRateCalibrationProfileV1 } from "../../assets/estr/profile";

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (!Object.is(actual, expected)) {
    throw new Error(
      `${label}: expected ${String(expected)}, received ${String(actual)}`,
    );
  }
}

function level(value: number): string {
  const result = classifyEstrRateLevelRegimeV1(value);
  if (result.availability !== "available") {
    throw new Error(`Expected available level regime for ${value}.`);
  }
  return result.regime;
}

function volatility(value: number): string {
  const result = classifyEstrRateVolatilityRegimeV1(value);
  if (result.availability !== "available") {
    throw new Error(`Expected available volatility regime for ${value}.`);
  }
  return result.regime;
}

const levelThresholds = estrRateCalibrationProfileV1.levelRegime;
const boundaryDelta = 1e-12;
assertEqual(level(-5), "low", "deep negative rate");
assertEqual(level(levelThresholds.lowUpperPercent - boundaryDelta), "low",
  "just below low boundary");
assertEqual(level(levelThresholds.lowUpperPercent), "middle",
  "exact low boundary");
assertEqual(level(0), "middle", "zero rate");
assertEqual(level(levelThresholds.highLowerPercent - boundaryDelta), "middle",
  "just below high boundary");
assertEqual(level(levelThresholds.highLowerPercent), "high",
  "exact high boundary");
assertEqual(level(8), "high", "rate above high boundary");

for (const invalid of [null, undefined, Number.NaN, Number.POSITIVE_INFINITY,
  Number.NEGATIVE_INFINITY]) {
  assertEqual(classifyEstrRateLevelRegimeV1(invalid).availability, "unavailable",
    `invalid level ${String(invalid)}`);
}
assertEqual(
  JSON.stringify(classifyEstrRateLevelRegimeV1(-0.25)),
  JSON.stringify(classifyEstrRateLevelRegimeV1(-0.25)),
  "level regime is deterministic",
);

const volatilityThresholds = estrRateCalibrationProfileV1.volatilityRegime;
assertEqual(volatility(0), "calm", "zero volatility");
assertEqual(volatility(volatilityThresholds.calmUpperBp), "calm",
  "exact calm boundary");
assertEqual(volatility(volatilityThresholds.calmUpperBp + boundaryDelta),
  "elevated", "just above calm boundary");
assertEqual(volatility(volatilityThresholds.stressedLowerBp - boundaryDelta),
  "elevated", "just below stressed boundary");
assertEqual(volatility(volatilityThresholds.stressedLowerBp), "stressed",
  "exact stressed boundary");
assertEqual(volatility(25), "stressed", "above stressed boundary");

for (const invalid of [-boundaryDelta, null, undefined, Number.NaN,
  Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
  assertEqual(
    classifyEstrRateVolatilityRegimeV1(invalid).availability,
    "unavailable",
    `invalid volatility ${String(invalid)}`,
  );
}
assertEqual(
  JSON.stringify(classifyEstrRateVolatilityRegimeV1(1.25)),
  JSON.stringify(classifyEstrRateVolatilityRegimeV1(1.25)),
  "volatility regime is deterministic",
);

console.log("PASS: €STR Rate Regimes V1");
