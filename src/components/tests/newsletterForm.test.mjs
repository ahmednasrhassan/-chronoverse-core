import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
const require = createRequire(import.meta.url);
const { default: NewsletterForm } = require("../NewsLetterForm.tsx");
const { default: NewsletterPage } = require("../../app/newsletter/page.tsx");
const { AwsNewsletterRegistration } = require("../AwsNewsletterRegistration.tsx");
const { default: NewsletterLayout, metadata } = require("../../app/newsletter/layout.tsx");
const { NEWSLETTER_SIGNUPS_PAUSED, NEWSLETTER_SIGNUP_PAUSE_MESSAGE } = require("../../config/newsletterAvailability.ts");
const { CONSENT_TEXT } = require("../../config/newsletterConsent.ts");
const { JSDOM } = createRequire(require.resolve("isomorphic-dompurify"))("jsdom");

test("public newsletter components hide admission until its readiness gate passes", () => {
  assert.equal(NEWSLETTER_SIGNUPS_PAUSED, true, "This release must remain paused");
  for (const Component of [NewsletterForm, NewsletterPage, AwsNewsletterRegistration]) {
    const html = renderToStaticMarkup(createElement(Component));
    if (NEWSLETTER_SIGNUPS_PAUSED) {
      assert.ok(html.includes(NEWSLETTER_SIGNUP_PAUSE_MESSAGE));
      assert.doesNotMatch(html, /execute-api/); assert.match(html, /href="\/reports"/);
      assert.match(html, /<button[^>]+disabled=""[^>]*>Subscribe<\/button>/);
    } else {
      assert.match(html, />Subscribe<\/button>/);
      assert.ok(!html.includes(NEWSLETTER_SIGNUP_PAUSE_MESSAGE));
    }
    if (NEWSLETTER_SIGNUPS_PAUSED) assert.doesNotMatch(html, /<form|<input/);
    assert.doesNotMatch(html, /You're subscribed/);
  }
  assert.match(metadata.description, /subscriptions are temporarily unavailable/);
});

test("prepared form requires explicit unchecked consent and explains confirmation", () => {
  // Only this offline VM substitutes the pause. Production has no override prop.
  const { Component } = readinessForm(async () => { throw new Error("No transport expected"); });
  const html = renderToStaticMarkup(createElement(Component));
  assert.match(html, /type="email"/); assert.match(html, /type="checkbox"/);
  assert.match(html, /required=""/); assert.doesNotMatch(html, /checked=""/);
  assert.match(html, />Subscribe<\/button>/); assert.match(html, /only after you confirm/);
  assert.match(html, /placeholder="you@example.com"/);
  assert.ok(html.includes(CONSENT_TEXT));
  assert.match(html, /role="alert"/); assert.match(html, /role="status"/);
  assert.match(html, /privacy-policy/); assert.match(html, /focus-visible/);
  assert.doesNotMatch(html, /execute-api|target="_blank"/);
});

test("newsletter route uses the existing site shell and explains secure management without a public unsubscribe URL", () => {
  const html = renderToStaticMarkup(createElement(NewsletterLayout, null, createElement(NewsletterPage)));
  assert.match(html, /<h1[^>]*>Chronoverse Capital Weekly<\/h1>/);
  assert.match(html, /Independent research and market insights, delivered to your inbox/);
  assert.equal((html.match(/<main\b/g) || []).length, 1);
  assert.match(html, /Skip to content/); assert.match(html, /<footer/);
  assert.match(html, /Primary navigation/); assert.match(html, /href="\/privacy-policy"/);
  assert.match(html, /secure links in their emails/);
  assert.doesNotMatch(html, /href="[^\"]*(?:\/unsubscribe|execute-api)/);
  assert.match(html, /lg:grid-cols-2/);
});

// Compile the actual client component, replacing configuration and transport only
// inside this offline test. No application export or environment flag can unpause it.
function readinessForm(transport) {
  const availability = { NEWSLETTER_SIGNUPS_PAUSED: false, NEWSLETTER_SIGNUP_PAUSE_MESSAGE };
  const filename = new URL("../AwsNewsletterRegistration.tsx", import.meta.url);
  const localRequire = createRequire(filename);
  const compiled = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const componentModule = { exports: {} };
  vm.runInNewContext(compiled, {
    module: componentModule, exports: componentModule.exports,
    require(id) {
      if (id === "@/config/newsletterAvailability") return availability;
      if (id === "@/config/newsletterConsent") return require("../../config/newsletterConsent.ts");
      if (id === "next/link") return "a";
      return localRequire(id);
    },
    fetch: transport, AbortSignal,
    get FormData() { return globalThis.FormData; },
  });
  return { Component: componentModule.exports.AwsNewsletterRegistration, availability };
}

async function withForm(transport, run) {
  const dom = new JSDOM('<div id="root"></div>', { url: "https://offline.invalid" });
  const keys = ["window", "document", "FormData", "IS_REACT_ACT_ENVIRONMENT"];
  const prior = keys.map(key => Object.getOwnPropertyDescriptor(globalThis, key));
  Object.assign(globalThis, { window: dom.window, document: dom.window.document,
    FormData: dom.window.FormData, IS_REACT_ACT_ENVIRONMENT: true });
  const fixture = readinessForm(transport);
  const container = document.getElementById("root"), root = createRoot(container);
  try {
    await act(async () => root.render(createElement(fixture.Component)));
    const form = container.querySelector("form"), email = container.querySelector('[name="email"]'), consent = container.querySelector('[name="consent"]');
    const submit = () => form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
    await run({ ...fixture, container, form, email, consent, submit });
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    keys.forEach((key, i) => prior[i] ? Object.defineProperty(globalThis, key, prior[i]) : delete globalThis[key]);
  }
}

test("invalid input and missing consent send nothing; a valid attempt locks duplicate submission and requires confirmation", async () => {
  const calls = [];
  let finish;
  await withForm((url, options) => { calls.push({ url, options }); return new Promise(resolve => { finish = resolve; }); }, async f => {
    f.email.value = "invalid";
    await act(async () => f.submit());
    assert.equal(calls.length, 0);
    assert.match(f.container.querySelector('[role="alert"]').textContent, /valid email/);
    f.email.value = "reader@example.test";
    await act(async () => f.submit());
    assert.equal(calls.length, 0);
    f.consent.checked = true;
    await act(async () => { f.submit(); f.submit(); });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "/api/newsletter");
    const body = JSON.parse(calls[0].options.body);
    assert.equal(body.consent, true); assert.equal(body.consentText, CONSENT_TEXT);
    assert.equal(f.form.getAttribute("aria-busy"), "true");
    assert.equal(f.container.querySelector("button").disabled, true);
    assert.match(f.container.querySelector('[role="status"]').textContent, /Submitting/);
    await act(async () => finish(new Response(null, { status: 202 })));
    assert.equal(f.container.querySelector('[role="status"]').textContent, "If your email is eligible, check your inbox for a confirmation link.");
    assert.doesNotMatch(f.container.textContent, /You're subscribed|subscription is confirmed/);
    await act(async () => f.submit());
    assert.equal(calls.length, 1);
  });
});

test("unavailable, rejected and uncertain outcomes remain generic and never retry", async () => {
  for (const outcome of ["paused", "rejected", "uncertain"]) {
    let calls = 0;
    await withForm(async () => {
      calls++;
      if (outcome === "uncertain") throw new Error("PRIVATE_PROVIDER_MESSAGE");
      return Response.json({ code: outcome === "paused" ? "registration_paused" : "PRIVATE_PROVIDER_MESSAGE" }, { status: outcome === "paused" ? 503 : 400 });
    }, async f => {
      f.email.value = "reader@example.test"; f.consent.checked = true;
      await act(async () => f.submit());
      const text = f.container.querySelector('[role="status"]').textContent;
      assert.ok(text.includes(outcome === "paused" ? NEWSLETTER_SIGNUP_PAUSE_MESSAGE : "Please do not submit again"));
      assert.doesNotMatch(f.container.textContent, /PRIVATE_PROVIDER_MESSAGE|reader@example/);
      await act(async () => f.submit());
      assert.equal(calls, 1); assert.equal(f.container.querySelector("button").disabled, true);
    });
  }
});

test("a stale form cannot submit when the pause is closed before its handler runs", async () => {
  let calls = 0;
  await withForm(async () => { calls++; return new Response(null, { status: 202 }); }, async f => {
    f.email.value = "reader@example.test"; f.consent.checked = true;
    f.availability.NEWSLETTER_SIGNUPS_PAUSED = true;
    await act(async () => f.submit());
    assert.equal(calls, 0);
  });
});

test("website signup components have no credentials, private bridge or browser storage", () => {
  for (const path of ["src/components/NewsLetterForm.tsx", "src/components/AwsNewsletterRegistration.tsx", "src/app/newsletter/page.tsx"]) {
    assert.doesNotMatch(readFileSync(path, "utf8"), /localStorage|sessionStorage|process\.env|NEWSLETTER_AWS_BRIDGE_KEY|secretAccessKey|awsCredentialsProvider/);
  }
});
