import "server-only";

import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import { types } from "node:util";
import { parseEventInstantV1 } from "../events/eventClock";
import {
  parseBojDecisionContinuityEvidenceV1,
  type BojDecisionContinuityEvidenceV1,
} from "../providers/boj/decisionContinuityEvidence";

const sourceUrl = "https://www.boj.or.jp/en/mopo/mpmsche_minu/minu_2024/g240614.htm";
const maxBytes = 2 * 1024 * 1024;
const maxTimeoutMs = 15_000;
const signalAborted = Object.getOwnPropertyDescriptor(AbortSignal.prototype, "aborted")!.get!;

export type BojContinuityCaptureFailureCodeV1 =
  | "invalid-request" | "network" | "http" | "timeout" | "aborted" | "redirect"
  | "source-identity" | "content-type" | "content-encoding" | "content-length"
  | "missing-body" | "response-too-large" | "truncated-response" | "invalid-encoding"
  | "html-layout" | "parser-rejection" | "clock" | "invalid-receipt"
  | "invalid-cutoff" | "future-cutoff";

export class BojContinuityCaptureErrorV1 extends Error {
  constructor(readonly code: BojContinuityCaptureFailureCodeV1, options?: ErrorOptions) {
    super("BoJ continuity capture V1: " + code + ".", options);
    this.name = "BojContinuityCaptureErrorV1";
  }
}

declare const receiptBrand: unique symbol;
/** Opaque process-local capability; fields, brands, copies and serialized values confer no membership. */
export interface BojContinuityCaptureReceiptV1 { readonly [receiptBrand]: true }
export interface AcquireBojContinuityCaptureInputV1 { readonly signal: AbortSignal }
export interface ReadBojContinuityCaptureInputV1 {
  readonly receipt: BojContinuityCaptureReceiptV1;
  /** Explicit offset-bearing assessment instant; reading never samples the current clock. */
  readonly evaluatedAt: string;
  /** Explicit offset-bearing cutoff, compared at millisecond precision; cannot exceed evaluatedAt. */
  readonly knowledgeCutoff: string;
}

/** Serializable description, not an independently transferable capability or predecessor proof. */
export interface BojContinuityCaptureDescriptionV1 {
  readonly schemaVersion: "boj-continuity-capture-v1";
  readonly semantic: "trusted-acquisition-description";
  /** Canonical ISO completion instant, never publication time or historical possession. */
  readonly knownAt: string;
  readonly provenance: {
    readonly basis: "qualified-official-https-acquisition";
    readonly acquisitionTrust: "authority-owned";
    readonly officialSuccessionVerification: "not-performed";
  };
  readonly acquiredBodyDigest: {
    readonly algorithm: "sha256";
    readonly representation: "identity-response-body-bytes";
    readonly value: string;
    readonly byteLength: number;
  };
  readonly extraction: "qualified-visible-main-unchanged-v1";
  /** Unmodified parser description: its own provenance remains parsed-document/source-fact only. */
  readonly sourceFacts: BojDecisionContinuityEvidenceV1;
}
export type BojContinuityCaptureReadResultV1 =
  | { readonly status: "available"; readonly capture: BojContinuityCaptureDescriptionV1 }
  | { readonly status: "not-known-as-of" };
export interface BojContinuityCaptureAuthorityV1 {
  readonly acquire: (input: AcquireBojContinuityCaptureInputV1) => Promise<{
    readonly status: "acquired"; readonly receipt: BojContinuityCaptureReceiptV1;
  }>;
  readonly readAsKnownAt: (input: ReadBojContinuityCaptureInputV1) => BojContinuityCaptureReadResultV1;
}
export interface BojContinuityCaptureDependenciesV1 {
  /** Infrastructure/test owner configuration, never accepted from capture or read requests. */
  readonly fetchImpl: typeof fetch;
  readonly nowUnixMilliseconds: () => number;
  /** Bounded per-acquisition deadline; test owners may shorten the production maximum. */
  readonly timeoutMs?: number;
}

/** Isolated infrastructure/test owner. Configured owners cannot issue receipts for the default owner. */
export function createBojContinuityCaptureAuthorityV1(
  dependencies: BojContinuityCaptureDependenciesV1,
): BojContinuityCaptureAuthorityV1 {
  assertServer();
  const data = closedData(dependencies, ["fetchImpl", "nowUnixMilliseconds"], ["timeoutMs"]);
  const configuredFetch = data.fetchImpl;
  const configuredClock = data.nowUnixMilliseconds;
  const configuredTimeout = Object.hasOwn(data, "timeoutMs") ? data.timeoutMs : maxTimeoutMs;
  if (typeof configuredFetch !== "function" || typeof configuredClock !== "function" ||
      typeof configuredTimeout !== "number" || !Number.isSafeInteger(configuredTimeout) || configuredTimeout < 1 || configuredTimeout > maxTimeoutMs) fail("invalid-request");
  // Capture validated types and values before defining the asynchronous operations.
  const fetchImpl = configuredFetch as typeof fetch;
  const nowUnixMilliseconds = configuredClock as () => number;
  const timeoutMs = configuredTimeout;
  const captures = new WeakMap<object, { readonly knownAtMs: number; readonly description: BojContinuityCaptureDescriptionV1 }>();

  async function acquire(input: AcquireBojContinuityCaptureInputV1) {
    assertServer();
    const { signal: callerSignal } = closedData(input, ["signal"]);
    if (typeof callerSignal !== "object" || callerSignal === null || types.isProxy(callerSignal)) fail("invalid-request");
    try { signalAborted.call(callerSignal); } catch { fail("invalid-request"); }
    const signal = callerSignal as AbortSignal;
    const controller = new AbortController();
    const started = performance.now();
    let failure: "timeout" | "aborted" | undefined;
    const cancel = () => { failure ??= "aborted"; controller.abort(); };
    EventTarget.prototype.addEventListener.call(signal, "abort", cancel, { once: true });
    if (signalAborted.call(signal)) cancel();
    const timer = setTimeout(() => { failure ??= "timeout"; controller.abort(); }, timeoutMs);
    let response: Response | undefined;
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    let issued = false;
    const check = () => {
      if (signalAborted.call(signal)) cancel();
      // A synchronous decoding/parsing phase cannot evade the deadline by delaying the timer.
      if (performance.now() - started >= timeoutMs) { failure ??= "timeout"; controller.abort(); }
      if (failure) fail(failure);
    };
    try {
      check();
      const fetched = Promise.resolve().then(() => {
        check();
        return fetchImpl(sourceUrl, {
          method: "GET", headers: { Accept: "text/html", "Accept-Encoding": "identity" },
          redirect: "error", cache: "no-store", signal: controller.signal,
        }) as Promise<Response>;
      });
      // Dispose of bodies delivered after cancellation by a noncooperative dependency.
      void fetched.then(late => { if (controller.signal.aborted) dispose(late.body); }, () => {}).catch(() => {});
      response = await cancellable(fetched, controller.signal, () => failure ?? "aborted");
      check();
      if (response.redirected || (response.status >= 300 && response.status < 400)) fail("redirect");
      if (response.url !== "" && response.url !== sourceUrl) fail("source-identity");
      if (response.status === 206) fail("truncated-response");
      if (response.status !== 200) fail("http");
      // Balanced optional quotes only; duplicate/unknown parameters and charset substitutions fail.
      if (!/^text\/html(?:\s*;\s*charset\s*=\s*(?:utf-8|"utf-8"))?\s*$/i.test(response.headers.get("content-type") ?? "")) fail("content-type");
      const encoding = response.headers.get("content-encoding");
      // Fetch may transparently decompress. Identity makes Content-Length comparable to acquired bytes.
      if (encoding !== null && encoding.trim().toLowerCase() !== "identity") fail("content-encoding");
      const length = response.headers.get("content-length");
      if (length !== null && !/^(?:0|[1-9]\d*)$/.test(length)) fail("content-length");
      const declared = length === null ? null : Number(length);
      if (declared !== null && declared > maxBytes) fail("response-too-large");
      if (response.body === null) fail("missing-body");
      reader = response.body.getReader();
      const buffer = new Uint8Array(maxBytes);
      let total = 0;
      for (;;) {
        check();
        const chunk = await cancellable(reader.read(), controller.signal, () => failure ?? "aborted");
        check();
        if (chunk.done) break;
        if (!(chunk.value instanceof Uint8Array)) fail("network");
        if (chunk.value.byteLength > maxBytes - total) fail("response-too-large");
        buffer.set(chunk.value, total);
        total += chunk.value.byteLength;
      }
      if (declared !== null && declared !== total) fail("truncated-response");
      const bytes = buffer.subarray(0, total);
      let html: string;
      try { html = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes); }
      catch (cause) { throw new BojContinuityCaptureErrorV1("invalid-encoding", { cause }); }
      check();
      const main = extractQualifiedMain(html);
      check();
      let sourceFacts: BojDecisionContinuityEvidenceV1;
      try { sourceFacts = parseBojDecisionContinuityEvidenceV1({ sourceUrl, documentKind: "mpm-minutes-english-html", html: main }); }
      catch (cause) {
        if (cause instanceof TypeError && /^BoJ continuity V1: /.test(cause.message)) throw new BojContinuityCaptureErrorV1("parser-rejection", { cause });
        throw cause;
      }
      check();
      const digest = createHash("sha256").update(bytes).digest("hex");
      // Only accepted source facts reach the sole acquisition completion clock.
      let knownAtMs: unknown;
      try { knownAtMs = nowUnixMilliseconds(); }
      catch (cause) { throw new BojContinuityCaptureErrorV1("clock", { cause }); }
      check();
      // Conservative UTC civil-date floor, not an invented publisher release instant.
      const publicationFloor = parseEventInstantV1(sourceFacts.source.publication.date + "T00:00:00Z", "publication date bound");
      if (typeof knownAtMs !== "number" || !Number.isSafeInteger(knownAtMs) || knownAtMs < publicationFloor ||
          knownAtMs > 253_402_300_799_999) fail("clock");
      const description: BojContinuityCaptureDescriptionV1 = Object.freeze({
        schemaVersion: "boj-continuity-capture-v1", semantic: "trusted-acquisition-description", knownAt: new Date(knownAtMs).toISOString(),
        provenance: Object.freeze({ basis: "qualified-official-https-acquisition", acquisitionTrust: "authority-owned", officialSuccessionVerification: "not-performed" }),
        acquiredBodyDigest: Object.freeze({ algorithm: "sha256", representation: "identity-response-body-bytes", value: digest, byteLength: total }),
        extraction: "qualified-visible-main-unchanged-v1", sourceFacts,
      });
      check();
      const receipt = Object.freeze(Object.create(null)) as BojContinuityCaptureReceiptV1;
      captures.set(receipt, Object.freeze({ knownAtMs, description }));
      issued = true;
      return Object.freeze({ status: "acquired" as const, receipt });
    } catch (error) {
      check();
      if (error instanceof BojContinuityCaptureErrorV1) throw error;
      if (error instanceof DOMException && error.name === "TimeoutError") fail("timeout");
      if (error instanceof DOMException && error.name === "AbortError") fail("aborted");
      if (error instanceof TypeError && ["fetch failed", "terminated"].includes(error.message) && "cause" in error && error.cause instanceof Error) {
        if (error.cause.message === "unexpected redirect") fail("redirect");
        if (reader && error.message === "terminated") fail("truncated-response");
        fail("network");
      }
      // Programming defects propagate; every exception still withholds the capability.
      throw error;
    } finally {
      clearTimeout(timer);
      EventTarget.prototype.removeEventListener.call(signal, "abort", cancel);
      if (!issued) {
        controller.abort();
        if (reader) { try { void reader.cancel().catch(() => {}); } catch { /* Preserve failure. */ } }
        else dispose(response?.body);
      }
      try { reader?.releaseLock(); } catch { /* Preserve failure, including pending read cancellation. */ }
    }
  }

  function readAsKnownAt(input: ReadBojContinuityCaptureInputV1): BojContinuityCaptureReadResultV1 {
    assertServer();
    // Never execute request accessors or receipt traps, including proxies and revoked proxies.
    const receipt = ownData(input, "receipt", "invalid-receipt");
    const capture = typeof receipt === "object" && receipt !== null ? captures.get(receipt) : undefined;
    if (!capture) fail("invalid-receipt");
    const data = closedData(input, ["receipt", "evaluatedAt", "knowledgeCutoff"]);
    const evaluatedAtMs = cutoffInstant(data.evaluatedAt);
    const cutoffMs = cutoffInstant(data.knowledgeCutoff);
    if (cutoffMs > evaluatedAtMs) fail("future-cutoff");
    if (capture.knownAtMs > cutoffMs) return Object.freeze({ status: "not-known-as-of" });
    return freezeCopy({ status: "available" as const, capture: capture.description });
  }
  return Object.freeze({ acquire, readAsKnownAt });
}

// INACTIVE: initialization invokes neither fetch, clocks, timers, environment nor storage.
const defaultAuthority = createBojContinuityCaptureAuthorityV1({
  fetchImpl: (input, init) => globalThis.fetch(input, init), nowUnixMilliseconds: () => Date.now(),
});
export function acquireBojContinuityCaptureV1(input: AcquireBojContinuityCaptureInputV1) { return defaultAuthority.acquire(input); }
export function readBojContinuityCaptureAsKnownAtV1(input: ReadBojContinuityCaptureInputV1) { return defaultAuthority.readAsKnownAt(input); }

/** Strict lexical structure boundary for the inspected publisher shell, NOT source-fact interpretation.
 * No HTML repair, DOM execution, entity expansion or serialized/rebuilt source text.
 * Require one balanced visible main under exactly the inspected ancestors. All other tags must
 * balance (HTML void elements excepted); reject foreign/inert/raw-text layouts and inline stylesheets.
 * The two inspected empty external script elements are indivisible shell tokens.
 */
function extractQualifiedMain(html: string): string {
  const allowed = new Set("html head meta title link body div a header button img p ul li em nav aside form input datalist main h1 span br sup dl dt strong dd h2 h3 h4 ol hr footer address small script".split(" "));
  const voidTags = new Set(["meta", "link", "img", "input", "br", "hr"]);
  const qualifiedHeadLinks = new Set([
    "<link rel=\"stylesheet\" type=\"text/css\" href=\"/common2/css/wysiwyg.css\">",
    "<link rel=\"stylesheet\" type=\"text/css\" href=\"/common2/css/style.css\">",
    "<link rel=\"preconnect\" href=\"https://fonts.googleapis.com\">",
    "<link rel=\"preconnect\" href=\"https://fonts.gstatic.com\" crossorigin>",
    "<link rel=\"stylesheet\" href=\"https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@100;300;400;500;700;900&display=swap\">",
    "<link rel=\"stylesheet\" href=\"https://fonts.googleapis.com/css2?family=Noto+Serif+JP:wght@600&display=swap\">"
  ]);
  const stack: { readonly name: string; readonly token: string }[] = [];
  const ids = new Set<string>();
  let position = 0, tags = 0, mainStart = -1, mainEnd = -1, headCount = 0, bodyCount = 0, htmlCount = 0;
  const start = /^\s*<!DOCTYPE html>/i.exec(html);
  if (!start) fail("html-layout");
  position = start[0].length;
  while (position < html.length) {
    if (html[position] !== "<") {
      const next = html.indexOf("<", position);
      const end = next < 0 ? html.length : next;
      if (stack.length === 0 && html.slice(position, end).trim() !== "") fail("html-layout");
      position = end;
      continue;
    }
    if (html.startsWith("<!--", position)) {
      const end = html.indexOf("-->", position + 4);
      if (end < 0 || /--|<\/?main\b/i.test(html.slice(position + 4, end))) fail("html-layout");
      position = end + 3;
      continue;
    }
    // A linear, quote-aware scan with a small per-tag ceiling avoids unbounded regex backtracking.
    let end = position + 1;
    let quote: string | null = null;
    for (; end < html.length && end - position <= 4096; end++) {
      const character = html[end];
      if (character === "<") fail("html-layout");
      if (quote !== null) { if (character === quote) quote = null; }
      else if (character === '"' || character === "'") quote = character;
      else if (character === ">") break;
    }
    if (end >= html.length || end - position > 4096 || quote !== null || ++tags > 20_000) fail("html-layout");
    const token = html.slice(position, end + 1);
    const parts = /^<(\/?)([a-z][a-z0-9]*)([\s\S]*?)>$/.exec(token);
    if (!parts || !allowed.has(parts[2]!)) fail("html-layout");
    const name = parts[2]!;
    if (parts[1] === "/") {
      if (parts[3]!.trim() !== "" || stack.at(-1)?.name !== name) fail("html-layout");
      if (name === "main") mainEnd = position + token.length;
      stack.pop();
    } else {
      const attributes = shellAttributes(parts[3]!);
      // Apply non-void syntax qualification before the indivisible script branch can return.
      if (!voidTags.has(name) && parts[3]!.trimEnd().endsWith("/")) fail("html-layout");
      if (attributes.has("id")) {
        const id = attributes.get("id")!;
        if (ids.has(id)) fail("html-layout");
        ids.add(id);
        if (id === "contents" && name !== "main") fail("html-layout");
      }
      // A correct embedded fragment cannot override conflicting page identity.
      if (name === "meta" && attributes.get("property") === "og:url" && attributes.get("content") !== sourceUrl) fail("source-identity");
      if (name === "link" && attributes.get("rel") === "canonical" && attributes.get("href") !== sourceUrl) fail("source-identity");
      // Unknown stylesheets, refreshes and encoding declarations are outside the inspected shell.
      if (name === "link" && (stack.map(n => n.name).join("/") !== "html/head" ||
          (!qualifiedHeadLinks.has(token) && !(attributes.size === 2 && attributes.get("rel") === "canonical" && attributes.get("href") === sourceUrl)))) fail("html-layout");
      if (name === "meta") {
        if (stack.map(n => n.name).join("/") !== "html/head") fail("html-layout");
        if (attributes.has("charset") && attributes.get("charset")?.toLowerCase() !== "utf-8") fail("content-type");
        if (attributes.has("http-equiv") && (attributes.get("http-equiv")?.toLowerCase() !== "content-type" ||
            !/^text\/html;\s*charset=utf-8$/i.test(attributes.get("content") ?? ""))) fail("content-type");
      }
      if (name === "html" && (stack.length !== 0 || ++htmlCount !== 1 || token !== '<html lang="en">')) fail("html-layout");
      if (name === "head" && (stack.map(n => n.name).join("/") !== "html" || ++headCount !== 1 || bodyCount !== 0)) fail("html-layout");
      if (name === "body" && (stack.map(n => n.name).join("/") !== "html" || headCount !== 1 || ++bodyCount !== 1 || token !== '<body class="cate-mopo en">')) fail("html-layout");
      if (name === "main") {
        if (mainStart !== -1 || token !== '<main id="contents">' ||
            stack.map(n => n.token).join("\n") !== '<html lang="en">\n<body class="cate-mopo en">\n<div class="clear_fix">\n<div id="right_col">') fail("html-layout");
        mainStart = position;
      }
      if (name === "script") {
        if (stack.map(n => n.name).join("/") !== "html/body" || attributes.size !== 1 ||
            !["/common2/js/common2.js", "/common2/js/qssearch.js"].includes(attributes.get("src") ?? "") ||
            !html.startsWith("</script>", position + token.length)) fail("html-layout");
        position += token.length + "</script>".length;
        continue;
      }
      if (!voidTags.has(name)) {
        if (stack.length >= 60) fail("html-layout");
        stack.push({ name, token });
      }
    }
    position += token.length;
  }
  if (stack.length !== 0 || htmlCount !== 1 || headCount !== 1 || bodyCount !== 1 || mainStart < 0 || mainEnd <= mainStart) fail("html-layout");
  return html.slice(mainStart, mainEnd);
}

function shellAttributes(raw: string): Map<string, string> {
  const result = new Map<string, string>();
  let rest = raw.replace(/\/$/, "");
  while (rest.trim() !== "") {
    const match = /^\s+([a-zA-Z][a-zA-Z0-9:_-]*)(?:\s*=\s*(?:"([^"<>]*)"|'([^'<>]*)'))?/.exec(rest);
    if (!match) fail("html-layout");
    const name = match[1]!.toLowerCase();
    if (result.has(name)) fail("html-layout");
    result.set(name, match[2] ?? match[3] ?? "");
    rest = rest.slice(match[0].length);
  }
  return result;
}
function fail(code: BojContinuityCaptureFailureCodeV1): never { throw new BojContinuityCaptureErrorV1(code); }
function assertServer(): void { if (typeof window !== "undefined") throw new Error("BoJ continuity capture is server-only."); }
function plainRecord(value: unknown, code: BojContinuityCaptureFailureCodeV1): asserts value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || types.isProxy(value)) fail(code);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) fail(code);
}
function ownData(value: unknown, key: string, code: BojContinuityCaptureFailureCodeV1): unknown {
  plainRecord(value, code);
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, "value")) fail(code);
  return descriptor.value;
}
function closedData(value: unknown, required: readonly string[], optional: readonly string[] = []): Record<string, unknown> {
  plainRecord(value, "invalid-request");
  const retained: Record<string, unknown> = Object.create(null);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || (!required.includes(key) && !optional.includes(key))) fail("invalid-request");
    retained[key] = ownData(value, key, "invalid-request");
  }
  if (required.some(key => !Object.hasOwn(retained, key))) fail("invalid-request");
  return retained;
}
function cutoffInstant(value: unknown): number {
  if (typeof value !== "string") fail("invalid-cutoff");
  let milliseconds: number;
  try { milliseconds = parseEventInstantV1(value, "cutoff instant"); } catch { fail("invalid-cutoff"); }
  if (milliseconds < 0) fail("invalid-cutoff");
  return milliseconds;
}
function dispose(body: ReadableStream<Uint8Array> | null | undefined): void {
  try { void body?.cancel().catch(() => {}); } catch { /* Cleanup cannot replace the failure or extend the deadline. */ }
}
async function cancellable<T>(operation: Promise<T>, signal: AbortSignal, code: () => "timeout" | "aborted"): Promise<T> {
  if (signal.aborted) fail(code());
  let abort = () => {};
  const cancelled = new Promise<never>((_resolve, reject) => {
    abort = () => reject(new BojContinuityCaptureErrorV1(code()));
    signal.addEventListener("abort", abort, { once: true });
  });
  try { return await Promise.race([operation, cancelled]); }
  finally { signal.removeEventListener("abort", abort); }
}
function freezeCopy<T>(value: T): T {
  const copy = structuredClone(value);
  function freeze(nested: unknown): void {
    if (typeof nested !== "object" || nested === null) return;
    for (const child of Object.values(nested)) freeze(child);
    Object.freeze(nested);
  }
  freeze(copy);
  return copy;
}
