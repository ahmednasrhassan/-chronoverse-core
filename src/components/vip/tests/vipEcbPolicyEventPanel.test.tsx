import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";

import type {
  MarketProductVipEcbPolicyEventContextV1,
  MarketProductVipEcbPolicyEventRelevanceV1,
} from "../../../lib/markets/projections/types";
import VipEcbPolicyEventPanel from
  "../market-room/VipEcbPolicyEventPanel";

const SOURCE_URL =
  "https://www.ecb.europa.eu/press/calendars/mgcgc/html/index.en.html";
const DECISION_URL =
  "https://www.ecb.europa.eu/press/pr/date/2026/html/ecb.mp261029.en.html";
const SNAPSHOT_KNOWN_AT = Date.parse("2026-10-29T13:17:00.000Z") / 1_000;
const SOURCE_FETCHED_AT = Date.parse("2026-10-29T12:00:00.000Z") / 1_000;

type AvailableEvent = Extract<
  MarketProductVipEcbPolicyEventContextV1,
  { readonly status: "available" }
>;

function availableEvent(
  relevance: MarketProductVipEcbPolicyEventRelevanceV1,
): AvailableEvent {
  return {
    status: "available",
    relevance,
    canonicalEventId: "ecb-monetary-policy-decision:2026-10-29",
    canonicalMeetingDate: "2026-10-29",
    currentMeetingDate: "2026-10-29",
    selectedSnapshotKnownAt: SNAPSHOT_KNOWN_AT,
    selectionState: "current-window",
    source: {
      sourceUrl: SOURCE_URL,
      fetchedAt: SOURCE_FETCHED_AT,
    },
    intelligence: {
      schemaVersion: "ecb-monetary-policy-event-intelligence-v1",
      canonicalEventId: "ecb-monetary-policy-decision:2026-10-29",
      eventSourceVersionId: "internal-source-version",
      snapshotKnownAt: SNAPSHOT_KNOWN_AT,
      evaluatedAt: "2026-10-29T13:22:00.000Z",
      phase: "post-5m",
      milestones: {
        schedule: {
          t24hAt: "2026-10-28T13:15:00.000Z",
          t1hAt: "2026-10-29T12:15:00.000Z",
          t15mAt: "2026-10-29T13:00:00.000Z",
          scheduledAt: "2026-10-29T13:15:00.000Z",
        },
        release: {
          releaseAt: "2026-10-29T13:16:00.000Z",
          post5mAt: "2026-10-29T13:21:00.000Z",
          post15mAt: "2026-10-29T13:31:00.000Z",
          post30mAt: "2026-10-29T13:46:00.000Z",
          post1hAt: "2026-10-29T14:16:00.000Z",
        },
      },
      decisionEvidence: {
        status: "observed",
        decisionDate: "2026-10-29",
        documentUrl: DECISION_URL,
        contentDigest: "internal-content-digest",
        sourceVersionId: "internal-decision-version",
        firstObservedAt: SNAPSHOT_KNOWN_AT,
      },
      releaseTiming: {
        status: "verified",
        actualReleasedAt: "2026-10-29T13:16:00.000Z",
      },
      rateFacts: {
        availability: "available",
        data: {
          depositFacility: 2,
          mainRefinancingOperations: 2.15,
          marginalLendingFacility: 2.4,
          unit: "percent",
          effectiveDate: "2026-10-30",
        },
      },
      readiness: {
        schedule: "available",
        decisionEvidence: "observed",
        verifiedReleaseTime: "verified",
        rateFacts: "available",
        sessionReview: "not-computed",
      },
      sessionReview: {
        status: "not-computed",
        reason: "No canonical session-review timestamp or policy is defined.",
      },
    },
  };
}

function unverifiedFxEvent(): AvailableEvent {
  const event = availableEvent("euro-policy-context");

  return {
    ...event,
    selectionState: "next-scheduled",
    intelligence: {
      ...event.intelligence,
      phase: "release-time-unverified",
      milestones: {
        ...event.intelligence.milestones,
        release: null,
      },
      decisionEvidence: { status: "not-observed" },
      releaseTiming: { status: "unverified" },
      rateFacts: { availability: "unavailable" },
      readiness: {
        schedule: "available",
        decisionEvidence: "not-observed",
        verifiedReleaseTime: "unverified",
        rateFacts: "unavailable",
        sessionReview: "not-computed",
      },
    },
  };
}

function verifyAvailableFx(): void {
  const html = renderToStaticMarkup(
    VipEcbPolicyEventPanel({ event: availableEvent("euro-policy-context") }),
  );

  for (const expected of [
    "ECB Event Intelligence",
    "ECB Monetary Policy",
    "Euro policy context affecting the EUR side of this pair.",
    "Event Clock",
    "Post +5m",
    "29 Oct 2026, 14:15 Frankfurt time",
    "Verified release time",
    "Observed",
    "2026-10-29",
    DECISION_URL,
    "Deposit facility",
    "2.00%",
    "Main refinancing operations",
    "2.15%",
    "Marginal lending facility",
    "2.40%",
    "2026-10-30",
    "Percent",
    "Session review",
    "Not computed",
    "Official source",
    SOURCE_URL,
    "Source fetched",
    "Selected snapshot known-at",
    "Snapshot known-at",
    "Evaluated at",
  ]) {
    assert.ok(html.includes(expected), `available FX renders ${expected}`);
  }

  assert.doesNotMatch(html, /internal-content-digest|internal-source-version/);
}

function verifyUnverifiedFx(): void {
  const html = renderToStaticMarkup(
    VipEcbPolicyEventPanel({ event: unverifiedFxEvent() }),
  );

  assert.ok(html.includes("Next scheduled"));
  assert.ok(html.includes("Release time unverified"));
  assert.ok(html.includes("Release time not yet verified"));
  assert.ok(html.includes("Not observed"));
  assert.ok(html.includes("Rate facts"));
  assert.ok(html.includes("Unavailable"));
  assert.doesNotMatch(html, /Canonical ECB policy rate facts|Deposit facility/);
}

function verifyAvailableEstr(): void {
  const html = renderToStaticMarkup(
    VipEcbPolicyEventPanel({
      event: availableEvent("direct-euro-rate-policy-context"),
    }),
  );

  assert.ok(html.includes("Direct euro-rate policy context for €STR."));
  assert.ok(html.includes("ecb-monetary-policy-decision:2026-10-29"));
  assert.ok(html.includes("Deposit facility"));
  assert.ok(html.includes("2.00%"));
  assert.doesNotMatch(
    html,
    /trade recommendation|market signal|directional implication/i,
  );
}

function verifyDegradedStates(): void {
  const degraded = [
    {
      event: {
        status: "source-unavailable",
        relevance: "euro-policy-context",
        sourceUrl: SOURCE_URL,
        reason: "raw provider failure must not render",
      },
      title: "ECB event source unavailable",
    },
    {
      event: {
        status: "source-malformed",
        relevance: "euro-policy-context",
        sourceUrl: SOURCE_URL,
        reason: "raw parser failure must not render",
      },
      title: "ECB event source data malformed",
    },
    {
      event: {
        status: "no-relevant-event",
        relevance: "euro-policy-context",
        sourceUrl: SOURCE_URL,
        fetchedAt: SOURCE_FETCHED_AT,
      },
      title: "No relevant ECB event selected",
    },
    {
      event: {
        status: "reconciliation-required",
        relevance: "euro-policy-context",
        reason: "schedule-normalization",
      },
      title: "ECB event reconciliation required",
    },
    {
      event: {
        status: "persistence-unavailable",
        relevance: "euro-policy-context",
        owner: "event-memory",
        reason: "raw persistence failure must not render",
      },
      title: "ECB event persistence unavailable",
    },
    {
      event: {
        status: "stored-state-invalid",
        relevance: "euro-policy-context",
        owner: "active-event",
      },
      title: "Stored ECB event state invalid",
    },
    {
      event: {
        status: "insufficient-as-known-state",
        relevance: "euro-policy-context",
        canonicalEventId: "internal-event-id",
        evaluatedAt: "2026-10-29T13:00:00.000Z",
      },
      title: "Insufficient as-known ECB event state",
    },
    {
      event: {
        status: "runtime-unavailable",
        relevance: "euro-policy-context",
        reason: "unexpected-runtime-error",
      },
      title: "ECB event runtime unavailable",
    },
  ] as const satisfies readonly {
    readonly event: MarketProductVipEcbPolicyEventContextV1;
    readonly title: string;
  }[];

  assert.equal(degraded.length, 8, "all degraded union states are covered");

  for (const fixture of degraded) {
    const html = renderToStaticMarkup(
      VipEcbPolicyEventPanel({ event: fixture.event }),
    );
    assert.ok(html.includes(fixture.title), `${fixture.event.status} renders`);
    assert.doesNotMatch(html, /Scheduled decision|Deposit facility|2\.00%/);
    assert.doesNotMatch(
      html,
      /raw provider failure|raw parser failure|raw persistence failure|internal-event-id/,
    );
  }
}

function verifyIntegrationAndBoundaries(): void {
  const repositoryRoot = process.cwd();
  const panelSource = readFileSync(
    path.join(
      repositoryRoot,
      "src/components/vip/market-room/VipEcbPolicyEventPanel.tsx",
    ),
    "utf8",
  );
  const fxSource = readFileSync(
    path.join(repositoryRoot, "src/components/vip/market-room/VipFxMarketRoom.tsx"),
    "utf8",
  );
  const estrSource = readFileSync(
    path.join(repositoryRoot, "src/components/vip/market-room/VipEstrMarketRoom.tsx"),
    "utf8",
  );

  for (const [label, source, followingLayer] of [
    ["FX", fxSource, "<DeepIntelligenceLayers deep={deep} />"],
    ["€STR", estrSource, "<RateIntelligence deep={deep} />"],
  ] as const) {
    const eventPanel =
      "<VipEcbPolicyEventPanel event={deep.details.ecbPolicyEvent} />";
    assert.ok(source.includes(eventPanel), `${label} passes existing event context`);
    assert.ok(
      source.indexOf(eventPanel) < source.indexOf(followingLayer),
      `${label} event panel precedes analytical layers`,
    );
  }

  for (const forbidden of [
    '"use client"',
    "'use client'",
    "fetch(",
    "Date.now",
    "setInterval",
    "setTimeout",
    "useEffect",
    "live countdown",
    "bullish",
    "bearish",
    "hawkish",
    "dovish",
    "surprise",
    "probability",
    "trade recommendation",
    "Decision Lifecycle",
  ]) {
    assert.equal(
      panelSource.toLowerCase().includes(forbidden.toLowerCase()),
      false,
      `event panel excludes ${forbidden}`,
    );
  }
}

function main(): void {
  verifyAvailableFx();
  verifyUnverifiedFx();
  verifyAvailableEstr();
  verifyDegradedStates();
  verifyIntegrationAndBoundaries();

  console.log("PASS: VIP ECB policy event presentation");
}

main();
