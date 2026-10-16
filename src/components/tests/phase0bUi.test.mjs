import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import vm from "node:vm";
import React, { act } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url);
// Use the already installed jsdom dependency of the project's sanitizer.
const { JSDOM } = createRequire(require.resolve("isomorphic-dompurify"))("jsdom");
const h = React.createElement;

// Match the repository's offline component harnesses: compile the real component,
// using React DOM while replacing only Next routing/lazy-loading boundaries.
function loadComponent(name, dynamicComponent) {
  const filename = new URL(`../${name}.tsx`, import.meta.url);
  const source = readFileSync(filename, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  }).outputText;
  const componentModule = { exports: {} };
  vm.runInNewContext(compiled, {
    module: componentModule,
    exports: componentModule.exports,
    require(id) {
      if (id === "next/link") return "a";
      if (id === "next/dynamic") return (_loader, options) => {
        assert.equal(options.ssr, false);
        return dynamicComponent;
      };
      return require(id);
    },
    get window() { return globalThis.window; },
    get document() { return globalThis.document; },
    get localStorage() { return globalThis.localStorage; },
    setTimeout: (...args) => globalThis.setTimeout(...args),
    clearTimeout: (...args) => globalThis.clearTimeout(...args),
  });
  return componentModule.exports.default;
}

const CookieConsent = loadComponent("cookiesconsent");
const CookieConsentWrapper = loadComponent("CookieConsentWrapper", CookieConsent);
const AutoTOC = loadComponent("autotoc");
const Summary = loadComponent("AIExecutiveSummary");

async function inDom(run, { storage = {}, blocked = false, article = "" } = {}) {
  // jsdom leaves external resources disabled; no URL is fetched.
  const dom = new JSDOM(`${article}<div id="root"></div>`, { url: "https://offline.invalid" });
  const keys = ["window", "document", "localStorage", "IS_REACT_ACT_ENVIRONMENT"];
  const previous = keys.map(key => Object.getOwnPropertyDescriptor(globalThis, key));
  const values = new Map(Object.entries(storage));
  const calls = [];
  let loads = 0;
  let reads = 0;
  const syntheticStorage = {
    getItem(key) { reads++; if (blocked) throw new Error("Storage blocked"); return values.get(key) ?? null; },
    setItem(key, value) { if (blocked) throw new Error("Storage blocked"); values.set(key, value); },
  };
  Object.assign(globalThis, {
    window: dom.window, document: dom.window.document,
    localStorage: syntheticStorage, IS_REACT_ACT_ENVIRONMENT: true,
  });
  window.gtag = (...args) => calls.push(JSON.parse(JSON.stringify(args)));
  window.loadChronoverseAnalytics = () => { loads++; };
  const roots = [];
  const container = document.getElementById("root");
  const errors = [];
  const fixture = {
    container, values, calls, errors,
    get loads() { return loads; },
    get reads() { return reads; },
    async mount(Component, props = {}, hydrate = false) {
      const element = h(React.StrictMode, null, h(Component, props));
      if (hydrate) container.innerHTML = renderToString(element);
      let root;
      await act(async () => {
        root = hydrate
          ? hydrateRoot(container, element, { onRecoverableError: error => errors.push(error) })
          : createRoot(container);
        roots.push(root);
        if (!hydrate) root.render(element);
      });
      return root;
    },
    async click(text) {
      const button = [...container.querySelectorAll("button")].find(item => item.textContent.trim() === text);
      assert.ok(button, `Missing button: ${text}`);
      await act(async () => button.click());
    },
  };
  try {
    await run(fixture);
    assert.deepEqual(errors, [], "No hydration recovery errors");
  } finally {
    await act(async () => roots.forEach(root => root.unmount()));
    dom.window.close();
    keys.forEach((key, index) => {
      if (previous[index]) Object.defineProperty(globalThis, key, previous[index]);
      else delete globalThis[key];
    });
  }
}

test("server snapshots remain hidden/reserved without storage reads or DOM mutation", async () => {
  await inDom(f => {
    assert.equal(renderToString(h(CookieConsent)), "");
    assert.equal(renderToString(h(CookieConsentWrapper)), "");
    assert.match(renderToString(h(AutoTOC)), /min-h-\[140px\]/);
    assert.equal(document.querySelector("h2").id, "");
    assert.equal(f.reads, 0);
    assert.equal(f.loads, 0);
  }, { article: "<article><h2>Heading</h2></article>", blocked: true });
});

for (const [name, storage, visible, blocked] of [
  ["missing", {}, true, false],
  ["legacy denied", { cookie_consent: "denied" }, false, false],
  ["legacy granted", { cookie_consent: "granted" }, false, false],
  ["detailed denied", { chrono_cookie_consent: '{"analytics":false}' }, false, false],
  ["detailed granted", { chrono_cookie_consent: '{"analytics":true}' }, false, false],
  ["truthy malformed record", { chrono_cookie_consent: "invalid" }, false, false],
  ["empty primary with legacy denial", { chrono_cookie_consent: "", cookie_consent: "denied" }, false, false],
  ["blocked storage", {}, true, true],
]) {
  test(`consent hydration: ${name}; mounting never enables analytics`, async () => {
    await inDom(async f => {
      await f.mount(CookieConsent, {}, true);
      assert.equal(f.container.textContent.includes("Privacy & Cookie Preferences"), visible);
      assert.deepEqual(f.calls, []);
      assert.equal(f.loads, 0);
    }, { storage, blocked });
  });
}

for (const [choice, analytics, blocked] of [
  ["Accept Analytics", true, false],
  ["Essential Only", false, false],
  ["save default", false, false],
  ["save enabled", true, false],
  ["Accept Analytics", true, true],
  ["Essential Only", false, true],
]) {
  test(`explicit consent: ${choice}, storage blocked=${blocked}`, async () => {
    await inDom(async f => {
      await f.mount(CookieConsent);
      assert.equal(f.loads, 0);
      if (choice.startsWith("save")) {
        await f.click("Preferences");
        assert.equal(f.container.querySelector("input").checked, false);
        assert.equal(f.loads, 0);
        if (analytics) await act(async () => f.container.querySelector("input").click());
        assert.equal(f.loads, 0, "Changing the checkbox alone must not load analytics");
        await f.click("Save Preferences");
      } else await f.click(choice);
      assert.equal(f.container.innerHTML, "");
      assert.equal(f.loads, analytics ? 1 : 0);
      assert.deepEqual(f.calls, [["consent", "update", {
        analytics_storage: analytics ? "granted" : "denied",
        ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied",
      }]]);
      if (!blocked) {
        assert.deepEqual(JSON.parse(f.values.get("chrono_cookie_consent")), {
          necessary: true, analytics, marketing: false,
        });
        assert.equal(f.values.get("cookie_consent"), analytics ? "granted" : "denied");
      }
    }, { blocked });
  });
}

async function withDeferredTimer(run) {
  const originalSet = globalThis.setTimeout;
  const originalClear = globalThis.clearTimeout;
  const pending = new Map();
  globalThis.setTimeout = (callback, delay, ...args) => {
    if (delay !== 4000) return originalSet(callback, delay, ...args);
    const id = {};
    pending.set(id, callback);
    return id;
  };
  globalThis.clearTimeout = id => pending.delete(id) || originalClear(id);
  try { await run(pending); }
  finally { globalThis.setTimeout = originalSet; globalThis.clearTimeout = originalClear; }
}

for (const trigger of ["scroll", "pointerdown", "keydown", "timer"]) {
  test(`wrapper preserves deferred mount: ${trigger}`, async () => {
    await withDeferredTimer(async pending => {
      await inDom(async f => {
        const listeners = new Map();
        const add = window.addEventListener.bind(window);
        const remove = window.removeEventListener.bind(window);
        window.addEventListener = (name, callback, options) => {
          if (["scroll", "pointerdown", "keydown"].includes(name)) listeners.set(name, callback);
          add(name, callback, options);
        };
        window.removeEventListener = (name, callback, options) => {
          if (listeners.get(name) === callback) listeners.delete(name);
          remove(name, callback, options);
        };
        const root = await f.mount(CookieConsentWrapper, {}, true);
        assert.equal(f.container.innerHTML, "");
        assert.equal(pending.size, 1);
        assert.equal(f.loads, 0);
        await act(async () => {
          if (trigger === "timer") [...pending.values()][0]();
          else window.dispatchEvent(new window.Event(trigger));
        });
        assert.match(f.container.textContent, /Privacy & Cookie Preferences/);
        assert.equal(f.loads, 0);
        await act(async () => root.unmount());
        assert.equal(pending.size, 0);
        assert.equal(listeners.size, 0);
      });
    });
  });
}

test("answered consent never schedules the banner; deferred mount rechecks storage", async () => {
  await withDeferredTimer(async pending => {
    await inDom(async f => {
      await f.mount(CookieConsentWrapper);
      assert.equal(pending.size, 0);
      assert.equal(f.container.innerHTML, "");
    }, { storage: { cookie_consent: "denied" } });
    await inDom(async f => {
      await f.mount(CookieConsentWrapper);
      f.values.set("cookie_consent", "denied");
      await act(async () => window.dispatchEvent(new window.Event("pointerdown")));
      assert.equal(f.container.innerHTML, "");
      assert.equal(f.loads, 0);
    });
  });
});

test("blocked storage retains the deferred banner", async () => {
  await withDeferredTimer(async () => {
    await inDom(async f => {
      await f.mount(CookieConsentWrapper);
      assert.equal(f.container.innerHTML, "");
      await act(async () => window.dispatchEvent(new window.Event("keydown")));
      assert.match(f.container.textContent, /Privacy & Cookie Preferences/);
      assert.equal(f.loads, 0);
    }, { blocked: true });
  });
});

test("TOC hydration preserves IDs, Unicode slugs, levels, and mount-only discovery", async () => {
  await inDom(async f => {
    const root = await f.mount(AutoTOC, {}, true);
    assert.deepEqual([...f.container.querySelectorAll("a")].map(a => a.getAttribute("href")),
      ["#existing", "#euro-rates", "#heading-3", "#أسعار"]);
    assert.match(f.container.querySelectorAll("li")[1].className, /pl-8/);
    document.querySelector("article").insertAdjacentHTML("beforeend", "<h2>Later heading</h2>");
    await act(async () => root.render(h(React.StrictMode, null, h(AutoTOC))));
    assert.equal(f.container.querySelectorAll("a").length, 4);
  }, { article: '<article><h2 id="existing">Existing</h2><h3>Euro Rates!</h3><h2>!!!</h2><h2>أسعار</h2></article>' });
});

for (const article of ["", "<article><p>No headings</p></article>"]) {
  test(`TOC removes its skeleton when there are no headings: ${article || "no article"}`, async () => {
    await inDom(async f => {
      await f.mount(AutoTOC, {}, true);
      assert.equal(f.container.innerHTML, "");
    }, { article });
  });
}

test("summary retains source cleanup, escaping, three-point cap, and collapse control", async () => {
  await inDom(async f => {
    await f.mount(Summary, { points: [
      null, 42, {}, { children: [null, 7, { text: "First" }, { text: 4 }, { text: "passage" }] },
      '["Second", {"text":"passage"}]', "<script>third</script>", "Excluded fourth",
    ] });
    assert.deepEqual([...f.container.querySelectorAll("li > span:last-child")].map(node => node.textContent),
      ["First passage", "Second passage", "<script>third</script>"]);
    assert.equal(f.container.querySelector("script"), null);
    const button = f.container.querySelector("button");
    await act(async () => button.click());
    assert.equal(button.getAttribute("aria-expanded"), "false");
    await act(async () => button.click());
    assert.equal(button.getAttribute("aria-expanded"), "true");
  });
  assert.equal(renderToString(h(Summary, { points: [false, {}, 1, null] })), "");
  assert.match(renderToString(h(Summary, { points: ["{invalid}"] })), /\{invalid\}/);
});
