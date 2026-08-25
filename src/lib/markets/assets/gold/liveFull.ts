import {
  calculateGoldIntelligence,
  type GoldIntelligenceResult,
} from "./intelligence";

import {
  fetchGoldCloses,
} from "./price";

import {
  getGoldMacroSnapshot,
} from "./macro";

import {
  calculateGoldMacroScore,
} from "./macroScore";

import {
  createFredProvider,
} from "../../providers/fred/register";
/**
 * Chronoverse Capital
 * Full Live Gold Intelligence
 *
 * Real Gold Prices
 * +
 * Real FRED Macro Data
 * +
 * Technical Indicators
 * +
 * Risk Engine
 * +
 * Signal Engine
 * =
 * Full Gold Intelligence
 *
 * Server-side only.
 */
export async function getFullLiveGoldIntelligence():
  Promise<GoldIntelligenceResult> {
  /*
   * ------------------------------------------------------
   * PROVIDERS
   * ------------------------------------------------------
   */

  const fredProvider =
    createFredProvider();

  /*
   * ------------------------------------------------------
   * LIVE DATA
   *
   * Gold market history and macro data are independent,
   * so fetch them concurrently.
   * ------------------------------------------------------
   */

  const [
    allCloses,
    macroSnapshot,
  ] = await Promise.all([
    fetchGoldCloses(),

    getGoldMacroSnapshot(
      fredProvider,
    ),
  ]);

  /*
   * ------------------------------------------------------
   * PRICE VALIDATION
   * ------------------------------------------------------
   */

  if (allCloses.length === 0) {
    throw new Error(
      "[Chronoverse Gold] No live gold price history available.",
    );
  }

  /*
   * Keep enough history for:
   *
   * EMA 200
   * RSI
   * MACD
   * Momentum
   * Volatility
   *
   * while avoiding unnecessary processing of
   * the entire historical dataset.
   */
  const closes =
    allCloses.slice(-600);

  /*
   * ------------------------------------------------------
   * MACRO ENGINE
   * ------------------------------------------------------
   */

  const macro =
    calculateGoldMacroScore(
      macroSnapshot,
    );

  /*
   * ------------------------------------------------------
   * FINAL INTELLIGENCE ENGINE
   * ------------------------------------------------------
   */

  return calculateGoldIntelligence({
    closes,
    macro,
  });
}