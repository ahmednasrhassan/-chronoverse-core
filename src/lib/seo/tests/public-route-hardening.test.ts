import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import nextConfig from "../../../../next.config";

async function main(): Promise<void> {
  const redirects = await nextConfig.redirects?.();
  assert.ok(redirects);
  assert.deepEqual(
    redirects.filter((redirect) => redirect.source === "/research"),
    [
      {
        source: "/research",
        destination: "/reports",
        permanent: true,
      },
    ],
    "/research must have exactly one permanent canonical redirect",
  );

  const llms = readFileSync(path.join(process.cwd(), "public/llms.txt"), "utf8");
  assert.match(llms, /^# Chronoverse Capital/m);
  assert.match(llms, /https:\/\/chronoversecapital\.com/);
  for (const route of [
    "/markets",
    "/pricing",
    "/reports",
    "/methodology",
    "/data-sources",
    "/freshness",
    "/about",
    "/contact",
  ]) {
    assert.match(llms, new RegExp(`https://chronoversecapital\\.com${route}`));
  }
  assert.doesNotMatch(llms, /\/api\/|\/vip(?:\s|$)|secret|token|key=/i);

  const reportsSource = readFileSync(
    path.join(process.cwd(), "src/app/(site)/reports/page.tsx"),
    "utf8",
  );
  const articleSource = readFileSync(
    path.join(process.cwd(), "src/app/(site)/[slug]/page.tsx"),
    "utf8",
  );
  const archiveSource = readFileSync(
    path.join(process.cwd(), "src/app/(site)/archive/page.tsx"),
    "utf8",
  );
  assert.match(reportsSource, /article\.authoredCategory && article\.categorySlug/);
  assert.match(
    articleSource,
    /currentPost\.authoredCategory && currentPost\.categorySlug/,
  );
  assert.match(archiveSource, /post\.category && post\.categorySlug/);
  assert.doesNotMatch(archiveSource, /category\.title\.toLowerCase/);

  console.log("PASS: public static discovery and research alias hardening");
}

void main();
