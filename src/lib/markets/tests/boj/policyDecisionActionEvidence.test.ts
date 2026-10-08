import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import {
  buildBojPolicyDecisionActionEvidenceV1 as build,
  reconstructBojPolicyDecisionActionEvidenceV1 as reconstruct,
  prepareBojPolicyDecisionActionEvidenceV1 as prepare,
  type BojPolicyDecisionActionEvidenceV1,
} from "../../providers/boj/policyDecisionActionEvidence";
import { buildBojPolicyEvidenceV1 } from "../../providers/boj/canonical";
import { BojPolicyValidationError, parseBojPolicyDocumentV1 } from "../../providers/boj/facts";
import { captureTime as F, date, document, guideline } from "./fixtures";

function context(doc = document(), time = F) {
  return { document: doc, capture: { knownAt: time,
    evidence: structuredClone(buildBojPolicyEvidenceV1(parseBojPolicyDocumentV1(doc, /k240319a/.test(doc.url) ? "2024-03-19" : date), time)),
    decodedSourceDigest: "sha256:" + createHash("sha256").update(doc.html, "utf8").digest("hex") } };
}
function objects(value: unknown, visit: (object: object) => void): void {
  if (typeof value !== "object" || value === null) return;
  visit(value); for (const key of Reflect.ownKeys(value)) objects(Reflect.get(value, key), visit);
}

for (const [kind, decisionDate, target, expected] of [
  ["statement", date, "0", { shape: "scalar", value: 0, qualification: "around" }],
  ["guideline-change", date, "0.5", { shape: "scalar", value: 0.5, qualification: "around" }],
  ["guideline-change", date, "0.5 to 0.75", { shape: "range", lower: 0.5, upper: 0.75, qualification: "around" }],
  ["framework-transition", "2024-03-19", "0 to 0.1", { shape: "range", lower: 0, upper: 0.1, qualification: "around" }],
] as const) test("native action preserves " + kind + " " + target, () => {
  const input = context(document({ kind, date: decisionDate, target })); const child = build(input);
  assert.equal(child.schemaVersion, "boj-policy-decision-action-evidence-v1");
  assert.equal(child.parserVersion, "boj-policy-decision-source-action-parser-v1");
  assert.equal(child.semantic, "source-fact"); assert.equal(child.provider, "boj");
  assert.equal(child.productId, "eurjpy"); assert.equal(child.institution, "Bank of Japan");
  assert.equal(child.scope, "uncollateralized-overnight-call-rate-guideline");
  assert.equal(child.action, "set-guideline"); assert.equal(child.decisionDate, decisionDate);
  assert.equal(child.documentKind, kind); assert.equal(child.sourceUrl, input.document.url);
  assert.deepEqual(child.capture.evidence.fact.target, expected);
  assert.deepEqual(child.capture.evidence, input.capture.evidence);
  assert.deepEqual(reconstruct({ ...input, evidence: child }), child);
  assert.equal(child.knownAt, F); assert.equal(child.capture.evidence.metadata.fetchedAt, F);
  assert.equal(child.capture.decodedSourceDigest, input.capture.decodedSourceDigest);
  const forbidden = new Set(["raise", "lower", "maintain", "increase", "decrease", "unchanged", "direction", "delta",
    "predecessor", "midpoint", "representativeRate", "canonicalEventId", "html", "confidence", "tradeSignal"]);
  // Range endpoint 'lower' belongs solely to the legacy setting, never the action fields.
  for (const key of Object.keys(child)) assert.ok(!forbidden.has(key));
  objects(child, (object) => {
    for (const key of Reflect.ownKeys(object)) assert.ok(typeof key === "string" && (key === "lower" || !forbidden.has(key)));
  });
});

const valid = document();
for (const [label, html] of [
  ["missing explicit decision", valid.html.replace("to set the following guideline", "to describe the following guideline")],
  ["malformed set context", valid.html.replace("for the intermeeting period:", "at some other time:")],
  ["remain alone", valid.html.replace(/At the Monetary Policy Meeting[^<]+/, "")],
  ["title alone", valid.html.replace(guideline(), "The Bank published a guideline.")],
  ["duplicate selected guideline", valid.html.replace(guideline(), guideline() + "</p><p>" + guideline())],
  ["unrelated instrument", valid.html.replace("uncollateralized overnight call rate", "basic loan rate")],
  ["transition missing set", document({ kind: "framework-transition", date: "2024-03-19" }).html.replace("decided to set", "decided to describe")],
] as const) test("rejects " + label + " without minting action", () => {
  const input = context(); input.document.html = html;
  if (label.startsWith("transition")) {
    const transition = context(document({ kind: "framework-transition", date: "2024-03-19" }));
    transition.document.html = html;
    assert.throws(() => build(transition), (e) => e instanceof BojPolicyValidationError);
  } else assert.throws(() => build(input), (e) => e instanceof BojPolicyValidationError);
});

test("semantic identity is deterministic and excludes capture time and unrelated decoded text", () => {
  const input = context(); const child = build(input);
  const later = build(context(document(), F + 60));
  const unrelated = build(context({ ...document(), html: document().html.replace("Inflation 2 percent", "Inflation 3 percent") }));
  assert.deepEqual(build(input), child);
  assert.match(child.sourceVersionId, /^boj-policy-decision-action-evidence-v1:sha256:[a-f0-9]{64}$/);
  assert.equal(later.sourceVersionId, child.sourceVersionId); assert.notEqual(later.knownAt, child.knownAt);
  assert.equal(unrelated.sourceVersionId, child.sourceVersionId);
  assert.notEqual(unrelated.capture.decodedSourceDigest, child.capture.decodedSourceDigest);
  for (const other of [later, unrelated]) assert.equal(other.capture.evidence.metadata.sourceVersionId, input.capture.evidence.metadata.sourceVersionId);
  for (const target of ["0.75", "0.5 to 0.75"]) {
    const changed = build(context(document({ target })));
    assert.notEqual(changed.sourceVersionId, child.sourceVersionId);
    assert.notEqual(changed.capture.evidence.metadata.sourceVersionId, child.capture.evidence.metadata.sourceVersionId);
  }
  assert.match(child.capture.evidence.metadata.sourceVersionId, /^boj-policy-evidence-v2:sha256:/);
});

for (const [field, value] of [
  ["provider", "ecb"], ["productId", "eurusd"], ["institution", "Fake Bank"], ["scope", "deposit-facility"],
  ["decisionDate", "2025-01-25"], ["sourceUrl", "https://evil.example/decision"], ["documentKind", "statement"],
  ["action", "raise"], ["action", "lower"], ["action", "maintain"], ["action", "increase"], ["action", "decrease"], ["action", "unchanged"],
  ["semantic", "direction"], ["schemaVersion", "boj-policy-evidence-v1"], ["parserVersion", "forged-parser"],
  ["sourceVersionId", "boj-policy-decision-action-evidence-v1:sha256:" + "0".repeat(64)], ["knownAt", F - 60],
] as const) test("strict reconstruction rejects child " + field + " " + value, () => {
  const input = context(); const child = structuredClone(build(input)); Reflect.set(child, field, value);
  assert.throws(() => reconstruct({ ...input, evidence: child }), TypeError);
});

for (const [path, value] of [
  ["knownAt", F - 1], ["decodedSourceDigest", "sha256:" + "0".repeat(64)],
  ["evidence.fact.productId", "eurusd"], ["evidence.fact.institution", "Fake Bank"],
  ["evidence.fact.instrument", "deposit-facility"], ["evidence.fact.decisionDate", "2025-01-25"],
  ["evidence.fact.documentKind", "statement"], ["evidence.fact.sourceUrl", document().url + "?fake"],
  ["evidence.fact.target.value", 0.75], ["evidence.fact.target.qualification", "exact"],
  ["evidence.metadata.provider", "ecb"], ["evidence.metadata.originalPublisher", "Fake Bank"],
  ["evidence.metadata.fetchedAt", F - 1], ["evidence.metadata.sourceVersionId", "forged"],
] as const) test("rejects inconsistent captured " + path, () => {
  const input = context(); const evidence = structuredClone(build(input));
  const parts = path.split("."); let nested: object = input.capture;
  for (const key of parts.slice(0, -1)) nested = Reflect.get(nested, key);
  Reflect.set(nested, parts.at(-1)!, value);
  assert.throws(() => build(input));
  assert.throws(() => reconstruct({ ...context(), evidence: { ...evidence, capture: input.capture } }));
});

for (const path of ["", "capture", "capture.evidence", "capture.evidence.fact", "capture.evidence.fact.target",
  "capture.evidence.metadata", "capture.evidence.metadata.substitution", "document"]) {
  for (const mode of ["enumerable", "hidden", "symbol"] as const) test("original " + (path || "input") + " rejects " + mode + " extras", () => {
    const input = context(); let nested: object = input;
    if (path) for (const key of path.split(".")) nested = Reflect.get(nested, key);
    Object.defineProperty(nested, mode === "symbol" ? Symbol("extra") : "extra", { value: true, enumerable: mode === "enumerable" });
    assert.throws(() => build(input));
  });
}
for (const path of ["", "capture", "capture.evidence.fact.target", "capture.evidence.metadata"]) {
  for (const mode of ["enumerable", "hidden", "symbol"] as const) test("supplied child " + (path || "envelope") + " rejects " + mode + " extras", () => {
    const input = context(); const child = structuredClone(build(input)); let nested: object = child;
    if (path) for (const key of path.split(".")) nested = Reflect.get(nested, key);
    Object.defineProperty(nested, mode === "symbol" ? Symbol("extra") : "extra", { value: true, enumerable: mode === "enumerable" });
    assert.throws(() => reconstruct({ ...input, evidence: child }));
  });
}

test("source URL, HTML, selected setting and provenance must describe the same document", () => {
  const input = context();
  for (const url of [input.document.url.replace("https:", "http:"), input.document.url + "?query=1", input.document.url.replace("state_2025", "mpr_2025")]) {
    assert.throws(() => build({ ...input, document: { ...input.document, url } }));
  }
  const other = context(document({ target: "0.75" }));
  assert.throws(() => build({ document: other.document, capture: input.capture }));
  // Updating only the digest cannot reconcile a different selected setting.
  assert.throws(() => build({ document: other.document, capture: { ...input.capture, decodedSourceDigest: other.capture.decodedSourceDigest } }));
});

test("canonical reconstruction is detached and recursively frozen without freezing callers", () => {
  const input = context(); const child = build(input); const supplied = structuredClone(child);
  const reconstructed = reconstruct({ ...input, evidence: supplied });
  objects(child, (object) => assert.ok(Object.isFrozen(object)));
  objects(reconstructed, (object) => assert.ok(Object.isFrozen(object)));
  objects(input, (object) => assert.equal(Object.isFrozen(object), false));
  objects(supplied, (object) => assert.equal(Object.isFrozen(object), false));
  Reflect.set(input.capture.evidence.metadata, "fetchedAt", F - 1); Reflect.set(supplied, "knownAt", F - 1);
  assert.equal(child.knownAt, F); assert.equal(reconstructed.knownAt, F);
  assert.equal(child.capture.evidence.metadata.fetchedAt, F);
  assert.equal(Reflect.defineProperty(child, "action", { value: "raise" }), false);
});

for (const mode of ["enumerable", "hidden", "symbol"] as const) {
  test("preparation rejects document getter substitution with " + mode + " extras", () => {
    const clean = document(); const polluted = { ...clean }; let reads = 0;
    Object.defineProperty(polluted, mode === "symbol" ? Symbol("extra") : "extra",
      { value: true, enumerable: mode === "enumerable" });
    const input = { get document() { return ++reads <= 3 ? clean : polluted; }, decisionDate: date };
    let finish: ReturnType<typeof prepare> | undefined;
    assert.throws(() => { finish = prepare(input); }, /source data properties/);
    assert.equal(finish, undefined); assert.equal(reads, 0);
    assert.throws(() => prepare({ document: polluted, decisionDate: date }), /closed/);
  });
  for (const field of ["url", "html"] as const) {
    test("preparation rejects nested " + field + " accessor before " + mode + " mutation", () => {
      const clean = document(); const supplied = { ...clean }; let reads = 0;
      Object.defineProperty(supplied, field, { enumerable: true, get() {
        reads++;
        Object.defineProperty(supplied, mode === "symbol" ? Symbol("extra") : "extra",
          { value: true, enumerable: mode === "enumerable" });
        return clean[field];
      } });
      assert.throws(() => prepare({ document: supplied, decisionDate: date }), /source data properties/);
      assert.equal(reads, 0);
    });
  }
}

test("preparation rejects decisionDate accessor substitution without invoking it", () => {
  let reads = 0;
  const input = { document: document(), get decisionDate() { return ++reads === 1 ? date : "2025-01-25"; } };
  assert.throws(() => prepare(input), /source data properties/); assert.equal(reads, 0);
});

for (const field of ["document", "decisionDate", "url", "html"] as const) {
  test("preparation rejects source setter " + field + " without invoking it", () => {
    const input = { document: document(), decisionDate: date }; let writes = 0;
    const target = field === "document" || field === "decisionDate" ? input : input.document;
    Object.defineProperty(target, field, { enumerable: true, set() { writes++; } });
    assert.throws(() => prepare(input), /source data properties/); assert.equal(writes, 0);
  });
}

for (const location of ["input", "document"] as const) {
  test("preparation rejects " + location + " proxy before descriptor traps", () => {
    const input = { document: document(), decisionDate: date }; let traps = 0;
    const proxy = new Proxy(location === "input" ? input : input.document, {
      ownKeys() { traps++; throw new Error("source proxy inspected"); },
      getOwnPropertyDescriptor() { traps++; throw new Error("source proxy inspected"); },
    });
    if (location === "document") Reflect.set(input, "document", proxy);
    assert.throws(() => prepare((location === "input" ? proxy : input) as Parameters<typeof prepare>[0]), /source data properties/);
    assert.equal(traps, 0);
  });
}

test("preparation retains its own validated source; it confers only structural consistency", () => {
  const input = context(); const finish = prepare({ document: input.document, decisionDate: date });
  input.document.html = "fake";
  assert.deepEqual(finish(input.capture), build(context()));
  const earlier = context(document(), F - 60); const child: BojPolicyDecisionActionEvidenceV1 = build(earlier);
  assert.equal(child.knownAt, F - 60);
  assert.deepEqual(reconstruct({ ...earlier, evidence: child }), child);
});


function captureObject(capture: ReturnType<typeof context>["capture"], path: string): object {
  let nested: object = capture;
  if (path) for (const key of path.split(".")) nested = Reflect.get(nested, key);
  return nested;
}
function rejectsCompletion(input: ReturnType<typeof context>, rejected: RegExp): void {
  const finish = prepare({ document: input.document, decisionDate: date });
  let child: BojPolicyDecisionActionEvidenceV1 | undefined;
  assert.throws(() => { child = finish(input.capture); }, rejected);
  assert.equal(child, undefined);
}

for (const mode of ["enumerable", "hidden", "symbol"] as const) {
  test("completion rejects evidence getter substitution with " + mode + " extras", () => {
    const input = context(); const clean = input.capture.evidence; const polluted = structuredClone(clean); let reads = 0;
    Object.defineProperty(polluted, mode === "symbol" ? Symbol("extra") : "extra",
      { value: true, enumerable: mode === "enumerable" });
    Object.defineProperty(input.capture, "evidence", { enumerable: true,
      get() { return ++reads <= 2 ? clean : polluted; } });
    rejectsCompletion(input, /source data properties/); assert.equal(reads, 0);
    // Test the polluted object directly as well, before cloning could erase its extras.
    rejectsCompletion({ ...input, capture: { ...context().capture, evidence: polluted } }, /closed|source data properties/);
  });
  for (const path of ["evidence.metadata", "evidence.fact", "evidence.fact.target", "evidence.metadata.substitution"]) {
    test("completion rejects nested " + path + " getter before " + mode + " mutation", () => {
      const input = context(); const parts = path.split("."); const parent = captureObject(input.capture, parts.slice(0, -1).join("."));
      const key = parts.at(-1)!; const clean = Reflect.get(parent, key); const polluted = structuredClone(clean); let reads = 0;
      Object.defineProperty(polluted, mode === "symbol" ? Symbol("extra") : "extra",
        { value: true, enumerable: mode === "enumerable" });
      Object.defineProperty(parent, key, { enumerable: true, get() {
        reads++;
        Object.defineProperty(input.capture, mode === "symbol" ? Symbol("extra") : "extra",
          { value: true, enumerable: mode === "enumerable" });
        return reads === 1 ? clean : polluted;
      } });
      rejectsCompletion(input, /source data properties/); assert.equal(reads, 0);
    });
  }
}

for (const path of ["knownAt", "decodedSourceDigest", "evidence.fact.decisionDate", "evidence.fact.target.value",
  "evidence.metadata.fetchedAt", "evidence.metadata.substitution.status"]) {
  test("completion rejects scalar accessor " + path + " without invoking it", () => {
    const input = context(); const parts = path.split("."); const parent = captureObject(input.capture, parts.slice(0, -1).join("."));
    const key = parts.at(-1)!; const clean = Reflect.get(parent, key); let reads = 0;
    Object.defineProperty(parent, key, { enumerable: true, get() { reads++; return clean; } });
    rejectsCompletion(input, /source data properties/); assert.equal(reads, 0);
  });
}

for (const path of ["evidence", "evidence.metadata", "evidence.fact.target"]) {
  test("completion rejects setter " + path + " without invoking it", () => {
    const input = context(); const parts = path.split("."); const parent = captureObject(input.capture, parts.slice(0, -1).join("."));
    let writes = 0;
    Object.defineProperty(parent, parts.at(-1)!, { enumerable: true, set() { writes++; } });
    rejectsCompletion(input, /source data properties/); assert.equal(writes, 0);
  });
}

for (const path of ["", "evidence", "evidence.fact", "evidence.fact.target", "evidence.metadata",
  "evidence.metadata.substitution", "knownAt"]) {
  test("completion rejects " + (path || "capture") + " proxy before any traps", () => {
    const input = context(); const parts = path.split("."); const parent = captureObject(input.capture, parts.slice(0, -1).join("."));
    const key = parts.at(-1)!; let traps = 0;
    const proxy = new Proxy(path === "knownAt" ? {} : path ? Reflect.get(parent, key) : input.capture, {
      get() { traps++; throw new Error("capture proxy read"); },
      ownKeys() { traps++; throw new Error("capture proxy inspected"); },
      getOwnPropertyDescriptor() { traps++; throw new Error("capture proxy inspected"); },
      getPrototypeOf() { traps++; throw new Error("capture proxy inspected"); },
    });
    if (path) Reflect.set(parent, key, proxy); else input.capture = proxy;
    rejectsCompletion(input, /source data properties/); assert.equal(traps, 0);
  });
}

for (const path of ["evidence.fact.decisionDate", "evidence.fact.target.qualification", "evidence.metadata.fetchedAt"]) {
  test("completion rejects inherited accessor " + path + " before validation reads", () => {
    const input = context(); const parts = path.split("."); const parent = captureObject(input.capture, parts.slice(0, -1).join("."));
    const key = parts.at(-1)!; const clean = Reflect.get(parent, key); let reads = 0;
    Reflect.deleteProperty(parent, key);
    Object.setPrototypeOf(parent, { get [key]() { reads++; return clean; } });
    rejectsCompletion(input, /source data properties/); assert.equal(reads, 0);
  });
}

for (const entry of ["build", "reconstruct"] as const) {
  for (const field of entry === "build" ? ["document", "capture"] : ["document", "capture", "evidence"]) {
    test(entry + " rejects original " + field + " accessor before reading caller fields", () => {
      const input = entry === "build" ? context() : { ...context(), evidence: build(context()) };
      const clean = Reflect.get(input, field); let reads = 0;
      Object.defineProperty(input, field, { enumerable: true, get() { reads++; return clean; } });
      let child: BojPolicyDecisionActionEvidenceV1 | undefined;
      assert.throws(() => { child = entry === "build" ? build(input) : reconstruct(input as Parameters<typeof reconstruct>[0]); }, /source data properties/);
      assert.equal(child, undefined); assert.equal(reads, 0);
    });
  }
}

for (const field of ["action", "capture"] as const) {
  test("reconstruct rejects supplied child " + field + " accessor without invoking it", () => {
    const input = context(); const supplied = structuredClone(build(input)); const clean = supplied[field]; let reads = 0;
    Object.defineProperty(supplied, field, { enumerable: true, get() { reads++; return clean; } });
    let child: BojPolicyDecisionActionEvidenceV1 | undefined;
    assert.throws(() => { child = reconstruct({ ...input, evidence: supplied }); }, /source data properties/);
    assert.equal(child, undefined); assert.equal(reads, 0);
  });
}

test("completion rejects a proxy prototype before inherited descriptor traps", () => {
  const input = context(); let traps = 0;
  const prototype = new Proxy({}, {
    get() { traps++; throw new Error("prototype proxy read"); },
    ownKeys() { traps++; throw new Error("prototype proxy inspected"); },
    getOwnPropertyDescriptor() { traps++; throw new Error("prototype proxy inspected"); },
    getPrototypeOf() { traps++; throw new Error("prototype proxy inspected"); },
  });
  Object.setPrototypeOf(input.capture.evidence.fact.target, prototype);
  rejectsCompletion(input, /source data properties/); assert.equal(traps, 0);
});

test("completion validates all original capture extras before detachment", () => {
  for (const path of ["", "evidence", "evidence.fact", "evidence.fact.target", "evidence.metadata", "evidence.metadata.substitution"]) {
    for (const mode of ["enumerable", "hidden", "symbol"] as const) {
      const input = context();
      Object.defineProperty(captureObject(input.capture, path), mode === "symbol" ? Symbol("extra") : "extra",
        { value: true, enumerable: mode === "enumerable" });
      rejectsCompletion(input, /closed|source data properties|validation failed|canonical source reconstruction/);
    }
  }
});

for (const mode of ["frozen", "null-prototype-envelope", "custom-prototype-envelope"] as const) {
  test("completion accepts legitimate " + mode + " data with identical evidence", () => {
    const input = context(); const expected = build(input);
    if (mode === "frozen") objects(input.capture, (nested) => Object.freeze(nested));
    else Object.setPrototypeOf(input.capture, mode === "null-prototype-envelope" ? null : { label: "caller capture" });
    const child = prepare({ document: input.document, decisionDate: date })(input.capture);
    assert.deepEqual(child, expected); assert.equal(JSON.stringify(child), JSON.stringify(expected));
    assert.deepEqual(reconstruct({ ...input, evidence: child }), expected);
  });
}
