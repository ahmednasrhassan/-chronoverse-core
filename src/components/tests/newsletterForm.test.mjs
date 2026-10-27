import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
const require = createRequire(import.meta.url);
const { default: NewsletterForm } = require("../NewsLetterForm.tsx");
const { default: NewsletterPage } = require("../../app/newsletter/page.tsx");
const { AwsNewsletterRegistration } = require("../AwsNewsletterRegistration.tsx");
const { metadata } = require("../../app/newsletter/layout.tsx");
const { NEWSLETTER_SIGNUPS_PAUSED } = require("../../config/newsletterAvailability.ts");

test("public newsletter components hide the AWS signup link until its readiness gate passes", () => {
  for (const Component of [NewsletterForm, NewsletterPage]) {
    const html = renderToStaticMarkup(createElement(Component));
    if (NEWSLETTER_SIGNUPS_PAUSED) {
      assert.match(html, /Newsletter signups are temporarily paused/);
      assert.doesNotMatch(html, /execute-api/); assert.match(html, /href="\/reports"/);
    } else {
      assert.match(html, /href="https:\/\/lh71lvbqi8.execute-api.eu-north-1.amazonaws.com\/register"/);
      assert.doesNotMatch(html, /Newsletter signups are temporarily paused/);
    }
    assert.doesNotMatch(html, /<form|<input|You're subscribed/);
  }
  assert.match(metadata.description, NEWSLETTER_SIGNUPS_PAUSED ? /signups and delivery are temporarily paused/ : /Subscribe/);
});

test("prepared AWS-only signup component has one accessible external link and collects no address", () => {
  const html = renderToStaticMarkup(createElement(AwsNewsletterRegistration));
  assert.match(html, /href="https:\/\/lh71lvbqi8.execute-api.eu-north-1.amazonaws.com\/register"/);
  assert.match(html, /Subscribe/);
  assert.match(html, /referrerPolicy="no-referrer"/i);
  assert.match(html, /confirmation email is required/); assert.match(html, /only after you confirm/);
  assert.match(html, /privacy-policy/); assert.match(html, /focus-visible/);
  assert.doesNotMatch(html, /<form|<input|<button|target="_blank"/);
});

test("website signup components have no bridge, subscriber fetch, state, credentials or browser storage", () => {
  for (const path of ["src/components/NewsLetterForm.tsx", "src/components/AwsNewsletterRegistration.tsx", "src/app/newsletter/page.tsx"]) {
    assert.doesNotMatch(readFileSync(path, "utf8"), /fetch\(|useState|useEffect|localStorage|sessionStorage|process\.env|NEWSLETTER_AWS_BRIDGE_KEY|onSubmit/);
  }
});
