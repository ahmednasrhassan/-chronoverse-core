// Observational smoke check, not a load test or an authorization proof.
// Default: help or a dry-run plan, with no requests and no file writes.
// node scripts/benchmarks/production-proxy-smoke.mjs --base-url http://127.0.0.1:3000
// Add --execute for local requests; remote HTTPS also requires --allow-remote.
// GETs can warm caches and invoke providers. Use only an explicitly approved target.
// Optional origins: --www-url, --newsletter-url, --newsletter-www-url, --deployment-url.
// No credentials, redirects, retries, cron calls, or webhook calls are sent.
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { XMLValidator } from "fast-xml-parser";

const originOptions = ["base-url", "www-url", "newsletter-url", "newsletter-www-url", "deployment-url", "apps-url"];
const products = ["eurusd", "eurjpy", "eurgbp", "eurchf", "estr"];
const publicationPaths = ["/", "/reports", "/archive", "/contact", "/newsletter", "/robots.txt", "/sitemap.xml", "/rss.xml", "/feed.xml", "/account", "/api/newsletter", "/api/og"];
// These are regression probes for tombstones and redirects, not product discovery.
const retiredPaths = ["/markets", "/billing", "/vip", "/vip/markets", "/%76ip", "/vip%2Fmarkets", "/api/market-data", "/api/billing/checkout", "/api/billing/portal",
  ...products.map(id => `/api/markets/${id}/intelligence`),
  ...products.map(id => `/vip/markets/${id}`)];
const basePaths = [...publicationPaths, ...retiredPaths];
const maxBodyBytes = 2 * 1024 * 1024;
const help = `Usage: node scripts/benchmarks/production-proxy-smoke.mjs --base-url ORIGIN [--execute] [--allow-remote]
Without --execute, only a request plan is printed. No target defaults to production.
Remote execution requires HTTPS and --allow-remote. HTTP is allowed only for loopback.
Origins must not contain credentials, paths, queries, or fragments.
Optional explicit origins: --www-url, --newsletter-url, --newsletter-www-url, --deployment-url, --apps-url.
Requests are sequential anonymous GETs, 350 ms apart, with a 10-second timeout and 2 MiB body cap.
Output omits target hostnames, redirect queries, cookies, raw API bodies, and raw errors.
Execution observes responses; it does not assert complete authentication or matcher correctness.`;

export function parseOptions(args) {
  const { values } = parseArgs({ args, options: {
    ...Object.fromEntries(originOptions.map(name => [name, { type: "string" }])),
    execute: { type: "boolean", default: false },
    "allow-remote": { type: "boolean", default: false },
    help: { type: "boolean", default: false },
  }, strict: true, allowPositionals: false });
  return values;
}

export function buildPlan(options) {
  if (!options["base-url"]) throw new Error("An explicit --base-url is required.");
  const origins = {};
  for (const name of originOptions) {
    if (options[name] === undefined) continue;
    let origin;
    try { origin = new URL(options[name]); } catch { throw new Error(`Invalid origin for --${name}.`); }
    const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname);
    if (origin.username || origin.password || origin.search || origin.hash || origin.pathname !== "/" ||
        !(origin.protocol === "https:" || (loopback && origin.protocol === "http:"))) {
      throw new Error(`Unsafe origin for --${name}; use HTTPS or loopback HTTP without credentials or URL suffixes.`);
    }
    if (options.execute && !loopback && !options["allow-remote"]) {
      throw new Error("Remote requests require both --execute and --allow-remote.");
    }
    origins[name] = origin.origin;
  }
  const plan = basePaths.map(path => ({ target: "base-url", path }));
  if (origins["www-url"]) plan.push({ target: "www-url", path: "/markets?return=%2Faccount" }, { target: "www-url", path: "/favicon.ico" });
  if (origins["newsletter-url"]) plan.push({ target: "newsletter-url", path: "/" }, { target: "newsletter-url", path: "/archive" });
  if (origins["newsletter-www-url"]) plan.push({ target: "newsletter-www-url", path: "/" });
  if (origins["deployment-url"]) plan.push({ target: "deployment-url", path: "/account" });
  if (origins["apps-url"]) plan.push({ target: "apps-url", path: "/" });
  return plan.map(item => ({ ...item, url: new URL(item.path, origins[item.target]).href }));
}

function summarizeUrl(value, requestUrl) {
  if (!value) return undefined;
  try {
    const parsed = new URL(value, requestUrl);
    const knownPaths = [...basePaths, "/archive", "/favicon.ico", "/auth/confirm"];
    return { sameOrigin: parsed.origin === new URL(requestUrl).origin,
      pathname: knownPaths.includes(parsed.pathname) ? parsed.pathname : "[redacted-path]" };
  } catch { return { invalid: true }; }
}

async function readBody(response) {
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > maxBodyBytes) {
        await reader.cancel();
        throw new Error("response-body-limit");
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks, length);
}

export async function runSmoke(options, { fetchImpl = globalThis.fetch, pause = ms => new Promise(done => setTimeout(done, ms)) } = {}) {
  const plan = buildPlan(options);
  if (!options.execute) return { mode: "dry-run", requests: 0, plan: plan.map(({ target, path }) => ({ target, path })) };
  const results = [];
  for (const [index, item] of plan.entries()) {
    if (index > 0) await pause(350);
    const start = performance.now();
    try {
      const response = await fetchImpl(item.url, { method: "GET", redirect: "manual", credentials: "omit",
        signal: AbortSignal.timeout(10000), headers: { "user-agent": "Chronoverse-ReadOnly-Smoke/1.0" } });
      const bytes = await readBody(response);
      const contentType = response.headers.get("content-type") ?? "";
      const body = /text|json|xml/.test(contentType) ? new TextDecoder().decode(bytes) : "";
      let jsonValid;
      if (/json/.test(contentType)) {
        try { JSON.parse(body); jsonValid = true; } catch { jsonValid = false; }
      }
      results.push({ target: item.target, path: item.path, status: response.status,
        elapsedMs: Math.round(performance.now() - start), bytes: bytes.length,
        location: summarizeUrl(response.headers.get("location"), item.url),
        headers: Object.fromEntries(["content-type", "cache-control", "x-vercel-cache", "x-nextjs-cache", "x-robots-tag", "age", "x-frame-options", "x-content-type-options"].map(name => [name, response.headers.get(name)])),
        hasTitle: /<title>[^<]*<\/title>/.test(body),
        canonical: summarizeUrl(body.match(/<link rel="canonical" href="([^"]*)"/)?.[1], item.url),
        productLabels: item.target === "base-url" && item.path === "/" ? ["EUR/USD", "EUR/JPY", "EUR/GBP", "EUR/CHF", "STR"].map(label => ({ label, present: body.includes(label) })) : undefined,
        xmlValid: /xml/.test(contentType) && response.status === 200 ? XMLValidator.validate(body) === true : undefined,
        sitemapContainsVip: item.path === "/sitemap.xml" ? /<loc>[^<]*\/vip(?:\/|<)/.test(body) : undefined,
        jsonValid,
      });
    } catch (error) {
      results.push({ target: item.target, path: item.path, error: error?.message === "response-body-limit" ? "response-body-limit" : "request-failed" });
    }
  }
  return { checkedAt: new Date().toISOString(), mode: "execute", requests: results.length,
    note: "Network wall time, not CPU. Observations only; raw bodies and operational URL identifiers are omitted.", results };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = parseOptions(process.argv.slice(2));
    if (options.help || process.argv.length === 2) console.log(help);
    else {
      const report = await runSmoke(options);
      console.log(JSON.stringify(report, null, 2));
      if (report.results?.some(result => result.error || result.status >= 500)) process.exitCode = 1;
    }
  } catch {
    console.error("Invalid smoke-check options; no raw option values are logged. Use --help.");
    process.exitCode = 1;
  }
}
