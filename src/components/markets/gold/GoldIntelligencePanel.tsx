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
      <section className="mb-6 rounded-2xl border border-white/10 bg-white/2.5 p-5 md:p-6">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-[#c87d55]">
          Chronoverse Intelligence
        </p>

        <p className="mt-3 text-sm text-zinc-400">
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
      <section className="mb-6 rounded-2xl border border-red-500/20 bg-red-500/4 p-5 md:p-6">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-red-300">
          Intelligence temporarily unavailable
        </p>

        <p className="mt-3 text-sm text-zinc-400">
          {error ??
            "Unable to load the current gold intelligence state."}
        </p>
      </section>
    );
  }

  const confidence =
    Math.round(
      data.confidence * 100,
    );

  const signalConfidence =
    Math.round(
      data.signal.confidence * 100,
    );

  const macroConfidence =
    data.macro
      ? Math.round(
          data.macro.confidence * 100,
        )
      : null;

  return (
    <section className="mb-6 overflow-hidden rounded-2xl border border-[#c87d55]/20 bg-[#17110f]">
      <div className="border-b border-white/10 px-5 py-5 md:px-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-[#c87d55]">
              Chronoverse Intelligence Engine
            </p>

            <h2 className="mt-2 text-xl font-semibold text-white">
              Gold Market Intelligence
            </h2>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
              Technical structure, market risk and
              macroeconomic regime combined into one
              institutional market state.
            </p>
          </div>

          {generatedAt ? (
            <p className="font-mono text-[11px] uppercase tracking-wider text-zinc-600">
              Generated{" "}
              {new Date(
                generatedAt,
              ).toLocaleString()}
            </p>
          ) : null}
        </div>
      </div>

      <div className="grid gap-px bg-white/10 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Market State"
          value={formatLabel(
            data.state,
          )}
          detail="Integrated regime"
        />

        <MetricCard
          label="Technical Signal"
          value={formatLabel(
            data.signal.direction,
          )}
          detail={`${formatLabel(
            data.signal.strength,
          )} · ${signalConfidence}% confidence`}
        />

        <MetricCard
          label="Risk Regime"
          value={formatLabel(
            data.risk.level,
          )}
          detail={`Risk score ${formatNumber(
            data.risk.score,
            2,
          )}`}
        />

        <MetricCard
          label="Integrated Confidence"
          value={`${confidence}%`}
          detail="Technical + risk + macro"
        />
      </div>

      <div className="grid gap-4 p-5 md:p-6 lg:grid-cols-[1.4fr_0.6fr]">
        <div className="rounded-xl border border-white/10 bg-black/10 p-5">
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-500">
            Intelligence Summary
          </p>

          <p className="mt-3 text-sm leading-7 text-zinc-200">
            {data.summary}
          </p>
        </div>

        <div className="rounded-xl border border-white/10 bg-black/10 p-5">
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-500">
            Macro Regime
          </p>

          <p className="mt-3 text-lg font-semibold text-white">
            {data.macro
              ? formatLabel(
                  data.macro.bias,
                )
              : "Unavailable"}
          </p>

          <p className="mt-1 text-xs text-zinc-500">
            {data.macro &&
            macroConfidence !== null
              ? `${macroConfidence}% macro confidence`
              : "Macro layer not supplied"}
          </p>
        </div>
      </div>

      <div className="grid gap-4 border-t border-white/10 p-5 md:p-6 lg:grid-cols-3">
        <IndicatorCard
          label="RSI"
          value={formatNumber(
            data.indicators.rsi,
            2,
          )}
        />

        <IndicatorCard
          label="Volatility"
          value={
            data.indicators
              .annualizedVolatility ===
            null
              ? "—"
              : `${formatNumber(
                  data.indicators
                    .annualizedVolatility,
                  2,
                )}%`
          }
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
        />
      </div>

      {data.warnings.length >
      0 ? (
        <div className="border-t border-white/10 px-5 py-5 md:px-6">
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[#c87d55]">
            Active Intelligence Warnings
          </p>

          <div className="mt-3 space-y-2">
            {data.warnings.map(
              (warning) => (
                <p
                  key={warning}
                  className="text-sm leading-6 text-zinc-400"
                >
                  • {warning}
                </p>
              ),
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function MetricCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="bg-[#17110f] p-5">
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">
        {label}
      </p>

      <p className="mt-2 text-lg font-semibold text-white">
        {value}
      </p>

      <p className="mt-1 text-xs text-zinc-500">
        {detail}
      </p>
    </div>
  );
}

function IndicatorCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/10 px-4 py-4">
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">
        {label}
      </p>

      <p className="mt-2 text-base font-semibold text-zinc-100">
        {value}
      </p>
    </div>
  );
}

function formatLabel(
  value: string,
): string {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) =>
      letter.toUpperCase(),
    );
}

function formatNumber(
  value: number | null,
  digits: number,
): string {
  if (
    value === null ||
    !Number.isFinite(value)
  ) {
    return "—";
  }

  return value.toFixed(
    digits,
  );
}