import "server-only";

const LEMON_API_ORIGIN_V1 = "https://api.lemonsqueezy.com";
export const LEMON_API_TIMEOUT_MS_V1 = 8_000;

export type LemonApiRequestErrorCodeV1 =
  | "configuration-unavailable"
  | "provider-unavailable"
  | "invalid-provider-response";

export class LemonApiRequestErrorV1 extends Error {
  readonly code: LemonApiRequestErrorCodeV1;

  constructor(code: LemonApiRequestErrorCodeV1) {
    super("Lemon API request failed safely.");
    this.name = "LemonApiRequestErrorV1";
    this.code = code;
  }
}

export interface LemonApiRequestDependenciesV1 {
  readonly getApiKey: () => string | null | undefined;
  readonly fetchProvider: typeof fetch;
  readonly timeoutMs: number;
}

interface LemonApiRequestV1 {
  readonly method: "GET" | "POST";
  readonly body?: string;
}

/** Small server-only JSON:API transport shared by checkout and portal calls. */
export async function requestLemonApiJsonV1(
  pathname: string,
  request: LemonApiRequestV1,
  dependencies: LemonApiRequestDependenciesV1,
): Promise<unknown> {
  const endpoint = providerEndpointV1(pathname);
  const apiKey = apiKeyV1(dependencies);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), dependencies.timeoutMs);
  let response: Response;

  try {
    response = await dependencies.fetchProvider(endpoint, {
      method: request.method,
      headers: {
        Accept: "application/vnd.api+json",
        "Content-Type": "application/vnd.api+json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: request.body,
      cache: "no-store",
      signal: controller.signal,
    });
  } catch {
    throw new LemonApiRequestErrorV1("provider-unavailable");
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new LemonApiRequestErrorV1("provider-unavailable");
  }

  try {
    return await response.json();
  } catch {
    throw new LemonApiRequestErrorV1("invalid-provider-response");
  }
}

function providerEndpointV1(pathname: string): string {
  if (!pathname.startsWith("/v1/") || pathname.includes("?") ||
    pathname.includes("#")) {
    throw new LemonApiRequestErrorV1("configuration-unavailable");
  }

  return `${LEMON_API_ORIGIN_V1}${pathname}`;
}

function apiKeyV1(dependencies: LemonApiRequestDependenciesV1): string {
  let apiKey: string | null | undefined;

  try {
    apiKey = dependencies.getApiKey();
  } catch {
    throw new LemonApiRequestErrorV1("configuration-unavailable");
  }

  if (typeof apiKey !== "string" || apiKey.trim().length === 0) {
    throw new LemonApiRequestErrorV1("configuration-unavailable");
  }

  return apiKey.trim();
}
