import {
  calculateMarketIntelligence,
  type MarketIntelligenceResult,
} from "../../core/marketIntelligence";

import {
  calculateOilMacro,
  type OilMacroInput,
  type OilMacroResult,
} from "./macro";

import {
  oilProfile,
} from "./profile";

export type OilIntelligenceInput = {
  closes: readonly number[];

  /**
   * Optional Oil-specific macro/fundamental data.
   *
   * Technical, risk and signal calculations
   * remain inside the Universal Core.
   */
  macro?:
    OilMacroInput | null;
};

export type OilIntelligenceResult =
  MarketIntelligenceResult & {
    /**
     * Oil-specific macro intelligence.
     *
     * Null when no macro input is supplied.
     */
    macro:
      OilMacroResult | null;
  };

/**
 * Chronoverse Capital
 * Oil Intelligence Adapter
 *
 * Shared market calculations:
 * - Technical
 * - Risk
 * - Signal
 *
 * are delegated to the Universal
 * Market Intelligence Core.
 *
 * Oil-specific macro interpretation
 * is handled by the Oil macro layer.
 */
export function calculateOilIntelligence(
  input: OilIntelligenceInput,
): OilIntelligenceResult {
  const core =
    calculateMarketIntelligence({
      profile: oilProfile,
      closes: input.closes,
    });

  const macro =
    input.macro === null ||
    input.macro === undefined
      ? null
      : calculateOilMacro(
          input.macro,
        );

  return {
    ...core,
    macro,
  };
}