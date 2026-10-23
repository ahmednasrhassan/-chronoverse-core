import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { act, createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// Reuse the DOM implementation already installed for content sanitization.
const { JSDOM } = createRequire(import.meta.resolve("isomorphic-dompurify"))("jsdom");
const require = createRequire(import.meta.url);
const { default: NewsletterForm, ActiveNewsletterForm } = require("../NewsLetterForm.tsx");
const { default: NewsletterPage } = require("../../app/newsletter/page.tsx");
const { metadata } = require("../../app/newsletter/layout.tsx");

test("public newsletter signup stays paused and retained forms preserve persistence feedback", async (t) => {
  const dom = new JSDOM("<div id='root'></div>", { url: "https://chronoversecapital.com/newsletter" });
  const originals = new Map();
  for (const [key, value] of Object.entries({
    window: dom.window, self: dom.window, document: dom.window.document, navigator: dom.window.navigator,
    IS_REACT_ACT_ENVIRONMENT: true,
  })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  }
  const originalFetch = globalThis.fetch;
  const { createRoot } = await import("react-dom/client");
  try {
    for (const Component of [NewsletterForm, NewsletterPage]) {
      await t.test(`${Component.name}: public signup is paused in server and browser rendering`, async () => {
        let requests = 0;
        globalThis.fetch = async () => { requests++; throw new Error("Paused signup must not make requests"); };
        const html = renderToStaticMarkup(createElement(Component));
        assert.match(html, /Newsletter signups are temporarily paused/);
        assert.doesNotMatch(html, /<form|<input|Direct to Your Inbox|You're subscribed/);
        const container = dom.window.document.getElementById("root");
        const root = createRoot(container);
        try {
          await act(async () => { root.render(createElement(Component)); });
          assert.match(container.textContent, /Newsletter delivery is currently suspended/);
          assert.equal(container.querySelector("form, input, button[type=submit]"), null);
          assert.equal(container.querySelector('a[href="/reports"]').textContent, "Read published research");
          assert.equal(requests, 0);
        } finally { await act(async () => { root.unmount(); }); }
      });
    }
    assert.match(metadata.description, /signups and delivery are temporarily paused/);
    assert.doesNotMatch(metadata.description, /Subscribe to receive/);
    // Keep the preserved form's persistence/feedback regressions for a future
    // reviewed reactivation, without reopening either public component.
    for (const Component of [ActiveNewsletterForm]) {
      for (const result of ["success", "service-error", "invalid-success", "non-json", "network-error"]) {
        await t.test(`${Component.name}: ${result}`, async () => {
          const container = dom.window.document.getElementById("root");
          const root = createRoot(container);
          try {
            await act(async () => { root.render(createElement(Component)); });
            const input = container.querySelector("input[type=email]");
            const form = container.querySelector("form");
            const button = container.querySelector("button[type=submit]");
            let complete;
            let requests = 0;
            globalThis.fetch = async (url, options) => {
              requests += 1;
              assert.equal(url, "/api/newsletter");
              assert.equal(options.method, "POST");
              assert.deepEqual(JSON.parse(options.body), { email: "Reader@Example.Test" });
              return new Promise((resolve, reject) => {
                complete = () => {
                  if (result === "network-error") reject(new Error("offline"));
                  else if (result === "non-json") resolve(new Response("unavailable", { status: 502 }));
                  else resolve(Response.json(
                    result === "success" ? { status: "success" } : result === "invalid-success" ? {} : { status: "error" },
                    { status: result === "service-error" ? 503 : 200 },
                  ));
                };
              });
            };
            await act(async () => {
              const setValue = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value").set;
              setValue.call(input, "Reader@Example.Test");
              input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
            });
            await act(async () => { form.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true })); });
            assert.equal(requests, 1);
            assert.equal(button.disabled, true);
            assert.doesNotMatch(container.textContent, /You're subscribed/);
            await act(async () => { form.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true })); });
            assert.equal(requests, 1, "loading form suppresses repeated submissions");
            await act(async () => { complete(); });
            assert.equal(button.disabled, false);
            const feedback = container.querySelector('[role="status"]');
            assert.ok(feedback);
            assert.equal(feedback.getAttribute("aria-live"), "polite");
            if (result === "success") {
              assert.match(feedback.textContent, /You're subscribed/);
              assert.equal(input.value, "");
            } else {
              assert.match(feedback.textContent, /could not be completed|Network error/);
              assert.doesNotMatch(feedback.textContent, /You're subscribed/);
              assert.equal(input.value, "Reader@Example.Test");
            }
          } finally { await act(async () => { root.unmount(); }); }
        });
      }
    }
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
    dom.window.close();
  }
});
