import type {
  MarketAssetId,
} from "./assets";

import type {
  MarketAssetProfile,
} from "./assetProfile";

import {
  goldProfile,
} from "../assets/gold/profile";
import {
  oilProfile,
} from "../assets/oil/profile";
import {
  sp500Profile,
} from "../assets/sp500/profile";
import {
  nasdaq100Profile,
} from "../assets/nasdaq100/profile";
import {
  bitcoinProfile,
} from "../assets/bitcoin/profile";
import {
  dxyProfile,
} from "../assets/dxy/profile";
import {
  us10yProfile,
} from "../assets/us10y/profile";
import {
  silverProfile,
} from "../assets/silver/profile";
import {
  copperProfile,
} from "../assets/copper/profile";
import {
  naturalGasProfile,
} from "../assets/naturalGas/profile";
import {
  eurusdProfile,
} from "../assets/eurusd/profile";
import {
  ethereumProfile,
} from "../assets/ethereum/profile";

export const marketAssetProfiles = {
  gold: goldProfile,
  oil: oilProfile,
  sp500: sp500Profile,
  nasdaq100: nasdaq100Profile,
  bitcoin: bitcoinProfile,
  dxy: dxyProfile,
  us10y: us10yProfile,
  silver: silverProfile,
  copper: copperProfile,
  naturalGas: naturalGasProfile,
  eurusd: eurusdProfile,
  ethereum: ethereumProfile,
} satisfies Record<
  MarketAssetId,
  MarketAssetProfile
>;
