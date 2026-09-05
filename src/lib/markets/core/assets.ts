import type {
  AssetClass,
} from "./types";

export type MarketAssetId =
  | "gold"
  | "oil"
  | "sp500"
  | "nasdaq100"
  | "bitcoin"
  | "dxy"
  | "us10y"
  | "silver"
  | "copper"
  | "naturalGas"
  | "eurusd"
  | "ethereum";

export interface AssetDefinition {
  id: MarketAssetId;

  displayName: string;
  displaySymbol: string;

  assetClass: AssetClass;

  providerSymbols: {
    yahoo?: string;
  };
}

export const assetRegistry = {
  gold: {
    id: "gold",
    displayName: "Gold",
    displaySymbol: "Gold",
    assetClass: "commodity",
    providerSymbols: {
      yahoo: "GC=F",
    },
  },

  oil: {
    id: "oil",
    displayName: "WTI Crude Oil",
    displaySymbol: "WTI",
    assetClass: "commodity",
    providerSymbols: {
      yahoo: "CL=F",
    },
  },

  sp500: {
    id: "sp500",
    displayName: "S&P 500",
    displaySymbol: "S&P 500",
    assetClass: "index",
    providerSymbols: {
      yahoo: "^GSPC",
    },
  },

  nasdaq100: {
    id: "nasdaq100",
    displayName: "Nasdaq-100",
    displaySymbol: "Nasdaq-100",
    assetClass: "index",
    providerSymbols: {
      yahoo: "^NDX",
    },
  },

  bitcoin: {
    id: "bitcoin",
    displayName: "Bitcoin",
    displaySymbol: "BTC",
    assetClass: "crypto",
    providerSymbols: {
      yahoo: "BTC-USD",
    },
  },

  dxy: {
    id: "dxy",
    displayName: "US Dollar Index",
    displaySymbol: "DXY",
    assetClass: "index",
    providerSymbols: {
      yahoo: "DX-Y.NYB",
    },
  },

  us10y: {
    id: "us10y",
    displayName: "US 10-Year Treasury Yield",
    displaySymbol: "US10Y",
    assetClass: "bond",
    providerSymbols: {
      yahoo: "^TNX",
    },
  },

  silver: {
    id: "silver",
    displayName: "Silver",
    displaySymbol: "Silver",
    assetClass: "commodity",
    providerSymbols: {
      yahoo: "SI=F",
    },
  },

  copper: {
    id: "copper",
    displayName: "Copper",
    displaySymbol: "Copper",
    assetClass: "commodity",
    providerSymbols: {
      yahoo: "HG=F",
    },
  },

  naturalGas: {
    id: "naturalGas",
    displayName: "Natural Gas (Henry Hub)",
    displaySymbol: "Natural Gas",
    assetClass: "commodity",
    providerSymbols: {
      yahoo: "NG=F",
    },
  },

  eurusd: {
    id: "eurusd",
    displayName: "EUR/USD",
    displaySymbol: "EUR/USD",
    assetClass: "forex",
    providerSymbols: {
      yahoo: "EURUSD=X",
    },
  },

  ethereum: {
    id: "ethereum",
    displayName: "Ethereum",
    displaySymbol: "ETH",
    assetClass: "crypto",
    providerSymbols: {
      yahoo: "ETH-USD",
    },
  },
} satisfies Record<
  MarketAssetId,
  AssetDefinition
>;
