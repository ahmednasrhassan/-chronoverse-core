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

test("public newsletter components hide admission until its readiness gate passes", () => {
  for (const Component of [NewsletterForm, NewsletterPage]) {
    const html = renderToStaticMarkup(createElement(Component));
    if (NEWSLETTER_SIGNUPS_PAUSED) {
      assert.match(html, /Newsletter signups are temporarily paused/);
      assert.doesNotMatch(html, /execute-api/); assert.match(html, /href="\/reports"/);
    } else {
      assert.match(html, /Request confirmation email/);
      assert.doesNotMatch(html, /Newsletter signups are temporarily paused/);
    }
    if (NEWSLETTER_SIGNUPS_PAUSED) assert.doesNotMatch(html, /<form|<input/);
    assert.doesNotMatch(html, /You're subscribed/);
  }
  assert.match(metadata.description, NEWSLETTER_SIGNUPS_PAUSED ? /signups and delivery are temporarily paused/ : /Subscribe/);
});

test("prepared form requires explicit unchecked consent and explains confirmation", () => {
  const html = renderToStaticMarkup(createElement(AwsNewsletterRegistration));
  assert.match(html, /type="email"/); assert.match(html, /type="checkbox"/);
  assert.match(html, /required=""/); assert.doesNotMatch(html, /checked=""/);
  assert.match(html, /Request confirmation email/); assert.match(html, /only after you confirm/);
  assert.match(html, /privacy-policy/); assert.match(html, /focus-visible/);
  assert.doesNotMatch(html, /execute-api|target="_blank"/);
});

test("website signup components have no credentials, private bridge or browser storage", () => {
  for (const path of ["src/components/NewsLetterForm.tsx", "src/components/AwsNewsletterRegistration.tsx", "src/app/newsletter/page.tsx"]) {
    assert.doesNotMatch(readFileSync(path, "utf8"), /localStorage|sessionStorage|process\.env|NEWSLETTER_AWS_BRIDGE_KEY|secretAccessKey|awsCredentialsProvider/);
  }
});
