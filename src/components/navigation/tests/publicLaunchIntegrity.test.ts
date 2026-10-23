import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Header from "../Header";
import Footer from "../Footer";
import { FOOTER_NAV_GROUPS_V1, PUBLIC_PRIMARY_NAV_V1, PUBLIC_ACCOUNT_NAV_V1 } from "../../../config/institutionalNavigation";

test("public navigation points to retained publication, account and legal routes", () => {
  const links = [...PUBLIC_PRIMARY_NAV_V1, ...PUBLIC_ACCOUNT_NAV_V1, ...FOOTER_NAV_GROUPS_V1.flatMap<{ readonly label: string; readonly href: string }>(group => group.links)];
  for (const { href } of links) {
    assert.doesNotMatch(href, /^\/(?:markets|vip|pricing|premium|products|sponsors)(?:\/|$)/);
    assert.ok(existsSync(`src/app/(site)${href === "/" ? "" : href}/page.tsx`) || href === "/newsletter", href);
  }
  const html = renderToStaticMarkup(createElement(Header)) + renderToStaticMarkup(createElement(Footer));
  assert.match(html, /href="\/reports"/);
  assert.match(html, /href="\/newsletter"/);
  assert.match(html, /href="\/disclaimer"/);
  assert.doesNotMatch(html, /Free Lite|five.market|VIP|EUR\/USD/);
});
