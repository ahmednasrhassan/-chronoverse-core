import type {
  OilMacroInput,
} from "./macro";

import {
  getEiaOilFundamentals,
} from "../../providers/eia/oilFundamentalsCache";
/**
 * Chronoverse Capital
 * Oil Macro Data Adapter
 *
 * Converts normalized official provider data
 * into the input contract expected by the
 * Oil Macro Intelligence layer.
 *
 * Missing drivers remain null.
 * They must never be replaced with synthetic
 * values in production intelligence.
 */
export async function getOilMacroInput():
  Promise<OilMacroInput> {
  const fundamentals =
    await getEiaOilFundamentals();

  return {
    inventoriesChangePct:
      fundamentals
        .inventories
        .changePct,

    productionChangePct:
      fundamentals
        .production
        .changePct,

    globalDemandChangePct:
      fundamentals
        .globalDemand
        .changePct,

    usdChangePct:
      null,
  };
}