/**
 * Chronoverse Capital — FRED Economic Data Types
 *
 * Provider-specific contracts for economic and
 * macroeconomic time-series data retrieved from FRED.
 *
 * These types remain separate from market OHLCV data.
 */

export type FredSeriesId = string;

export type FredObservation = {
  date: string;
  value: number | null;
};

export type FredSeries = {
  id: FredSeriesId;
  title?: string;
  unit?: string;

  observations: FredObservation[];

  provider: "fred";
};

export type FredSeriesRequest = {
  seriesId: FredSeriesId;

  observationStart?: string;
  observationEnd?: string;
};

export type FredRawObservation = {
  realtime_start?: string;
  realtime_end?: string;

  date: string;
  value: string;
};

export type FredObservationsResponse = {
  realtime_start?: string;
  realtime_end?: string;

  observation_start?: string;
  observation_end?: string;

  units?: string;
  output_type?: number;
  file_type?: string;

  order_by?: string;
  sort_order?: string;

  count?: number;
  offset?: number;
  limit?: number;

  observations: FredRawObservation[];
};

/**
 * Provider-agnostic contract used by the Chronoverse
 * macro intelligence layer.
 */
export interface EconomicSeriesProvider {
  readonly id: string;

  isConfigured(): boolean;

  getSeries(
    request: FredSeriesRequest
  ): Promise<FredSeries>;

  getLatestValue(
    seriesId: FredSeriesId
  ): Promise<FredObservation | null>;
}