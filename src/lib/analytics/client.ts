export const ANALYTICS_READY_EVENT_V1 = "chronoverse:analytics-ready";

export const ANALYTICS_PRODUCT_IDS_V1 = Object.freeze([
  "eurusd",
  "eurjpy",
  "eurgbp",
  "eurchf",
  "estr",
] as const);

export type AnalyticsProductIdV1 =
  (typeof ANALYTICS_PRODUCT_IDS_V1)[number];

export const ANALYTICS_PRODUCT_ACCESS_STATES_V1 = Object.freeze([
  "anonymous_free",
  "authenticated_free",
  "vip_active",
] as const);

export type AnalyticsProductAccessStateV1 =
  (typeof ANALYTICS_PRODUCT_ACCESS_STATES_V1)[number];

export type AnalyticsCheckoutPlanV1 = "monthly" | "annual";

export interface AnalyticsStorageV1 {
  readonly getItem: (key: string) => string | null;
}

export interface AnalyticsRuntimeV1 {
  readonly hostname: string;
  readonly pathname: string;
  readonly origin: string;
  readonly title: string;
  readonly referrer: string;
  readonly storage: AnalyticsStorageV1;
  readonly loaded: boolean;
  readonly gtag?: (...args: unknown[]) => void;
}

export interface PageViewTransitionV1 {
  readonly shouldTrack: boolean;
  readonly previousPath: string | null;
  readonly currentPath: string;
}

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    loadChronoverseAnalytics?: () => void;
    __chronoverseAnalyticsLoaded?: boolean;
  }
}

const CANONICAL_ANALYTICS_HOST_V1 = "chronoversecapital.com";
const SAFE_QUERY_KEYS_V1 = Object.freeze([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "market",
] as const);

export function hasAnalyticsConsentV1(storage: AnalyticsStorageV1): boolean {
  try {
    const detailedConsent = storage.getItem("chrono_cookie_consent");

    if (detailedConsent !== null) {
      const parsed = JSON.parse(detailedConsent) as unknown;
      return isRecord(parsed) && parsed.analytics === true;
    }

    return storage.getItem("cookie_consent") === "granted";
  } catch {
    return false;
  }
}

export function isProductionAnalyticsLocationV1(
  hostname: string,
  pathname: string,
): boolean {
  const normalizedHost = hostname.trim().toLowerCase();
  const normalizedPath = pathname.startsWith("/") ? pathname : `/${pathname}`;

  return normalizedHost === CANONICAL_ANALYTICS_HOST_V1
    && !isExcludedAnalyticsPathV1(normalizedPath);
}

export function buildAnalyticsPagePathV1(
  pathname: string,
  search: string,
): string {
  const normalizedPath = pathname.startsWith("/") ? pathname : `/${pathname}`;
  const source = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const safe = new URLSearchParams();

  for (const key of SAFE_QUERY_KEYS_V1) {
    for (const value of source.getAll(key)) {
      safe.append(key, value);
    }
  }

  const query = safe.toString();
  return query.length > 0 ? `${normalizedPath}?${query}` : normalizedPath;
}

export function advancePageViewTransitionV1(
  previousPath: string | null,
  currentPath: string,
): PageViewTransitionV1 {
  return Object.freeze({
    shouldTrack: previousPath !== null && previousPath !== currentPath,
    previousPath,
    currentPath,
  });
}

export function trackPageViewV1(
  pagePath: string,
  previousPath: string | null = null,
  runtime: AnalyticsRuntimeV1 | null = browserRuntimeV1(),
): boolean {
  if (runtime === null || !canEmitAnalyticsV1(runtime)) {
    return false;
  }

  const parameters: Record<string, string> = {
    page_path: pagePath,
    page_location: `${runtime.origin}${pagePath}`,
    page_title: runtime.title,
  };

  if (previousPath !== null) {
    parameters.page_referrer = `${runtime.origin}${previousPath}`;
  } else if (runtime.referrer.length > 0) {
    parameters.page_referrer = runtime.referrer;
  }

  return emitAnalyticsEventV1("page_view", parameters, runtime);
}

export function trackProductViewV1(
  contentId: unknown,
  accessState: unknown,
  runtime: AnalyticsRuntimeV1 | null = browserRuntimeV1(),
): boolean {
  if (!isAnalyticsProductIdV1(contentId)
    || !isAnalyticsProductAccessStateV1(accessState)
    || runtime === null
    || !canEmitAnalyticsV1(runtime)) {
    return false;
  }

  return emitAnalyticsEventV1("product_view", {
    content_type: "market",
    content_id: contentId,
    access_state: accessState,
  }, runtime);
}

export function trackBeginCheckoutV1(
  plan: unknown,
  runtime: AnalyticsRuntimeV1 | null = browserRuntimeV1(),
): boolean {
  if ((plan !== "monthly" && plan !== "annual")
    || runtime === null
    || !canEmitAnalyticsV1(runtime)) {
    return false;
  }

  return emitAnalyticsEventV1("begin_checkout", { plan }, runtime);
}

export function continueToSuccessfulCheckoutV1(
  plan: AnalyticsCheckoutPlanV1,
  checkoutUrl: string,
  navigate: (url: string) => void,
  track: (selectedPlan: AnalyticsCheckoutPlanV1) => unknown =
    trackBeginCheckoutV1,
): void {
  try {
    track(plan);
  } catch {
    // Measurement is best-effort and must never interrupt billing navigation.
  }

  navigate(checkoutUrl);
}

function canEmitAnalyticsV1(runtime: AnalyticsRuntimeV1): boolean {
  return runtime.loaded
    && typeof runtime.gtag === "function"
    && isProductionAnalyticsLocationV1(runtime.hostname, runtime.pathname)
    && hasAnalyticsConsentV1(runtime.storage);
}

function emitAnalyticsEventV1(
  eventName: "page_view" | "product_view" | "begin_checkout",
  parameters: Readonly<Record<string, string>>,
  runtime: AnalyticsRuntimeV1,
): boolean {
  try {
    runtime.gtag?.("event", eventName, parameters);
    return true;
  } catch {
    return false;
  }
}

function browserRuntimeV1(): AnalyticsRuntimeV1 | null {
  if (typeof window === "undefined") {
    return null;
  }

  return {
    hostname: window.location.hostname,
    pathname: window.location.pathname,
    origin: window.location.origin,
    title: document.title,
    referrer: document.referrer,
    storage: {
      getItem: (key) => window.localStorage.getItem(key),
    },
    loaded: window.__chronoverseAnalyticsLoaded === true,
    gtag: window.gtag,
  };
}

function isExcludedAnalyticsPathV1(pathname: string): boolean {
  return pathname === "/studio" || pathname.startsWith("/studio/")
    || pathname === "/api" || pathname.startsWith("/api/")
    || pathname === "/auth" || pathname.startsWith("/auth/")
    || pathname === "/_next" || pathname.startsWith("/_next/");
}

function isAnalyticsProductIdV1(value: unknown): value is AnalyticsProductIdV1 {
  return ANALYTICS_PRODUCT_IDS_V1.includes(value as AnalyticsProductIdV1);
}

function isAnalyticsProductAccessStateV1(
  value: unknown,
): value is AnalyticsProductAccessStateV1 {
  return ANALYTICS_PRODUCT_ACCESS_STATES_V1.includes(
    value as AnalyticsProductAccessStateV1,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
