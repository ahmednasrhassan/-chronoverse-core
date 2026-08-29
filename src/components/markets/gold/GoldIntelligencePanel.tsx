"use client";

import {
  useEffect,
  useState,
} from "react";

type IntelligenceState =
  | "opportunity"
  | "caution"
  | "risk";

type SignalDirection =
  | "bullish"
  | "bearish"
  | "neutral";

type MacroBias =
  | "bullish"
  | "bearish"
  | "neutral";

type ConflictLevel =
  | "high"
  | "moderate"
  | "low"
  | "none";

type GoldIntelligence = {
  price: number | null;

  state: IntelligenceState;

  confidence: number;

  summary: string;

  warnings: string[];

  signal: {
    score: number;
    direction: SignalDirection;
    strength: string;
    confidence: number;
    reasons: string[];
  };

  risk: {
    score: number;
    level: string;
    reasons: string[];
  };

  macro: {
    score: number;
    bias: MacroBias;
    strength: string;
    confidence: number;
    coverage: number;
    reasons: string[];
  } | null;

  indicators: {
    ema20: number | null;
    ema50: number | null;
    ema200: number | null;

    rsi: number | null;

    macd: number | null;
    macdSignal: number | null;
    macdHistogram: number | null;

    momentum: number | null;
    roc: number | null;

    annualizedVolatility: number | null;

    priceVsEma50: number | null;
    priceVsEma200: number | null;
  };
};

type GoldIntelligenceResponse = {
  ok: boolean;
  asset: "gold";
  generatedAt?: string;
  intelligence?: GoldIntelligence;
  error?: string;
};

export default function GoldIntelligencePanel() {
  const [
    data,
    setData,
  ] = useState<GoldIntelligence | null>(
    null,
  );

  const [
    generatedAt,
    setGeneratedAt,
  ] = useState<string | null>(
    null,
  );

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    error,
    setError,
  ] = useState<string | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;

    async function loadIntelligence() {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch(
          "/api/markets/gold/intelligence",
          {
            method: "GET",
            cache: "no-store",
          },
        );

        const payload =
          (await response.json()) as GoldIntelligenceResponse;

        if (
          !response.ok ||
          !payload.ok ||
          !payload.intelligence
        ) {
          throw new Error(
            payload.error ??
              "Gold intelligence is currently unavailable.",
          );
        }

        if (cancelled) {
          return;
        }

        setData(
          payload.intelligence,
        );

        setGeneratedAt(
          payload.generatedAt ?? null,
        );
      } catch (err) {
        if (cancelled) {
          return;
        }

        setError(
          err instanceof Error
            ? err.message
            : "Gold intelligence is currently unavailable.",
        );
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadIntelligence();

    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <section className="mb-5 rounded-2xl border border-white/10 bg-white/2.5 p-4 md:p-5">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-mauve">
          Chronoverse Intelligence
        </p>

        <p className="mt-2 text-sm text-secondary">
          Building live gold intelligence...
        </p>
      </section>
    );
  }

  if (
    error ||
    !data
  ) {
    return (
      <section className="mb-5 rounded-2xl border border-red-500/20 bg-red-500/4 p-4 md:p-5">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-red-300">
          Intelligence temporarily unavailable
        </p>

        <p className="mt-2 text-sm text-secondary">
          {error ??
            "Unable to load the current gold intelligence state."}
        </p>
      </section>
    );
  }

  const conviction =
    Math.round(
      data.confidence * 100,
    );

  const signalConfidence =
    Math.round(
      data.signal.confidence * 100,
    );

  const conflict =
    resolveConflict(
      data.signal.direction,
      data.signal.confidence,
      data.macro,
    );

  const trendDriver =
    resolveTrendDriver(
      data,
    );

  const momentumDriver =
    resolveMomentumDriver(
      data,
    );

  const volatilityDriver =
    resolveVolatilityDriver(
      data.indicators
        .annualizedVolatility,
    );

  const macroDriver =
    resolveMacroDriver(
      data.macro,
    );

  return (
    <section className="mb-5 overflow-hidden rounded-2xl border border-purple-border/20 bg-card">
      <div className="border-b border-white/10 px-5 py-4 md:px-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-mauve">
              Chronoverse Gold Intelligence V2
            </p>

            <h2 className="mt-1.5 text-lg font-semibold text-mauve md:text-xl">
              Decision Layer
            </h2>

            <p className="mt-1.5 max-w-3xl text-sm leading-5 text-secondary">
              Technical structure, market risk and
              macroeconomic regime translated into one
              actionable analytical state.
            </p>
          </div>

          {generatedAt ? (
            <p className="font-mono text-[10px] uppercase tracking-wider text-muted">
              Updated{" "}
              {new Date(
                generatedAt,
              ).toLocaleString()}
            </p>
          ) : null}
        </div>
      </div>

      <div className="grid gap-px bg-white/10 sm:grid-cols-2 lg:grid-cols-4">
        <DecisionCard
          label="Market Regime"
          value={formatLabel(
            data.state,
          )}
          detail="Integrated state"
          tone={stateTone(
            data.state,
          )}
        />

        <DecisionCard
          label="Technical Signal"
          value={formatLabel(
            data.signal.direction,
          )}
          detail={`${formatLabel(
            data.signal.strength,
          )} · ${signalConfidence}%`}
          tone={directionTone(
            data.signal.direction,
          )}
        />

        <DecisionCard
          label="Conviction"
          value={`${conviction}/100`}
          detail="Integrated confidence"
          tone={convictionTone(
            conviction,
          )}
        />

        <DecisionCard
          label="Signal Conflict"
          value={
            conflict === "none"
              ? "Unavailable"
              : formatLabel(
                  conflict,
                )
          }
          detail={buildConflictDetail(
            data.signal.direction,
            data.macro,
          )}
          tone={conflictTone(
            conflict,
          )}
        />
      </div>

      <div className="border-b border-white/10 px-5 py-3 md:px-6">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 font-mono text-[11px] uppercase tracking-[0.14em]">
          <span className="text-muted">
            Technical
          </span>

          <span
            className={directionTone(
              data.signal.direction,
            )}
          >
            {directionMarker(
              data.signal.direction,
            )}{" "}
            {formatLabel(
              data.signal.direction,
            )}
          </span>

          <span className="text-muted">
            /
          </span>

          <span className="text-muted">
            Macro
          </span>

          <span
            className={macroTone(
              data.macro?.bias ??
                "neutral",
            )}
          >
            {macroMarker(
              data.macro?.bias ??
                "neutral",
            )}{" "}
            {data.macro
              ? formatLabel(
                  data.macro.bias,
                )
              : "Unavailable"}
          </span>
        </div>
      </div>

      <div className="px-5 py-4 md:px-6">
        <div className="rounded-xl border border-purple-border/20 bg-black/10 px-4 py-3.5">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-mauve">
            Chronoverse Outlook
          </p>

          <p className="mt-2 max-w-4xl text-sm leading-6 text-secondary">
            {data.summary}
          </p>
        </div>
      </div>

      <div className="border-t border-white/10 px-5 py-4 md:px-6">
        <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
          Market Drivers
        </p>

        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          <DriverCard
            label="Trend"
            value={trendDriver.value}
            detail={trendDriver.detail}
          />

          <DriverCard
            label="Momentum"
            value={momentumDriver.value}
            detail={momentumDriver.detail}
          />

          <DriverCard
            label="Volatility"
            value={volatilityDriver.value}
            detail={volatilityDriver.detail}
          />

          <DriverCard
            label="Macro"
            value={macroDriver.value}
            detail={macroDriver.detail}
          />
        </div>
      </div>

      <div className="grid gap-2.5 border-t border-white/10 px-5 py-4 md:px-6 lg:grid-cols-3">
        <IndicatorCard
          label="RSI"
          value={formatNumber(
            data.indicators.rsi,
            2,
          )}
          detail={describeRsi(
            data.indicators.rsi,
          )}
        />

        <IndicatorCard
          label="Rate of Change"
          value={
            data.indicators.roc ===
            null
              ? "—"
              : `${formatNumber(
                  data.indicators.roc,
                  2,
                )}%`
          }
          detail="Price momentum"
        />

        <IndicatorCard
          label="Risk Score"
          value={formatNumber(
            data.risk.score,
            2,
          )}
          detail={formatLabel(
            data.risk.level,
          )}
        />
      </div>

      <div className="border-t border-white/10 px-5 py-4 md:px-6">
        <div className="flex items-center justify-between gap-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-mauve">
            Risk Flags
          </p>

          <p className="font-mono text-[10px] uppercase tracking-wider text-muted">
            {data.warnings.length} active
          </p>
        </div>

        {data.warnings.length >
        0 ? (
          <div className="mt-3 grid gap-2 lg:grid-cols-2">
            {data.warnings.map(
              (warning) => (
                <div
                  key={warning}
                  className="flex gap-2.5 rounded-lg border border-white/5 bg-black/10 px-3.5 py-2.5"
                >
                  <span className="mt-0.5 text-mauve">
                    •
                  </span>

                  <p className="text-xs leading-5 text-secondary">
                    {warning}
                  </p>
                </div>
              ),
            )}
          </div>
        ) : (
          <p className="mt-2 text-xs text-muted">
            No elevated intelligence warnings are currently active.
          </p>
        )}
      </div>
    </section>
  );
}

function DecisionCard({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  tone: string;
}) {
  return (
    <div className="bg-card p-4">
      <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted">
        {label}
      </p>

      <p
        className={`mt-1.5 text-base font-semibold ${tone}`}
      >
        {value}
      </p>

      <p className="mt-1 text-[11px] text-muted">
        {detail}
      </p>
    </div>
  );
}

function DriverCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/10 p-3.5">
      <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted">
        {label}
      </p>

      <p className="mt-1.5 text-sm font-semibold text-primary">
        {value}
      </p>

      <p className="mt-1 text-[11px] leading-4 text-muted">
        {detail}
      </p>
    </div>
  );
}

function IndicatorCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/10 px-3.5 py-3">
      <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted">
        {label}
      </p>

      <p className="mt-1.5 text-sm font-semibold text-primary">
        {value}
      </p>

      <p className="mt-1 text-[11px] text-muted">
        {detail}
      </p>
    </div>
  );
}

function resolveConflict(
  direction: SignalDirection,
  signalConfidence: number,
  macro: GoldIntelligence["macro"],
): ConflictLevel {
  if (macro === null) {
    return "none";
  }

  const opposite =
    (
      direction === "bullish" &&
      macro.bias === "bearish"
    ) ||
    (
      direction === "bearish" &&
      macro.bias === "bullish"
    );

  if (!opposite) {
    return "low";
  }

  if (
    signalConfidence >= 0.65 &&
    macro.confidence >= 0.65
  ) {
    return "high";
  }

  return "moderate";
}

function resolveTrendDriver(
  data: GoldIntelligence,
): {
  value: string;
  detail: string;
} {
  const {
    price,
    indicators,
  } = data;

  if (
    price === null ||
    indicators.ema20 === null ||
    indicators.ema50 === null ||
    indicators.ema200 === null
  ) {
    return {
      value: "Unavailable",
      detail:
        "Insufficient EMA structure.",
    };
  }

  if (
    price >
      indicators.ema20 &&
    indicators.ema20 >
      indicators.ema50 &&
    indicators.ema50 >
      indicators.ema200
  ) {
    return {
      value: "Strong Bullish",
      detail:
        "Price and EMA structure are fully aligned.",
    };
  }

  if (
    price <
      indicators.ema20 &&
    indicators.ema20 <
      indicators.ema50 &&
    indicators.ema50 <
      indicators.ema200
  ) {
    return {
      value: "Strong Bearish",
      detail:
        "Price and EMA structure are negatively aligned.",
    };
  }

  return {
    value: "Mixed",
    detail:
      "Trend structure is not fully aligned.",
  };
}

function resolveMomentumDriver(
  data: GoldIntelligence,
): {
  value: string;
  detail: string;
} {
  const rsi =
    data.indicators.rsi;

  const roc =
    data.indicators.roc;

  const histogram =
    data.indicators.macdHistogram;

  if (
    rsi === null ||
    roc === null ||
    histogram === null
  ) {
    return {
      value: "Unavailable",
      detail:
        "Momentum inputs are incomplete.",
    };
  }

  if (
    roc > 0 &&
    histogram > 0
  ) {
    if (rsi >= 70) {
      return {
        value: "Bullish / Extended",
        detail:
          "Momentum is positive but RSI is elevated.",
      };
    }

    return {
      value: "Bullish",
      detail:
        "ROC and MACD momentum remain positive.",
    };
  }

  if (
    roc < 0 &&
    histogram < 0
  ) {
    if (rsi <= 30) {
      return {
        value: "Bearish / Extended",
        detail:
          "Negative momentum with oversold RSI.",
      };
    }

    return {
      value: "Bearish",
      detail:
        "ROC and MACD momentum remain negative.",
    };
  }

  return {
    value: "Mixed",
    detail:
      "Momentum indicators are diverging.",
  };
}

function resolveVolatilityDriver(
  volatility: number | null,
): {
  value: string;
  detail: string;
} {
  if (volatility === null) {
    return {
      value: "Unavailable",
      detail:
        "No volatility estimate.",
    };
  }

  if (volatility >= 35) {
    return {
      value: "Elevated",
      detail:
        `${volatility.toFixed(
          1,
        )}% annualized volatility.`,
    };
  }

  if (volatility >= 20) {
    return {
      value: "Moderate",
      detail:
        `${volatility.toFixed(
          1,
        )}% annualized volatility.`,
    };
  }

  return {
    value: "Contained",
    detail:
      `${volatility.toFixed(
        1,
      )}% annualized volatility.`,
  };
}

function resolveMacroDriver(
  macro: GoldIntelligence["macro"],
): {
  value: string;
  detail: string;
} {
  if (macro === null) {
    return {
      value: "Unavailable",
      detail:
        "Macro layer not supplied.",
    };
  }

  return {
    value: formatLabel(
      macro.bias,
    ),
    detail:
      `${Math.round(
        macro.confidence * 100,
      )}% confidence · ${Math.round(
        macro.coverage * 100,
      )}% coverage`,
  };
}

function buildConflictDetail(
  technical: SignalDirection,
  macro: GoldIntelligence["macro"],
): string {
  if (macro === null) {
    return "Macro unavailable";
  }

  return (
    `${formatLabel(
      technical,
    )} technical / ` +
    `${formatLabel(
      macro.bias,
    )} macro`
  );
}

function describeRsi(
  rsi: number | null,
): string {
  if (rsi === null) {
    return "Unavailable";
  }

  if (rsi >= 70) {
    return "Overbought zone";
  }

  if (rsi <= 30) {
    return "Oversold zone";
  }

  return "Neutral momentum zone";
}

function stateTone(
  state: IntelligenceState,
): string {
  if (
    state === "opportunity"
  ) {
    return "text-emerald-300";
  }

  if (
    state === "risk"
  ) {
    return "text-red-300";
  }

  return "text-amber-300";
}

function directionTone(
  direction: SignalDirection,
): string {
  if (
    direction === "bullish"
  ) {
    return "text-emerald-300";
  }

  if (
    direction === "bearish"
  ) {
    return "text-red-300";
  }

  return "text-secondary";
}

function macroTone(
  bias: MacroBias,
): string {
  if (
    bias === "bullish"
  ) {
    return "text-emerald-300";
  }

  if (
    bias === "bearish"
  ) {
    return "text-red-300";
  }

  return "text-secondary";
}

function convictionTone(
  conviction: number,
): string {
  if (conviction >= 70) {
    return "text-emerald-300";
  }

  if (conviction >= 50) {
    return "text-amber-300";
  }

  return "text-secondary";
}

function conflictTone(
  conflict: ConflictLevel,
): string {
  if (conflict === "high") {
    return "text-red-300";
  }

  if (
    conflict === "moderate"
  ) {
    return "text-amber-300";
  }

  return "text-secondary";
}

function directionMarker(
  direction: SignalDirection,
): string {
  if (
    direction === "bullish"
  ) {
    return "↑";
  }

  if (
    direction === "bearish"
  ) {
    return "↓";
  }

  return "→";
}

function macroMarker(
  bias: MacroBias,
): string {
  if (
    bias === "bullish"
  ) {
    return "↑";
  }

  if (
    bias === "bearish"
  ) {
    return "↓";
  }

  return "→";
}

function formatLabel(
  value: string,
): string {
  return value
    .replaceAll(
      "_",
      " ",
    )
    .replace(
      /\b\w/g,
      (letter) =>
        letter.toUpperCase(),
    );
}

function formatNumber(
  value: number | null,
  digits: number,
): string {
  if (
    value === null ||
    !Number.isFinite(
      value,
    )
  ) {
    return "—";
  }

  return value.toFixed(
    digits,
  );
}