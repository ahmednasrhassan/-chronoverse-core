import { loadEnvConfig } from "@next/env";

import { eiaClient } from "../../providers/eia/client";

loadEnvConfig(process.cwd());

async function main() {
  console.log("EIA CLIENT TEST");

  if (!eiaClient.isConfigured()) {
    throw new Error(
      "EIA_API_KEY is not loaded.",
    );
  }

  const result =
    await eiaClient.getSeries({
      route:
        "petroleum/stoc/wstk",

      valueField:
        "value",

      frequency:
        "weekly",

      length:
        1,
    });

  console.log({
    configured: true,
    provider:
      result.provider,
    frequency:
      result.frequency,
    points:
      result.points.slice(
        0,
        1,
      ),
  });

  if (
    result.points.length ===
    0
  ) {
    throw new Error(
      "EIA returned no data.",
    );
  }

  console.log(
    "PASS: EIA connection works",
  );
}

main().catch(
  (error) => {
    console.error(error);
    process.exit(1);
  },
);