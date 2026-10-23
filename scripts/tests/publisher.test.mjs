import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { test } from "node:test";

test("editorial publisher dry run preserves headings, inline markup and display math without service calls", () => {
  const directory = mkdtempSync(join(tmpdir(), "chronoverse-publisher-"));
  try {
    const file = join(directory, "article.md");
    const configuration = join(directory, "publisher.fixture");
    writeFileSync(configuration, "");
    writeFileSync(file, '---\ntitle: Editorial fixture\n---\n# Research **heading**\n\n### Detail\n\n$$w_i + x_j$$\n');
    const result = spawnSync(process.execPath, ["publish-article.mjs", file, "--dry-run"], {
      encoding: "utf8", windowsHide: true, timeout: 30000,
      // The readiness runner supplies no real credentials and blocks Node networking.
      env: {
        ...process.env, SANITY_PROJECT_ID: "fixture123", SANITY_DATASET: "test", SANITY_TOKEN: "",
        // Exercise dotenv against an empty fixture, never the repository's environment files.
        DOTENV_CONFIG_PATH: configuration, DOTENV_CONFIG_QUIET: "true",
      },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /<h2>Research <strong>heading<\/strong><\/h2>/);
    assert.match(result.stdout, /<h3>Detail<\/h3>/);
    assert.match(result.stdout, /\$\$w_i \+ x_j\$\$/);
    assert.doesNotMatch(result.stdout, /<h1>|hNaN|\[object Object\]/);
    assert.match(result.stdout, /nothing was uploaded/);
  } finally {
    assert.ok(resolve(directory).startsWith(resolve(tmpdir()) + sep));
    rmSync(directory, { recursive: true });
  }
});
