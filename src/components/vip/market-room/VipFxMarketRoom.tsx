import Link from "next/link";

import type {
  FxVipDeepProjectionV1,
} from "@/lib/markets/projections/types";
import {
  VIP_FX_MARKET_ROOM_IDS_V1,
  type VipFxMarketRoomIdV1,
  type VipFxMarketRoomV1,
} from "@/lib/markets/services/vipMarketRoomDelivery";
import VipFxHistoricalPanel from "./VipFxHistoricalPanel";

interface VipFxMarketRoomProps {
  readonly room: VipFxMarketRoomV1;
}

type FxScenarioV1 = Extract<
  FxVipDeepProjectionV1["details"]["engine"]["scenario"],
  { readonly availability: "available" | "partial" }
>["data"];
type FxScenarioCaseV1 =
  | FxScenarioV1["base"]
  | FxScenarioV1["bullish"]
  | FxScenarioV1["bearish"];
type FxInvalidationV1 = Extract<
  FxVipDeepProjectionV1["details"]["engine"]["invalidation"],
  { readonly availability: "available" | "partial" }
>["data"];

const MARKET_IDENTITIES_V1 = Object.freeze({
  eurusd: Object.freeze({ displayName: "EUR/USD", quoteUnit: "USD per EUR" }),
  eurjpy: Object.freeze({ displayName: "EUR/JPY", quoteUnit: "JPY per EUR" }),
  eurgbp: Object.freeze({ displayName: "EUR/GBP", quoteUnit: "GBP per EUR" }),
  eurchf: Object.freeze({ displayName: "EUR/CHF", quoteUnit: "CHF per EUR" }),
} as const satisfies Record<
  VipFxMarketRoomIdV1,
  { readonly displayName: string; readonly quoteUnit: string }
>);

const EYEBROW =
  "font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[#C8A7E8]";

export default function VipFxMarketRoom({ room }: VipFxMarketRoomProps) {
  const identity = MARKET_IDENTITIES_V1[room.productId];
  const deep = room.deep?.availability === "available" ? room.deep : null;

  return (
    <div className="relative isolate overflow-hidden pb-16">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[48rem] bg-[radial-gradient(circle_at_78%_8%,rgba(167,123,216,0.13),transparent_30%),linear-gradient(180deg,#15131A_0%,#08070A_48%,#050506_86%)]"
      />

      <MarketRoomCommandBar room={room} />

      <div className="mx-auto max-w-[96rem] px-4 sm:px-6 lg:px-8">
        <MarketRoomNavigation selected={room.productId} />

        <section className="overflow-hidden border-y border-[#6F4C91]/40 bg-[#0D0D11]">
          <MarketIdentityHeader room={room} />

          <div className="grid min-w-0 xl:grid-cols-[minmax(0,2.35fr)_minmax(19rem,0.65fr)]">
            <div className="min-w-0 px-4 py-5 sm:px-6 sm:py-7 lg:px-8">
              <VipFxHistoricalPanel
                productId={room.productId}
                displayName={identity.displayName}
                twoYear={room.history.twoYear}
                fiveDay={room.history.fiveDay}
              />
            </div>
            <DecisionRail
              deep={deep}
              unavailableReason={deepUnavailableReason(room)}
            />
          </div>
        </section>

        {deep === null ? (
          <DeepUnavailableBand reason={deepUnavailableReason(room)} />
        ) : (
          <DeepIntelligenceLayers deep={deep} />
        )}

        <ReferenceDateReconciliation room={room} deep={deep} />
        <DeepProvenance deep={deep} />
        <RoomDisclaimer />
      </div>
    </div>
  );
}

function MarketRoomCommandBar({ room }: { room: VipFxMarketRoomV1 }) {
  const historyState = room.history.twoYear?.availability === "available" ||
      room.history.fiveDay?.availability === "available"
    ? "Available"
    : "Unavailable";
  const deepState = room.deep?.availability === "available"
    ? "Available"
    : "Unavailable";

  return (
    <section className="border-b border-[#6F4C91]/30 bg-[#0D0D11]/80">
      <div className="mx-auto grid max-w-[96rem] gap-3 px-4 py-3 sm:px-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:px-8">
        <div className="flex min-w-0 items-center gap-4">
          <span aria-hidden="true" className="h-9 w-0.5 shrink-0 bg-[#A77BD8]" />
          <div className="min-w-0">
            <div className={EYEBROW}>Chronoverse VIP / FX</div>
            <h1 className="mt-0.5 text-lg font-bold tracking-tight text-[#F3EBDD]">
              Market Room
            </h1>
          </div>
          <span className="hidden h-8 w-px bg-[#6F4C91]/30 sm:block" />
          <div className="hidden text-xs text-[#CFC5B8] sm:block">
            ECB reference-rate history with canonical Deep intelligence.
          </div>
        </div>

        <dl className="grid grid-cols-3 divide-x divide-[#6F4C91]/30 border-l border-[#6F4C91]/30">
          <CommandDatum label="Universe" value="04 FX pairs" />
          <CommandDatum label="History" value={historyState} />
          <CommandDatum label="Deep" value={deepState} />
        </dl>
      </div>
    </section>
  );
}

function CommandDatum({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 px-3 py-1.5 sm:px-4">
      <dt className="font-mono text-[9px] uppercase tracking-[0.1em] text-[#91889A]">
        {label}
      </dt>
      <dd className="mt-1 truncate text-[11px] font-semibold text-[#CFC5B8]">
        {value}
      </dd>
    </div>
  );
}

function MarketRoomNavigation({ selected }: {
  selected: VipFxMarketRoomIdV1;
}) {
  return (
    <div className="py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-h-11 items-center gap-3 text-[11px]">
          <Link
            href="/vip"
            className="rounded-sm px-1 py-2 text-[#CFC5B8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8A7E8]"
          >
            VIP Overview
          </Link>
          <span aria-hidden="true" className="text-[#6F4C91]">/</span>
          <Link
            href="/vip/markets"
            className="rounded-sm px-1 py-2 text-[#CFC5B8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8A7E8]"
          >
            Markets
          </Link>
        </div>

        <nav aria-label="VIP FX Market Rooms" className="max-w-full">
          <div className="flex max-w-full flex-wrap gap-1">
            {VIP_FX_MARKET_ROOM_IDS_V1.map((productId) => (
              <Link
                key={productId}
                href={`/vip/markets/${productId}`}
                aria-current={productId === selected ? "page" : undefined}
                className={`inline-flex min-h-11 items-center border px-3 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8A7E8] ${
                  productId === selected
                    ? "border-[#C8A7E8] bg-[#A77BD8]/15 text-[#F3EBDD]"
                    : "border-[#6F4C91]/35 bg-[#09090C] text-[#CFC5B8] hover:border-[#A77BD8]"
                }`}
              >
                {MARKET_IDENTITIES_V1[productId].displayName}
              </Link>
            ))}
          </div>
        </nav>
      </div>
    </div>
  );
}

function MarketIdentityHeader({ room }: { room: VipFxMarketRoomV1 }) {
  const identity = MARKET_IDENTITIES_V1[room.productId];
  const deep = room.deep?.availability === "available" ? room.deep : null;

  return (
    <header className="grid gap-6 border-b border-[#6F4C91]/35 bg-[radial-gradient(circle_at_76%_5%,rgba(200,167,232,0.08),transparent_34%),linear-gradient(145deg,#15131A,#0D0D11_72%)] px-5 py-6 sm:px-7 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end lg:px-9">
      <div className="min-w-0">
        <div className={EYEBROW}>Selected FX reference series</div>
        <div className="mt-3 flex flex-wrap items-baseline gap-x-5 gap-y-2">
          <h2 className="text-3xl font-black tracking-[-0.045em] text-[#F3EBDD] sm:text-5xl">
            {identity.displayName}
          </h2>
          <div className="font-mono text-4xl font-semibold tracking-[-0.045em] tabular-nums text-[#C8A7E8] sm:text-6xl">
            {deep === null ? "Unavailable" : formatCurrentValue(deep)}
          </div>
        </div>
        <p className="mt-3 text-xs leading-5 text-[#91889A]">
          {deep === null
            ? "Canonical current reference value unavailable; the historical chart endpoint is not used as a substitute."
            : `${identity.quoteUnit} / canonical ECB reference rate / ${deep.referenceDate}`}
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-x-7 gap-y-4 border-l border-[#6F4C91]/35 pl-5 sm:min-w-72">
        <HeroDatum
          label="State"
          value={deep === null ? "Unavailable" : formatLabel(deep.details.marketState)}
        />
        <HeroDatum
          label="Signal"
          value={deep === null ? "Unavailable" : formatLabel(deep.details.signal.direction)}
        />
        <HeroDatum
          label="Strength"
          value={deep === null ? "Unavailable" : formatLabel(deep.details.signal.strength)}
        />
        <HeroDatum
          label="Risk"
          value={deep === null ? "Unavailable" : formatLabel(deep.details.risk.level)}
        />
      </dl>
    </header>
  );
}

function HeroDatum({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="font-mono text-[9px] uppercase tracking-[0.1em] text-[#91889A]">
        {label}
      </dt>
      <dd className="mt-1 break-words text-xs font-semibold text-[#F3EBDD]">
        {value}
      </dd>
    </div>
  );
}

function DecisionRail({
  deep,
  unavailableReason,
}: {
  readonly deep: FxVipDeepProjectionV1 | null;
  readonly unavailableReason: string;
}) {
  if (deep === null) {
    return (
      <aside className="border-t border-[#6F4C91]/40 bg-[linear-gradient(160deg,#18151D,#100E14_72%)] px-5 py-7 sm:px-7 xl:border-l xl:border-t-0">
        <div className={EYEBROW}>Decision intelligence</div>
        <h2 className="mt-1 text-xl font-bold text-[#F3EBDD]">
          Deep intelligence unavailable
        </h2>
        <p className="mt-4 text-sm leading-6 text-[#CFC5B8]">
          {unavailableReason}
        </p>
        <p className="mt-3 text-xs leading-5 text-[#91889A]">
          Historical observations remain independent and do not generate an
          analytical stance.
        </p>
      </aside>
    );
  }

  const { details } = deep;
  const { engine } = details;
  const recommendation = "data" in engine.recommendation
    ? engine.recommendation.data
    : null;
  const decision = "data" in engine.decision ? engine.decision.data : null;
  const conviction = "data" in engine.confidence &&
      "data" in engine.confidence.data.conviction
    ? engine.confidence.data.conviction.data.score
    : null;
  const dataConfidence = "data" in engine.confidence &&
      "data" in engine.confidence.data.data
    ? engine.confidence.data.data.data.score
    : null;
  const sections = [
    {
      label: "Executive posture",
      values: recommendation === null
        ? decision === null
          ? [
            `Signal / ${formatLabel(details.signal.direction)}`,
            details.signal.reasons[0] ?? "No supporting signal reason supplied.",
          ]
          : [
            `Decision / ${formatLabel(decision.stance)}`,
            `Decision score ${formatSigned(decision.score)}`,
          ]
        : [
          `${formatLabel(recommendation.posture)} posture`,
          `${formatLabel(recommendation.stance)} / ${formatLabel(recommendation.strength.band)} conviction`,
        ],
    },
    {
      label: "Confidence / risk",
      values: [
        `State confidence ${formatPercent(details.confidence)}`,
        `Signal confidence ${formatPercent(details.signal.confidence)}`,
        `Risk ${formatLabel(details.risk.level)} / ${formatPercent(details.risk.score)}`,
        ...(conviction === null
          ? []
          : [`Market conviction ${formatPercent(conviction)}`]),
        ...(dataConfidence === null
          ? []
          : [`Data confidence ${formatPercent(dataConfidence)}`]),
      ],
    },
    ...("data" in engine.contradiction
      ? [{
        label: "Evidence tension",
        values: [
          `Contradiction score ${formatPercent(engine.contradiction.data.score)}`,
        ],
      }]
      : []),
  ];

  return (
    <aside className="border-t border-[#6F4C91]/40 bg-[linear-gradient(160deg,#18151D,#100E14_72%)] px-5 py-7 sm:px-7 xl:border-l xl:border-t-0">
      <div className={EYEBROW}>Decision intelligence</div>
      <h2 className="mt-1 text-xl font-bold tracking-tight text-[#F3EBDD]">
        Executive readout
      </h2>
      <div className="mt-5">
        {sections.map((section, index) => (
          <section
            key={section.label}
            className={`border-t border-[#6F4C91]/30 py-4 ${
              index === 0 ? "bg-[#A77BD8]/[0.06] px-3" : ""
            }`}
          >
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-[9px] tabular-nums text-[#91889A]">
                {String(index + 1).padStart(2, "0")}
              </span>
              <h3 className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#C8A7E8]">
                {section.label}
              </h3>
            </div>
            <div className="mt-2 space-y-1.5 text-xs leading-5 text-[#CFC5B8]">
              {section.values.map((value) => (
                <div key={value} className="first:font-semibold first:text-[#F3EBDD]">
                  {value}
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </aside>
  );
}

function DeepUnavailableBand({ reason }: { reason: string }) {
  return (
    <section className="mt-10 border-y border-[#6F4C91]/30 bg-[#0D0D11]/75 px-5 py-7 sm:px-7">
      <div className={EYEBROW}>Analytical state</div>
      <h2 className="mt-1 text-xl font-bold text-[#F3EBDD]">
        Deep intelligence unavailable
      </h2>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-[#CFC5B8]">{reason}</p>
      <p className="mt-2 text-xs text-[#91889A]">
        No signal, technical, confidence, risk, scenario, or invalidation value
        has been inferred from history.
      </p>
    </section>
  );
}

function DeepIntelligenceLayers({ deep }: { deep: FxVipDeepProjectionV1 }) {
  const scenario = "data" in deep.details.engine.scenario
    ? deep.details.engine.scenario.data
    : null;
  const invalidation = "data" in deep.details.engine.invalidation
    ? deep.details.engine.invalidation.data
    : null;

  return (
    <div className="mt-10">
      <TechnicalEvidence deep={deep} />
      {scenario === null ? null : (
        <ScenarioArchitecture
          scenario={scenario}
          partial={deep.details.engine.scenario.availability === "partial"}
        />
      )}
      {invalidation === null ? null : (
        <InvalidationBoundary
          invalidation={invalidation}
          partial={deep.details.engine.invalidation.availability === "partial"}
        />
      )}
    </div>
  );
}

function TechnicalEvidence({ deep }: { deep: FxVipDeepProjectionV1 }) {
  const { details } = deep;
  const metrics = [
    metric("RSI", details.technical.rsi, 1),
    metric("Momentum", details.technical.momentum, 4),
    metric("MACD histogram", details.technical.macdHistogram, 5),
    details.technical.annualizedVolatility === null
      ? null
      : {
        label: "Annualized volatility",
        value: formatPercent(details.technical.annualizedVolatility),
      },
    {
      label: "Calibration",
      value: details.calibration.productionCalibrated ? "Production" : "Generic",
    },
  ].filter((value): value is { readonly label: string; readonly value: string } =>
    value !== null
  );

  return (
    <section className="border-y border-[#6F4C91]/30 bg-[#0D0D11]/75">
      <div className="grid lg:grid-cols-[minmax(15rem,0.72fr)_minmax(0,2.28fr)]">
        <header className="px-5 py-6 sm:px-7 lg:border-r lg:border-[#6F4C91]/30">
          <div className={EYEBROW}>Technical evidence</div>
          <h2 className="mt-2 text-2xl font-bold text-[#F3EBDD]">
            {formatLabel(details.signal.direction)} / {formatLabel(details.signal.strength)}
          </h2>
          <p className="mt-2 text-sm text-[#CFC5B8]">
            {formatLabel(details.risk.level)} analytical risk
          </p>
        </header>

        <div className="min-w-0 px-5 py-5 sm:px-7">
          <dl className="grid divide-y divide-[#6F4C91]/25 sm:grid-cols-2 sm:divide-x sm:divide-y-0 xl:grid-cols-5">
            {metrics.map((item) => (
              <div key={item.label} className="min-w-0 py-3 sm:px-4 sm:first:pl-0">
                <dt className="text-[11px] text-[#91889A]">{item.label}</dt>
                <dd className="mt-1 break-words font-mono text-sm font-semibold tabular-nums text-[#F3EBDD]">
                  {item.value}
                </dd>
              </div>
            ))}
          </dl>

          {details.signal.reasons.length > 0 ? (
            <div className="mt-4 border-t border-[#6F4C91]/25 pt-4">
              <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-[#91889A]">
                Canonical signal evidence
              </div>
              <ul className="mt-3 grid gap-2 text-xs leading-5 text-[#CFC5B8] md:grid-cols-2">
                {details.signal.reasons.slice(0, 4).map((reason) => (
                  <li key={reason} className="border-l border-[#6F4C91]/45 pl-3">
                    {reason}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function ScenarioArchitecture({
  scenario,
  partial,
}: {
  readonly scenario: FxScenarioV1;
  readonly partial: boolean;
}) {
  return (
    <section className="mt-12">
      <header className="grid gap-3 border-b border-[#6F4C91]/30 pb-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <div>
          <div className={EYEBROW}>Scenario architecture</div>
          <h2 className="mt-1 text-2xl font-bold tracking-tight text-[#F3EBDD]">
            Current path and conditional alternatives
          </h2>
        </div>
        <p className="max-w-md text-xs leading-5 text-[#91889A]">
          Evidence configurations, not forecasts, probabilities, or targets.
          {partial ? " Partial evidence." : ""}
        </p>
      </header>

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1.7fr)_minmax(18rem,0.8fr)]">
        <ScenarioCase scenarioCase={scenario.base} primary />
        <div className="divide-y divide-[#6F4C91]/30 border-y border-[#6F4C91]/30">
          <ScenarioCase scenarioCase={scenario.bullish} />
          <ScenarioCase scenarioCase={scenario.bearish} />
        </div>
      </div>
    </section>
  );
}

function ScenarioCase({
  scenarioCase,
  primary = false,
}: {
  readonly scenarioCase: FxScenarioCaseV1;
  readonly primary?: boolean;
}) {
  return (
    <article className={primary
      ? "border-l-2 border-[#A77BD8] bg-[linear-gradient(135deg,#15131A,#0D0D11)] px-5 py-6 sm:px-7"
      : "px-4 py-5"
    }>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-[#F3EBDD]">
            {scenarioCase.id === "base"
              ? "Base / Current configuration"
              : `${formatLabel(scenarioCase.id)} case`}
          </h3>
          <p className="mt-1 text-xs text-[#91889A]">
            Direction {formatLabel(scenarioCase.targetStance)}
          </p>
        </div>
        <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#C8A7E8]">
          {formatLabel(scenarioCase.relationToDecision)}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 text-xs text-[#CFC5B8]">
        <div>Support / {scenarioCase.supportingEvidence.length}</div>
        <div>Opposition / {scenarioCase.opposingEvidence.length}</div>
      </div>

      {scenarioCase.strengtheningConditions.length > 0 ? (
        <ul className="mt-4 space-y-2 border-t border-[#6F4C91]/25 pt-3 text-xs leading-5 text-[#CFC5B8]">
          {scenarioCase.strengtheningConditions.slice(0, 3).map((condition, index) => (
            <li
              key={`${scenarioCase.id}-${condition.code}-${index}`}
              className="grid gap-1 sm:grid-cols-[minmax(0,1fr)_auto]"
            >
              <span>{formatLabel(condition.code)}</span>
              <span className="font-mono text-[10px] uppercase text-[#C8A7E8]">
                {formatLabel(condition.status)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}

function InvalidationBoundary({
  invalidation,
  partial,
}: {
  readonly invalidation: FxInvalidationV1;
  readonly partial: boolean;
}) {
  const groups = [
    { label: "Invalidates", triggers: invalidation.invalidatesWhen },
    { label: "Weakens", triggers: invalidation.weakensWhen },
    { label: "Assessment unavailable", triggers: invalidation.assessmentFailsWhen },
  ].filter((group) => group.triggers.length > 0);

  return (
    <section className="mt-12 border-y border-[#6F4C91]/35 bg-[linear-gradient(90deg,rgba(111,76,145,0.13),transparent_42%)] py-6">
      <div className="grid gap-6 lg:grid-cols-[minmax(14rem,0.7fr)_minmax(0,2.3fr)]">
        <header className="border-l-2 border-[#A77BD8] pl-4">
          <div className={EYEBROW}>Interpretation boundary</div>
          <h2 className="mt-1 text-xl font-bold text-[#F3EBDD]">
            What changes the thesis
          </h2>
          <p className="mt-2 text-xs leading-5 text-[#91889A]">
            Canonical triggers for the {formatLabel(invalidation.thesis.stance)} decision stance.
            {partial ? " Partial evidence." : ""}
          </p>
        </header>

        <div className="grid gap-5 md:grid-cols-3">
          {groups.map((group) => (
            <section key={group.label} className="min-w-0 md:border-l md:border-[#6F4C91]/25 md:pl-4">
              <h3 className="text-[11px] font-bold uppercase tracking-[0.09em] text-[#C8A7E8]">
                {group.label}
              </h3>
              <ul className="mt-3 space-y-2 text-xs leading-5 text-[#CFC5B8]">
                {group.triggers.slice(0, 4).map((trigger, index) => (
                  <li key={`${trigger.code}-${index}`}>{formatLabel(trigger.code)}</li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </section>
  );
}

function ReferenceDateReconciliation({
  room,
  deep,
}: {
  readonly room: VipFxMarketRoomV1;
  readonly deep: FxVipDeepProjectionV1 | null;
}) {
  const historical = room.history.twoYear?.availability === "available"
    ? room.history.twoYear
    : room.history.fiveDay?.availability === "available"
      ? room.history.fiveDay
      : null;
  const historicalDate = historical === null
    ? null
    : formatReferenceDate(historical.resolved.observedTo);
  const reconciled = deep !== null && historicalDate === deep.referenceDate;

  return (
    <section className="mt-12 border-t border-[#6F4C91]/30 pt-5">
      <div className={EYEBROW}>Reference-date reconciliation</div>
      <h2 className="mt-1 text-base font-bold text-[#F3EBDD]">
        Deep anchor and observed history
      </h2>
      <div className="mt-4 grid gap-4 text-xs leading-5 text-[#CFC5B8] sm:grid-cols-3">
        <ReferenceDatum
          label="Deep reference"
          value={deep?.referenceDate ?? "Unavailable"}
        />
        <ReferenceDatum
          label="Historical observed to"
          value={historicalDate ?? "Unavailable"}
        />
        <ReferenceDatum
          label="Assessment"
          value={deep === null || historicalDate === null
            ? "Independent source unavailable"
            : reconciled
              ? "Reference dates aligned"
              : "Bounded official-date discrepancy"}
        />
      </div>
      {deep !== null && historicalDate !== null && !reconciled ? (
        <p className="mt-3 max-w-4xl text-[11px] leading-5 text-[#91889A]">
          History was anchored to the Deep source timestamp, but its latest
          included official observation is {historicalDate}, while Deep is
          referenced to {deep.referenceDate}. No synthetic observation was
          inserted to force alignment.
        </p>
      ) : null}
    </section>
  );
}

function ReferenceDatum({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-l border-[#6F4C91]/35 pl-3">
      <div className="font-mono text-[9px] uppercase tracking-[0.09em] text-[#91889A]">
        {label}
      </div>
      <div className="mt-1 font-semibold text-[#F3EBDD]">{value}</div>
    </div>
  );
}

function DeepProvenance({ deep }: { deep: FxVipDeepProjectionV1 | null }) {
  if (deep === null) {
    return null;
  }

  return (
    <section className="mt-10 border-t border-[#6F4C91]/30 pt-5">
      <div className={EYEBROW}>Deep provenance</div>
      <dl className="mt-4 grid gap-x-5 gap-y-3 sm:grid-cols-2 lg:grid-cols-6">
        <ProvenanceDatum label="Provider" value={deep.provenance.provider} />
        <ProvenanceDatum label="Source" value={deep.provenance.source} />
        <ProvenanceDatum label="Series" value={deep.provenance.seriesId} />
        <ProvenanceDatum label="Reference" value={deep.referenceDate} />
        <ProvenanceDatum label="Status" value={formatLabel(deep.provenance.status)} />
        <ProvenanceDatum label="Freshness" value={formatLabel(deep.provenance.freshness)} />
      </dl>
    </section>
  );
}

function ProvenanceDatum({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="font-mono text-[9px] uppercase tracking-[0.09em] text-[#91889A]">
        {label}
      </dt>
      <dd className="mt-1 break-words text-[11px] leading-5 text-[#CFC5B8]">
        {value}
      </dd>
    </div>
  );
}

function RoomDisclaimer() {
  return (
    <section className="mt-5 border-y border-[#6F4C91]/25 py-5 text-xs leading-6 text-[#91889A] sm:flex sm:items-center sm:justify-between sm:gap-8">
      <p className="max-w-4xl">
        ECB observations are normalized by Chronoverse Capital for analytical
        presentation. Provider identification does not imply endorsement.
        Chronoverse output is informational, not personalized financial advice,
        a trade order, or a guarantee.
      </p>
      <Link
        href="/disclaimer"
        className="mt-2 inline-flex min-h-11 shrink-0 items-center font-mono text-[10px] font-semibold uppercase tracking-[0.1em] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8A7E8] sm:mt-0"
      >
        Full disclaimer <span aria-hidden="true" className="ml-2">&#8599;</span>
      </Link>
    </section>
  );
}

function deepUnavailableReason(room: VipFxMarketRoomV1): string {
  return room.deep?.availability === "unavailable"
    ? room.deep.reason
    : "The canonical Deep projection read did not complete.";
}

function metric(
  label: string,
  value: number | null,
  precision: number,
): { readonly label: string; readonly value: string } | null {
  return value === null || !Number.isFinite(value)
    ? null
    : { label, value: value.toFixed(precision) };
}

function formatCurrentValue(deep: FxVipDeepProjectionV1): string {
  return deep.currentValue.value.toFixed(deep.productId === "eurjpy" ? 3 : 5);
}

function formatPercent(value: number | null): string {
  return value === null || !Number.isFinite(value)
    ? "Unavailable"
    : `${(value * 100).toFixed(1)}%`;
}

function formatSigned(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "Unavailable";
  }

  return `${value > 0 ? "+" : ""}${value.toFixed(3)}`;
}

function formatReferenceDate(timestamp: number): string {
  return new Date(timestamp * 1_000).toISOString().slice(0, 10);
}

function formatLabel(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[._-]+/g, " ")
    .toLowerCase()
    .replace(/^\w/, (character) => character.toUpperCase());
}
