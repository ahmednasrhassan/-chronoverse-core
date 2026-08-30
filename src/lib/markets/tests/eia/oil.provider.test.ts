import { loadEnvConfig } from "@next/env";

import {
  eiaOilFundamentalsProvider,
} from "../../providers/eia/provider";

loadEnvConfig(process.cwd());

async function main() {
  console.log(
    "EIA OIL FUNDAMENTALS PROVIDER TEST",
  );

  if (
    !eiaOilFundamentalsProvider.isConfigured()
  ) {
    throw new Error(
      "EIA provider is not configured.",
    );
  }

  const snapshot =
    await eiaOilFundamentalsProvider.getOilFundamentals();

  console.log(snapshot);

  if (
    snapshot.inventories.latest === null ||
    snapshot.inventories.previous === null ||
    snapshot.inventories.changePct === null
  ) {
    throw new Error(
      "Inventory snapshot is incomplete.",
    );
  }

  if (
    snapshot.production.latest === null ||
    snapshot.production.previous === null ||
    snapshot.production.changePct === null
  ) {
    throw new Error(
      "Production snapshot is incomplete.",
    );
  }

  if (
    snapshot.globalDemand.latest === null ||
    snapshot.globalDemand.previous === null ||
    snapshot.globalDemand.changePct === null
  ) {
    throw new Error(
      "Global demand snapshot is incomplete.",
    );
  }

  if (
    !Number.isFinite(
      snapshot.globalDemand.changePct,
    )
  ) {
    throw new Error(
      "Global demand change is invalid.",
    );
  }

  if (
    snapshot.provider !== "eia"
  ) {
    throw new Error(
      `Unexpected provider: ${snapshot.provider}`,
    );
  }

  if (
    !snapshot.fetchedAt
  ) {
    throw new Error(
      "Snapshot fetchedAt is missing.",
    );
  }

  console.log(
    "PASS: EIA Oil fundamentals provider returns inventories, production and global demand",
  );
}

main().catch(
  (error) => {
    console.error(error);
    process.exit(1);
  },
);