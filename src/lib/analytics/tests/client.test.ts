import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import type { AnalyticsRuntimeV1 } from "../client";

const {
  advancePageViewTransitionV1,
  buildAnalyticsPagePathV1,
  continueToSuccessfulCheckoutV1,
  isProductionAnalyticsLocationV1,
  trackBeginCheckoutV1,
  trackProductViewV1,
} = await import(
  new URL("../client.ts", import.meta.url).href
) as typeof import("../client");

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
      pathname: "/vip",
      origin: "https://chronoversecapital.com",
      title: "Chronoverse VIP",
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
    isProductionAnalyticsLocationV1("chronoversecapital.com", "/pricing"),
    true,
  );
  assert.equal(isProductionAnalyticsLocationV1("localhost", "/pricing"), false);
  assert.equal(isProductionAnalyticsLocationV1("127.0.0.1", "/pricing"), false);
  assert.equal(
    isProductionAnalyticsLocationV1(
      "chronoverse-git-feature.vercel.app",
      "/pricing",
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

function verifyConsentAndProductPayload(): void {
  const denied = runtime({
    storage: { getItem: () => "denied" },
  });
  assert.equal(
    trackProductViewV1("eurusd", "vip_active", denied.runtime),
    false,
  );
  assert.deepEqual(denied.calls, []);

  for (const accessState of [
    "anonymous_free",
    "authenticated_free",
    "vip_active",
  ] as const) {
    const allowed = runtime();
    assert.equal(trackProductViewV1("estr", accessState, allowed.runtime), true);
    assert.deepEqual(allowed.calls, [[
      "event",
      "product_view",
      {
        content_type: "market",
        content_id: "estr",
        access_state: accessState,
      },
    ]]);
    const serialized = JSON.stringify(allowed.calls);
    assert.doesNotMatch(
      serialized,
      /email|user_id|customer|subscription|authSubject|lemon/i,
    );
  }

  for (const elevatedState of ["owner", "admin"] as const) {
    const suppressed = runtime();
    assert.equal(
      trackProductViewV1("eurusd", elevatedState, suppressed.runtime),
      false,
    );
    assert.deepEqual(suppressed.calls, []);
  }

  for (const relativePath of [
    "src/app/(vip)/vip/page.tsx",
    "src/app/(vip)/vip/markets/[market]/page.tsx",
  ]) {
    const source = readFileSync(path.join(process.cwd(), relativePath), "utf8");
    assert.match(source, /access\.state === "vip_active"/);
    assert.doesNotMatch(source, /accessState=\{access\.state\}/);
  }
}

function verifyCheckoutMeasurementIsolation(): void {
  const successful = runtime({ pathname: "/pricing" });
  assert.equal(trackBeginCheckoutV1("monthly", successful.runtime), true);
  assert.deepEqual(successful.calls, [[
    "event",
    "begin_checkout",
    { plan: "monthly" },
  ]]);

  let destination = "";
  continueToSuccessfulCheckoutV1(
    "annual",
    "https://vault.chronoversecapital.com/checkout/custom/id",
    (url) => {
      destination = url;
    },
    () => {
      throw new Error("analytics unavailable");
    },
  );
  assert.equal(
    destination,
    "https://vault.chronoversecapital.com/checkout/custom/id",
    "analytics failure must not block successful checkout navigation",
  );

  const repositoryRoot = path.resolve(process.cwd());
  const checkoutSource = readFileSync(
    path.join(
      repositoryRoot,
      "src/app/(site)/pricing/CheckoutButtons.tsx",
    ),
    "utf8",
  );
  const responseValidation = checkoutSource.indexOf(
    "!response.ok || !isCheckoutResponse(payload)",
  );
  const measurement = checkoutSource.indexOf(
    "continueToSuccessfulCheckoutV1(",
  );
  assert.equal(responseValidation >= 0, true);
  assert.equal(
    measurement > responseValidation,
    true,
    "begin_checkout follows successful response validation",
  );
}

function verifyPageViewOwnership(): void {
  const initial = advancePageViewTransitionV1(null, "/?utm_source=reddit");
  assert.equal(initial.shouldTrack, false, "the client tracker skips initial view");
  const navigation = advancePageViewTransitionV1(
    initial.currentPath,
    "/pricing?utm_source=reddit",
  );
  assert.equal(navigation.shouldTrack, true);
  const repeated = advancePageViewTransitionV1(
    navigation.currentPath,
    navigation.currentPath,
  );
  assert.equal(repeated.shouldTrack, false, "the same route is never duplicated");

  assert.equal(
    buildAnalyticsPagePathV1(
      "/pricing",
      "utm_source=reddit&utm_campaign=launch&code=secret&email=a%40b.test",
    ),
    "/pricing?utm_source=reddit&utm_campaign=launch",
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
verifyConsentAndProductPayload();
verifyCheckoutMeasurementIsolation();
verifyPageViewOwnership();

console.log("PASS: minimal production analytics guards and event contracts");
