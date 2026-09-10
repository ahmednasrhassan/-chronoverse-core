import { defineMarketAssetProfile } from "../../core/assetProfile";

export const eurchfProfile = defineMarketAssetProfile({
  id: "eurchf",
  symbol: "EURCHF=X",
  displayName: "EUR/CHF",
  assetClass: "forex",
  defaultInterval: "1d",
  historyLimit: 600,
  technical: {
    ema: { fast: 20, medium: 50, slow: 200 },
    rsi: {
      period: 14,
      oversold: 30,
      neutralLow: 45,
      neutralHigh: 55,
      overbought: 70,
    },
    macd: { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 },
    momentum: { period: 10 },
    volatility: { period: 20, annualizationFactor: 252 },
  },
  signal: {
    bullishThreshold: 0.75,
    bearishThreshold: -0.8,
    neutralThreshold: 0.3,
    calibration: {
      weights: { ema: 0.25, rsi: 0.25, macd: 0.25, roc: 0.25 },
      ema: {
        toleranceRatio: 0.0001,
        minimumTolerance: 0.000001,
        allAveragesMultiplier: 0.55,
        moderateBiasMultiplier: 0.25,
      },
      rsi: { extremeMultiplier: 0.75 },
      macd: { epsilon: 0.0001, zeroBiasMultiplier: 0.6 },
      roc: {
        directionalThreshold: 0.4,
        strongThreshold: 1.2,
        strongMultiplier: 1,
        directionalMultiplier: 0.75,
        mildMultiplier: 0.35,
      },
      strength: { moderateThreshold: 0.55, strongThreshold: 0.85 },
      confidence: { base: 0.4, directional: 0.6, riskPenalty: 0.35 },
    },
  },
  risk: {
    low: 0.2,
    moderate: 0.25,
    high: 0.45,
    calibration: {
      weights: {
        volatility: 0.2,
        rsi: 0.15,
        roc: 0.2,
        macd: 0.15,
        emaMedium: 0.15,
        emaSlow: 0.15,
      },
      volatility: {
        moderateThreshold: 5,
        highThreshold: 10,
        severity: { low: 0.2, moderate: 0.6, high: 1 },
      },
      rsi: {
        stretchedLow: 40,
        stretchedHigh: 59,
        severity: { low: 0.2, moderate: 0.6, high: 1 },
      },
      roc: {
        moderateThreshold: 0.8,
        highThreshold: 1.8,
        severity: { low: 0.2, moderate: 0.6, high: 1 },
      },
      macd: { highThreshold: 0.002, lowSeverity: 0.2, highSeverity: 1 },
      emaMedium: {
        moderateThreshold: 0.8,
        highThreshold: 2,
        severity: { low: 0.2, moderate: 0.6, high: 1 },
      },
      emaSlow: {
        moderateThreshold: 1.8,
        highThreshold: 4.4,
        severity: { low: 0.2, moderate: 0.6, high: 1 },
      },
    },
  },
  macro: { enabled: false, drivers: [] },
  regimeMemory: { enabled: false, maxHistory: 120 },
});
