import type {
  MarketProductVipEcbPolicyEventContextV1,
} from "@/lib/markets/projections/types";

interface VipEcbPolicyEventPanelProps {
  readonly event: MarketProductVipEcbPolicyEventContextV1;
}

type AvailableEventContext = Extract<
  MarketProductVipEcbPolicyEventContextV1,
  { readonly status: "available" }
>;
type DegradedEventContext = Exclude<
  MarketProductVipEcbPolicyEventContextV1,
  { readonly status: "available" }
>;

const EYEBROW =
  "font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[#C8A7E8]";

const PHASE_LABELS = {
  "pre-event": "Pre-event",
  "t-24h": "T-24h",
  "t-1h": "T-1h",
  "t-15m": "T-15m",
  "release-time-unverified": "Release time unverified",
  release: "Release",
  "post-5m": "Post +5m",
  "post-15m": "Post +15m",
  "post-30m": "Post +30m",
  "post-1h": "Post +1h",
} as const;

const FRANKFURT_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Berlin",
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export default function VipEcbPolicyEventPanel({
  event,
}: VipEcbPolicyEventPanelProps) {
  return event.status === "available"
    ? <AvailableEventPanel event={event} />
    : <DegradedEventPanel event={event} />;
}

function AvailableEventPanel({ event }: { event: AvailableEventContext }) {
  const { intelligence } = event;
  const directRateContext =
    event.relevance === "direct-euro-rate-policy-context";
  const decisionObserved = intelligence.decisionEvidence.status === "observed";
  const releaseVerified = intelligence.releaseTiming.status === "verified";
  const rates = intelligence.rateFacts.availability === "available"
    ? intelligence.rateFacts.data
    : null;

  return (
    <section className="mt-10 border-y border-[#6F4C91]/40 bg-[linear-gradient(135deg,rgba(167,123,216,0.10),rgba(13,13,17,0.92)_38%,rgba(13,13,17,0.98))]">
      <header className="grid gap-5 border-b border-[#6F4C91]/30 px-5 py-6 sm:px-7 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div>
          <div className={EYEBROW}>ECB Event Intelligence</div>
          <h2 className="mt-1 text-2xl font-bold tracking-tight text-[#F3EBDD]">
            ECB Monetary Policy
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[#CFC5B8]">
            {directRateContext
              ? "Direct euro-rate policy context for €STR."
              : "Euro policy context affecting the EUR side of this pair."}
          </p>
        </div>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-xs sm:min-w-80">
          <CompactDatum
            label="Selection"
            value={event.selectionState === "current-window"
              ? "Current window"
              : "Next scheduled"}
          />
          <CompactDatum label="Event ID" value={event.canonicalEventId} />
          <CompactDatum
            label="Canonical meeting"
            value={event.canonicalMeetingDate}
          />
          <CompactDatum
            label="Current meeting"
            value={event.currentMeetingDate}
          />
        </dl>
      </header>

      <div className="grid min-w-0 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div className="min-w-0 px-5 py-6 sm:px-7 lg:border-r lg:border-[#6F4C91]/30">
          <div className={EYEBROW}>Event Clock</div>
          <dl className="mt-4 grid gap-4 sm:grid-cols-2">
            <EventDatum
              label="Event Phase"
              value={PHASE_LABELS[intelligence.phase]}
              prominent
            />
            <EventDatum
              label="Scheduled decision"
              value={formatFrankfurtInstant(
                intelligence.milestones.schedule.scheduledAt,
              )}
            />
            <EventDatum
              label="Release status"
              value={releaseVerified
                ? "Verified release time"
                : "Release time not yet verified"}
            />
            {releaseVerified ? (
              <EventDatum
                label="Verified release"
                value={formatFrankfurtInstant(
                  intelligence.releaseTiming.actualReleasedAt,
                )}
              />
            ) : null}
          </dl>

          <div className="mt-6 border-t border-[#6F4C91]/25 pt-5">
            <h3 className="text-sm font-bold text-[#F3EBDD]">
              Release Evidence
            </h3>
            <dl className="mt-3 grid gap-4 sm:grid-cols-2">
              <EventDatum
                label="Decision evidence"
                value={decisionObserved ? "Observed" : "Not observed"}
              />
              {decisionObserved ? (
                <>
                  <EventDatum
                    label="Decision date"
                    value={intelligence.decisionEvidence.decisionDate}
                  />
                  <div className="min-w-0 sm:col-span-2">
                    <dt className="text-[11px] text-[#91889A]">
                      Decision document
                    </dt>
                    <dd className="mt-1 break-words text-xs font-semibold text-[#F3EBDD]">
                      <a
                        href={intelligence.decisionEvidence.documentUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline decoration-[#6F4C91] underline-offset-4 transition-colors hover:text-[#C8A7E8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8A7E8]"
                      >
                        Open official decision document
                      </a>
                    </dd>
                  </div>
                </>
              ) : null}
            </dl>
          </div>
        </div>

        <div className="min-w-0 px-5 py-6 sm:px-7">
          <div className={EYEBROW}>Evidence readiness</div>
          <dl className="mt-4 divide-y divide-[#6F4C91]/25 border-y border-[#6F4C91]/25">
            <ReadinessDatum label="Schedule" value="Available" />
            <ReadinessDatum
              label="Decision evidence"
              value={formatStateLabel(intelligence.readiness.decisionEvidence)}
            />
            <ReadinessDatum
              label="Verified release time"
              value={formatStateLabel(
                intelligence.readiness.verifiedReleaseTime,
              )}
            />
            <ReadinessDatum
              label="Rate facts"
              value={formatStateLabel(intelligence.readiness.rateFacts)}
            />
            <ReadinessDatum label="Session review" value="Not computed" />
          </dl>
          <p className="mt-3 text-[11px] leading-5 text-[#91889A]">
            Session review is not computed in the approved event snapshot.
          </p>
        </div>
      </div>

      {rates === null ? null : (
        <section
          className={directRateContext
            ? "border-t-2 border-[#A77BD8] bg-[#A77BD8]/[0.08] px-5 py-6 sm:px-7"
            : "border-t border-[#6F4C91]/30 px-5 py-6 sm:px-7"}
        >
          <div className={EYEBROW}>Canonical ECB policy rate facts</div>
          <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <RateDatum label="Deposit facility" value={rates.depositFacility} />
            <RateDatum
              label="Main refinancing operations"
              value={rates.mainRefinancingOperations}
            />
            <RateDatum
              label="Marginal lending facility"
              value={rates.marginalLendingFacility}
            />
            <EventDatum
              label="Effective date"
              value={rates.effectiveDate ?? "Not supplied"}
            />
            <EventDatum label="Unit" value="Percent" />
          </dl>
          {!directRateContext ? (
            <p className="mt-4 text-[11px] leading-5 text-[#91889A]">
              These policy rates are ECB context for the EUR side of the pair.
            </p>
          ) : null}
        </section>
      )}

      <section className="border-t border-[#6F4C91]/30 px-5 py-5 sm:px-7">
        <div className={EYEBROW}>Provenance / as-known boundary</div>
        <dl className="mt-4 grid gap-x-5 gap-y-4 sm:grid-cols-2 lg:grid-cols-5">
          <SourceDatum sourceUrl={event.source.sourceUrl} />
          <EventDatum
            label="Source fetched"
            value={formatUtcInstant(event.source.fetchedAt)}
          />
          <EventDatum
            label="Selected snapshot known-at"
            value={formatUtcInstant(event.selectedSnapshotKnownAt)}
          />
          <EventDatum
            label="Snapshot known-at"
            value={formatUtcInstant(intelligence.snapshotKnownAt)}
          />
          <EventDatum
            label="Evaluated at"
            value={formatUtcInstant(intelligence.evaluatedAt)}
          />
        </dl>
      </section>
    </section>
  );
}

function DegradedEventPanel({ event }: { event: DegradedEventContext }) {
  const copy = degradedCopy(event);
  const sourceUrl = "sourceUrl" in event ? event.sourceUrl : null;
  const fetchedAt = "fetchedAt" in event ? event.fetchedAt : null;
  const evaluatedAt = "evaluatedAt" in event ? event.evaluatedAt : null;

  return (
    <section className="mt-10 border-y border-[#6F4C91]/35 bg-[#0D0D11]/80 px-5 py-6 sm:px-7">
      <div className={EYEBROW}>ECB Event Intelligence</div>
      <h2 className="mt-1 text-xl font-bold text-[#F3EBDD]">{copy.title}</h2>
      <p className="mt-3 max-w-4xl text-sm leading-6 text-[#CFC5B8]">
        {copy.description}
      </p>
      {sourceUrl === null && fetchedAt === null && evaluatedAt === null
        ? null
        : (
          <dl className="mt-5 grid gap-4 border-t border-[#6F4C91]/25 pt-4 sm:grid-cols-3">
            {sourceUrl === null ? null : <SourceDatum sourceUrl={sourceUrl} />}
            {fetchedAt === null ? null : (
              <EventDatum
                label="Source fetched"
                value={formatUtcInstant(fetchedAt)}
              />
            )}
            {evaluatedAt === null ? null : (
              <EventDatum
                label="Evaluation point"
                value={formatUtcInstant(evaluatedAt)}
              />
            )}
          </dl>
        )}
    </section>
  );
}

function degradedCopy(event: DegradedEventContext): {
  readonly title: string;
  readonly description: string;
} {
  switch (event.status) {
    case "source-unavailable":
      return {
        title: "ECB event source unavailable",
        description:
          "The official event source is temporarily unavailable. Market intelligence remains available independently.",
      };
    case "source-malformed":
      return {
        title: "ECB event source data malformed",
        description:
          "The official source data did not pass event validation. No event time or event identity is substituted.",
      };
    case "no-relevant-event":
      return {
        title: "No relevant ECB event selected",
        description:
          "No relevant ECB monetary-policy event is currently selected for this evaluation.",
      };
    case "reconciliation-required":
      return {
        title: "ECB event reconciliation required",
        description:
          "The event schedule or stored event state requires reconciliation. The presentation does not resolve it heuristically.",
      };
    case "persistence-unavailable":
      return {
        title: "ECB event persistence unavailable",
        description:
          "Event persistence is temporarily unavailable. The underlying market intelligence remains separate and usable.",
      };
    case "stored-state-invalid":
      return {
        title: "Stored ECB event state invalid",
        description:
          "The persisted event state failed validation and is not repaired or replaced by the presentation layer.",
      };
    case "insufficient-as-known-state":
      return {
        title: "Insufficient as-known ECB event state",
        description:
          "Sufficient as-known event state is not available for this evaluation point. Later evidence is not substituted.",
      };
    case "runtime-unavailable":
      return {
        title: "ECB event runtime unavailable",
        description:
          "ECB event context is temporarily unavailable. The Market Room remains available with its existing intelligence.",
      };
    default:
      return assertNever(event);
  }
}

function CompactDatum({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="font-mono text-[9px] uppercase tracking-[0.09em] text-[#91889A]">
        {label}
      </dt>
      <dd className="mt-1 break-words text-[11px] font-semibold text-[#F3EBDD]">
        {value}
      </dd>
    </div>
  );
}

function EventDatum({
  label,
  value,
  prominent = false,
}: {
  readonly label: string;
  readonly value: string;
  readonly prominent?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] text-[#91889A]">{label}</dt>
      <dd className={`mt-1 break-words font-mono tabular-nums ${
        prominent
          ? "text-lg font-bold text-[#C8A7E8]"
          : "text-xs font-semibold leading-5 text-[#F3EBDD]"
      }`}>
        {value}
      </dd>
    </div>
  );
}

function ReadinessDatum({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 py-2.5 text-xs">
      <dt className="text-[#91889A]">{label}</dt>
      <dd className="text-right font-semibold text-[#F3EBDD]">{value}</dd>
    </div>
  );
}

function RateDatum({ label, value }: { label: string; value: number }) {
  return (
    <EventDatum
      label={label}
      value={`${Number.isFinite(value) ? value.toFixed(2) : "Unavailable"}%`}
    />
  );
}

function SourceDatum({ sourceUrl }: { sourceUrl: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] text-[#91889A]">Official source</dt>
      <dd className="mt-1 break-words text-xs font-semibold leading-5 text-[#F3EBDD]">
        <a
          href={sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="underline decoration-[#6F4C91] underline-offset-4 transition-colors hover:text-[#C8A7E8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8A7E8]"
        >
          Open ECB source
        </a>
      </dd>
    </div>
  );
}

function formatFrankfurtInstant(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Unavailable"
    : `${FRANKFURT_FORMATTER.format(date)} Frankfurt time`;
}

function formatUtcInstant(value: number | string): string {
  const date = typeof value === "number"
    ? new Date(value * 1_000)
    : new Date(value);
  return Number.isNaN(date.getTime())
    ? "Unavailable"
    : `${date.toISOString().replace(".000Z", "Z")} UTC`;
}

function formatStateLabel(value: string): string {
  return value
    .replace(/-/g, " ")
    .replace(/^\w/, (character) => character.toUpperCase());
}

function assertNever(value: never): never {
  throw new Error(`Unhandled ECB event state: ${String(value)}`);
}
