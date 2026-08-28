import {
  defineMarketAssetProfile,
} from "../../core/assetProfile";

export const goldProfile =
  defineMarketAssetProfile({
    id: "gold",

    symbol: "GC=F",

    displayName: "Gold",

    assetClass: "commodity",

    defaultInterval: "1d",

    historyLimit: 600,

    /*
     * ======================================================
     * TECHNICAL PROFILE
     * ======================================================
     */

    technical: {
      ema: {
        fast: 20,
        medium: 50,
        slow: 200,
      },

      rsi: {
        period: 14,

        oversold: 30,
        neutralLow: 45,
        neutralHigh: 55,
        overbought: 70,
      },

      macd: {
        fastPeriod: 12,
        slowPeriod: 26,
        signalPeriod: 9,
      },

      momentum: {
        period: 10,
      },

      volatility: {
        period: 20,
        annualizationFactor: 252,
      },
    },

    /*
     * ======================================================
     * SIGNAL PROFILE
     * ======================================================
     */

    signal: {
      bullishThreshold: 0.6,
      bearishThreshold: -0.6,
      neutralThreshold: 0.2,

      calibration: {
        /*
         * Existing Gold signal weights:
         *
         * EMA  = 0.40
         * RSI  = 0.20
         * MACD = 0.25
         * ROC  = 0.15
         *
         * Total = 1.00
         */
        weights: {
          ema: 0.4,
          rsi: 0.2,
          macd: 0.25,
          roc: 0.15,
        },

        ema: {
          toleranceRatio:
            0.0001,

          minimumTolerance:
            0.000001,

          allAveragesMultiplier:
            0.55,

          moderateBiasMultiplier:
            0.25,
        },

        rsi: {
          extremeMultiplier:
            0.75,
        },

        macd: {
          epsilon:
            0.000001,

          zeroBiasMultiplier:
            0.6,
        },

        roc: {
          strongThreshold:
            4,

          directionalThreshold:
            0.25,

          strongMultiplier:
            1,

          directionalMultiplier:
            0.75,

          mildMultiplier:
            0.35,
        },

        strength: {
          moderateThreshold:
            0.4,

          strongThreshold:
            0.75,
        },

        confidence: {
          base:
            0.4,

          directional:
            0.6,

          riskPenalty:
            0.35,
        },
      },
    },

    /*
     * ======================================================
     * RISK PROFILE
     * ======================================================
     */

    risk: {
      low: 0.3,
      moderate: 0.6,
      high: 0.8,

      calibration: {
        /*
         * Existing Gold risk weights:
         *
         * Volatility = 0.30
         * RSI        = 0.20
         * ROC        = 0.15
         * MACD       = 0.10
         * EMA Medium = 0.10
         * EMA Slow   = 0.15
         *
         * Total = 1.00
         */
        weights: {
          volatility:
            0.3,

          rsi:
            0.2,

          roc:
            0.15,

          macd:
            0.1,

          emaMedium:
            0.1,

          emaSlow:
            0.15,
        },

        volatility: {
          moderateThreshold:
            22,

          highThreshold:
            35,

          severity: {
            low:
              0.2,

            moderate:
              0.6,

            high:
              1,
          },
        },

        rsi: {
          stretchedLow:
            40,

          stretchedHigh:
            60,

          severity: {
            low:
              0.2,

            moderate:
              0.5,

            high:
              1,
          },
        },

        roc: {
          moderateThreshold:
            4,

          highThreshold:
            8,

          severity: {
            low:
              0.2,

            moderate:
              0.6,

            high:
              1,
          },
        },

        macd: {
          highThreshold:
            20,

          lowSeverity:
            0.3,

          highSeverity:
            1,
        },

        emaMedium: {
          moderateThreshold:
            4,

          highThreshold:
            8,

          severity: {
            low:
              0.2,

            moderate:
              0.6,

            high:
              1,
          },
        },

        emaSlow: {
          moderateThreshold:
            8,

          highThreshold:
            15,

          severity: {
            low:
              0.2,

            moderate:
              0.6,

            high:
              1,
          },
        },
      },
    },

    /*
     * ======================================================
     * MACRO PROFILE
     * ======================================================
     */

    macro: {
      enabled: true,

      drivers: [
        "real-yields",
        "nominal-yields",
        "usd",
        "inflation-expectations",
      ],
    },

    /*
     * ======================================================
     * REGIME MEMORY PROFILE
     * ======================================================
     */

    regimeMemory: {
      enabled: true,

      maxHistory: 120,
    },
  });