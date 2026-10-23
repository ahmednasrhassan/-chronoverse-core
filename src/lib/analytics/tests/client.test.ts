import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import type { AnalyticsRuntimeV1 } from "../client";

import {
  advancePageViewTransitionV1,
  buildAnalyticsPagePathV1,
  isProductionAnalyticsLocationV1,
  trackPageViewV1,
} from "../client";

interface RuntimeCaptureV1 {
  readonly calls: unknown[][];
  readonly runtime: AnalyticsRuntimeV1;
}

function runtime(overrides: Partial<AnalyticsRuntimeV1> = {}): RuntimeCaptureV1 {
  const calls: unknown[][] = [];
  const values: Record<string, string> = {
    chrono_cookie_consent: JSON.stringify({
      necessary: true,
      analytics: true,
      marketing: false,
    }),
  };

  return {
    calls,
    runtime: {
      hostname: "chronoversecapital.com",
      pathname: "/reports",
      origin: "https://chronoversecapital.com",
      title: "Chronoverse Research",
      referrer: "https://www.reddit.com/",
      storage: { getItem: (key) => values[key] ?? null },
      loaded: true,
      gtag: (...args) => calls.push(args),
      ...overrides,
    },
  };
}

function verifyProductionGuard(): void {
  assert.equal(
    isProductionAnalyticsLocationV1("chronoversecapital.com", "/reports"),
    true,
  );
  assert.equal(isProductionAnalyticsLocationV1("localhost", "/reports"), false);
  assert.equal(isProductionAnalyticsLocationV1("127.0.0.1", "/reports"), false);
  assert.equal(
    isProductionAnalyticsLocationV1(
      "chronoverse-git-feature.vercel.app",
      "/reports",
    ),
    false,
  );
  assert.equal(
    isProductionAnalyticsLocationV1("chronoversecapital.com", "/studio"),
    false,
  );
  assert.equal(
    isProductionAnalyticsLocationV1(
      "chronoversecapital.com",
      "/studio/desk",
    ),
    false,
  );
}

function verifyConsentAndPageViews(): void {
  const denied = runtime({ storage: { getItem: () => "denied" } });
  assert.equal(trackPageViewV1("/reports", null, denied.runtime), false);
  assert.deepEqual(denied.calls, []);
  const allowed = runtime();
  assert.equal(trackPageViewV1("/reports", null, allowed.runtime), true);
  assert.equal(allowed.calls.length, 1);
  assert.doesNotMatch(JSON.stringify(allowed.calls), /email|user_id|customer|subscription|authSubject|lemon/i);
}

function verifyPageViewOwnership(): void {
  const initial = advancePageViewTransitionV1(null, "/?utm_source=reddit");
  assert.equal(initial.shouldTrack, false, "the client tracker skips initial view");
  const navigation = advancePageViewTransitionV1(
    initial.currentPath,
    "/reports?utm_source=reddit",
  );
  assert.equal(navigation.shouldTrack, true);
  const repeated = advancePageViewTransitionV1(
    navigation.currentPath,
    navigation.currentPath,
  );
  assert.equal(repeated.shouldTrack, false, "the same route is never duplicated");

  assert.equal(
    buildAnalyticsPagePathV1(
      "/reports",
      "utm_source=reddit&utm_campaign=launch&code=secret&email=a%40b.test",
    ),
    "/reports?utm_source=reddit&utm_campaign=launch",
  );

  const layoutSource = readFileSync(
    path.join(process.cwd(), "src/app/layout.tsx"),
    "utf8",
  );
  assert.match(layoutSource, /send_page_view: false/);
  assert.equal(
    layoutSource.split("window.gtag('event', 'page_view'").length - 1,
    1,
    "the bootstrap owns exactly one explicit initial page_view",
  );
}

verifyProductionGuard();
verifyConsentAndPageViews();
verifyPageViewOwnership();

console.log("PASS: minimal production analytics guards and event contracts");
