import { loadEnvConfig } from "@next/env";

import {
  calculateOilIntelligence,
} from "../../assets/oil/intelligence";

import {
  getOilMacroInput,
} from "../../assets/oil/macroData";

loadEnvConfig(process.cwd());

async function main() {
  console.log(
    "OIL INTELLIGENCE + LIVE EIA MACRO",
  );

  /*
   * Synthetic closes are intentionally used here
   * only for the price/technical side of this test.
   *
   * Macro data below is LIVE and comes from
   * the official EIA provider.
   */
  const closes =
    Array.from(
      {
        length: 260,
      },
      (_, index) =>
        70 +
        index * 0.05 +
        Math.sin(index / 8) * 2,
    );

  const macro =
    await getOilMacroInput();

  console.log(
    "LIVE MACRO INPUT",
    macro,
  );

  const result =
    calculateOilIntelligence({
      closes,
      macro,
    });

  console.log(
    "OIL INTELLIGENCE",
    result,
  );

  if (!result.macro) {
    throw new Error(
      "Oil macro result is missing.",
    );
  }

  if (
    macro.inventoriesChangePct ===
      null ||
    !Number.isFinite(
      macro.inventoriesChangePct,
    )
  ) {
    throw new Error(
      "Live EIA inventories data is missing or invalid.",
    );
  }

  if (
    macro.productionChangePct ===
      null ||
    !Number.isFinite(
      macro.productionChangePct,
    )
  ) {
    throw new Error(
      "Live EIA production data is missing or invalid.",
    );
  }

  if (
    macro.globalDemandChangePct ===
      null ||
    !Number.isFinite(
      macro.globalDemandChangePct,
    )
  ) {
    throw new Error(
      "Live EIA global demand data is missing or invalid.",
    );
  }

  /*
   * USD is intentionally not connected yet.
   *
   * Missing production drivers must remain null
   * rather than being replaced with synthetic data.
   */
  if (
    macro.usdChangePct !== null
  ) {
    throw new Error(
      "USD macro driver must remain null until an official source is connected.",
    );
  }

  /*
   * Connected Oil macro weights:
   *
   * inventories   = 0.35
   * production    = 0.25
   * global demand = 0.25
   *
   * Expected coverage = 0.85.
   */
  if (
    Math.abs(
      result.macro.coverage -
        0.85,
    ) > 0.0001
  ) {
    throw new Error(
      `Unexpected macro coverage: ${result.macro.coverage}`,
    );
  }

  /*
   * The current official annual EIA series
   * is expected to represent positive
   * year-over-year global demand growth.
   *
   * We deliberately avoid pinning the test
   * to an exact percentage because the EIA
   * dataset can be revised over time.
   */
  if (
    macro.globalDemandChangePct <= 0
  ) {
    throw new Error(
      `Unexpected global demand change: ${macro.globalDemandChangePct}`,
    );
  }

  console.log(
    "PASS: Live EIA inventories, production and global demand reach Oil Intelligence",
  );
}

main().catch(
  (error) => {
    console.error(error);
    process.exit(1);
  },
);