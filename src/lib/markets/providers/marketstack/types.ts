/**
 * Raw Marketstack API contracts.
 *
 * IMPORTANT:
 * These types describe Marketstack responses only.
 * They must never leak into Chronoverse chart components.
 */

export interface MarketstackPagination {
  limit: number;
  offset: number;
  count: number;
  total: number;
}

export interface MarketstackEodRecord {
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number | null;

  adj_open?: number | null;
  adj_high?: number | null;
  adj_low?: number | null;
  adj_close?: number | null;
  adj_volume?: number | null;

  split_factor?: number | null;
  dividend?: number | null;

  symbol: string;
  exchange?: string | null;
  date: string;
}

export interface MarketstackEodResponse {
  pagination: MarketstackPagination;
  data: MarketstackEodRecord[];
}

export interface MarketstackApiError {
  error: {
    code: string;
    message: string;
    context?: Record<string, unknown>;
  };
}