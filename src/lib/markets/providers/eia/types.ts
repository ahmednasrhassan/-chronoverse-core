/**
 * Chronoverse Capital
 * EIA Provider Types
 *
 * Raw and normalized contracts for official
 * U.S. Energy Information Administration data.
 *
 * EIA remains an implementation detail.
 * Asset intelligence layers should consume
 * normalized Chronoverse values rather than
 * depending directly on EIA response shapes.
 */

export type EiaFrequency =
  | "daily"
  | "weekly"
  | "monthly"
  | "annual";

export type EiaNumericValue =
  | number
  | string
  | null;

export type EiaDataRow = {
  period: string;

  value?: EiaNumericValue;

  [key: string]:
    | string
    | number
    | null
    | undefined;
};

export type EiaApiResponse = {
  response?: {
    total?: string | number;

    dateFormat?: string;

    frequency?: string;

    data?: EiaDataRow[];
  };

  request?: Record<
    string,
    unknown
  >;

  apiVersion?: string;
};

export type EiaSeriesPoint = {
  period: string;
  value: number;
};

export type EiaSeriesResult = {
  seriesId: string;

  frequency: EiaFrequency;

  unit: string | null;

  points: EiaSeriesPoint[];

  provider: "eia";
};

export type EiaSeriesRequest = {
  route: string;

  valueField: string;

  frequency: EiaFrequency;

  unit?: string;

  facets?: Record<
    string,
    readonly string[]
  >;

  start?: string;

  end?: string;

  length?: number;
};

export type EiaChangeSnapshot = {
  latest: number | null;

  previous: number | null;

  changePct: number | null;

  period: string | null;
};

export type EiaOilFundamentalSnapshot = {
  inventories:
    EiaChangeSnapshot;

  production:
    EiaChangeSnapshot;

  globalDemand:
    EiaChangeSnapshot;

  provider: "eia";

  fetchedAt: string;
};