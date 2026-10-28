import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

test("Git retains exact deployed PATCHED/BASE source separately from explicitly undeployed source deltas", () => {
  const manifest = JSON.parse(readFileSync(new URL("../deployments/deployment-reviewed-2026-10-28.json", import.meta.url)));
  assert.equal(manifest.aws.functions.ApiFunction.archiveSha256, "638f813fa3682caf7ccdbac556e557b65928c036836ce5221337b65bdacca150");
  for (const [name, expected] of Object.entries(manifest.gitSource.runtimeSourceSha256)) {
    const source = manifest.gitSource.patchedSourceOverrides?.[name] || name;
    const bytes = readFileSync(new URL(`../${source}`, import.meta.url));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), expected, name);
  }
  assert.deepEqual(Object.keys(manifest.gitSource.currentSourceDelta), ["src/http.mjs"]);
  for (const [name, delta] of Object.entries(manifest.gitSource.currentSourceDelta)) {
    assert.equal(delta.status, "SOURCE_ONLY_NOT_DEPLOYED");
    const bytes = readFileSync(new URL(`../${name}`, import.meta.url));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), delta.sha256);
  }
  for (const [name, expected] of Object.entries(manifest.gitSource.baseRuntimeSourceSha256)) {
    const source = manifest.gitSource.baseSourceOverrides[name] || name;
    const bytes = readFileSync(new URL(`../${source}`, import.meta.url));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), expected, `BASE ${name}`);
  }
  assert.equal(manifest.isExecutionReceipt, false);
  assert.equal(manifest.incomplete.receiptWriteApproved, false);
  assert.equal(manifest.incomplete.freshConsentEndToEnd, "NOT_RUN");
  assert.equal(manifest.incomplete.unsubscribeEndToEnd, "NOT_RUN");
});

test("historical activation and missing private mailbox configuration stop before cloud or file changes", () => {
  const script = `import importlib.util, os, pathlib, tempfile
root=pathlib.Path(${JSON.stringify(fileURLToPath(new URL("../scripts/", import.meta.url)))})
def load(name):
 spec=importlib.util.spec_from_file_location(name,root/name);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
def blocked(fn):
 try:fn()
 except (RuntimeError,AssertionError):return
 raise AssertionError('unapproved path reached')
activation=load('run-verified-activation.py');blocked(activation.main)
release=load('cloudshell-signup-release.py');release.TEST_MAILBOX='';blocked(release.Release)
recovery=load('recover-private-signup.py');recovery.MAILBOX='';blocked(lambda:recovery.private(None,True))
os.environ.pop('NEWSLETTER_TEST_MAILBOX',None)
builder=load('package-confirmation-fix.py')
with tempfile.TemporaryDirectory() as temp:
 p=pathlib.Path(temp);blocked(lambda:builder.package(p/'absent-base',p/'absent-output'))
 assert list(p.iterdir())==[]
`;
  const result = spawnSync(process.platform === "win32" ? "python" : "python3", ["-B", "-c", script],
    { encoding: "utf8", windowsHide: true });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
