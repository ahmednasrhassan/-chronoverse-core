import {
  calculateOilIntelligence,
} from "../../assets/oil/intelligence";

import {
  calculateMarketIntelligence,
} from "../../core/marketIntelligence";

import {
  oilProfile,
} from "../../assets/oil/profile";

function buildSyntheticOilCloses(
  count = 320,
): number[] {
  const closes: number[] = [];

  for (
    let index = 0;
    index < count;
    index += 1
  ) {
    const trend =
      68 +
      index * 0.045;

    const cycle =
      Math.sin(
        index / 9,
      ) * 1.8;

    const secondaryCycle =
      Math.cos(
        index / 21,
      ) * 0.9;

    closes.push(
      Number(
        (
          trend +
          cycle +
          secondaryCycle
        ).toFixed(6),
      ),
    );
  }

  return closes;
}

function assertEqual(
  label: string,
  left: unknown,
  right: unknown,
): void {
  const leftJson =
    JSON.stringify(left);

  const rightJson =
    JSON.stringify(right);

  if (
    leftJson !==
    rightJson
  ) {
    console.error(
      `FAIL: ${label}`,
    );

    console.error(
      "Oil adapter:",
      left,
    );

    console.error(
      "Universal core:",
      right,
    );

    process.exitCode = 1;

    throw new Error(
      `${label} does not match.`,
    );
  }
}

const closes =
  buildSyntheticOilCloses();

const oil =
  calculateOilIntelligence({
    closes,
  });

const core =
  calculateMarketIntelligence({
    profile: oilProfile,
    closes,
  });

console.log(
  "\nOIL ↔ UNIVERSAL INTELLIGENCE REGRESSION\n",
);

console.log(
  "OIL ADAPTER",
);

console.dir(
  oil,
  {
    depth: null,
  },
);

console.log(
  "\nUNIVERSAL CORE",
);

console.dir(
  core,
  {
    depth: null,
  },
);

assertEqual(
  "profileId",
  oil.profileId,
  core.profileId,
);

assertEqual(
  "price",
  oil.price,
  core.price,
);

assertEqual(
  "technical",
  oil.technical,
  core.technical,
);

assertEqual(
  "risk",
  oil.risk,
  core.risk,
);

assertEqual(
  "signal",
  oil.signal,
  core.signal,
);

console.log(
  "\nPASS: Oil matches Universal Intelligence Core\n",
);