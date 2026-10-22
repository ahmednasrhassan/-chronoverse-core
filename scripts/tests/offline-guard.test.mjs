import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

const preload = new URL("./offline-network-preload.mjs", import.meta.url).href;
for (const [name, expression] of [
  ["fetch", "await fetch('https://example.invalid')"],
  ["http", "(await import('node:http')).get('http://example.invalid')"],
  ["https", "(await import('node:https')).request('https://example.invalid')"],
  ["tcp", "(await import('node:net')).connect(443, 'example.invalid')"],
  ["tls", "(await import('node:tls')).connect(443, 'example.invalid')"],
  ["udp", "(await import('node:dgram')).createSocket('udp4').send('test', 53, 'example.invalid')"],
]) {
  test(`caught ${name} operations still fail the offline gate`, () => {
    const child = spawnSync(process.execPath, [
      "--import", preload, "--input-type=module", "-e",
      `try { ${expression}; } catch (error) { if (error.message !== 'OFFLINE_TEST_NETWORK_BLOCKED') throw error; }`,
    ], { encoding: "utf8", timeout: 10000, windowsHide: true });
    assert.equal(child.status, 1, child.stderr);
    assert.match(child.stderr, /Offline guard blocked 1 network attempt/);
    assert.doesNotMatch(child.stderr, /example\.invalid/);
  });
}

test("provider credentials and ambient cloud credential paths are absent", () => {
  for (const key of ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_SHARED_CREDENTIALS_FILE", "GOOGLE_APPLICATION_CREDENTIALS", "SUPABASE_SECRET_KEY", "KV_REST_API_TOKEN", "LEMON_SQUEEZY_API_KEY", "SANITY_API_TOKEN", "SANITY_API_WRITE_TOKEN"]) {
    assert.ok(!Object.hasOwn(process.env, key), `${key} must not be inherited`);
  }
});

for (const expression of [
  "(await import('node:fs')).readFileSync('.env.local')",
  "await (await import('node:fs/promises')).readFile('.env.local')",
]) {
  test(`dotenv reads are blocked before accessing disk: ${expression.startsWith('await') ? 'async' : 'sync'}`, () => {
    const child = spawnSync(process.execPath, [
      "--import", preload, "--input-type=module", "-e",
      `try { ${expression}; } catch (error) { if (error.message !== 'OFFLINE_TEST_ENV_FILE_BLOCKED') throw error; }`,
    ], { encoding: "utf8", timeout: 10000, windowsHide: true });
    assert.equal(child.status, 1, child.stderr);
    assert.match(child.stderr, /Offline guard blocked 1 environment-file read/);
  });
}
