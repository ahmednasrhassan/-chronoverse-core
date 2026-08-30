import { loadEnvConfig } from "@next/env";

import { eiaClient } from "../../providers/eia/client";

loadEnvConfig(process.cwd());

async function main() {
  console.log("EIA OIL INVENTORIES TEST");

  const result =
    await eiaClient.getSeries({
      route:
        "petroleum/stoc/wstk",

      valueField:
        "value",

      frequency:
        "weekly",

      facets: {
        series: [
          "WCESTUS1",
        ],
      },

      length:
        2,

      unit:
        "thousand barrels",
    });

  console.log({
    provider:
      result.provider,
    frequency:
      result.frequency,
    unit:
      result.unit,
    points:
      result.points,
  });

  if (
    result.points.length <
    2
  ) {
    throw new Error(
      "Expected at least two inventory observations.",
    );
  }

  const latest =
    result.points[0];

  const previous =
    result.points[1];

  const changePct =
    ((latest.value -
      previous.value) /
      previous.value) *
    100;

  console.log({
    latest,
    previous,
    changePct,
  });

  console.log(
    "PASS: EIA commercial crude inventories are working",
  );
}

main().catch(
  (error) => {
    console.error(error);

    process.exit(1);
  },
);