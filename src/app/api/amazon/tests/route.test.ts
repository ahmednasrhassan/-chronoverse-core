import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../route.ts", import.meta.url), "utf8");
const expected = {
  status: "disabled",
  message: "This legacy email endpoint is unavailable.",
};

// Compile the actual route in a capability-free context: no imports, credentials,
// network APIs or SDK mocks that could accidentally dispatch a message.
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const routeExports: { POST?: () => Promise<Response> } = {};
runInNewContext(compiled, { exports: routeExports, Response }, { timeout: 1_000 });
const post = routeExports.POST!;

test("retired route exposes only POST and has no sending or credential capability", () => {
  assert.deepEqual(Object.keys(routeExports), ["POST"]);
  const ast = ts.createSourceFile("route.ts", source, ts.ScriptTarget.Latest, true);
  function inspect(node: ts.Node): void {
    assert.ok(!ts.isImportDeclaration(node) && !ts.isImportEqualsDeclaration(node));
    assert.ok(!ts.isNewExpression(node), "no client construction");
    if (ts.isCallExpression(node)) {
      assert.equal(node.expression.getText(ast), "Response.json", "only static JSON response construction");
    }
    if (ts.isIdentifier(node)) {
      assert.ok(!["process", "fetch", "require", "console"].includes(node.text));
    }
    ts.forEachChild(node, inspect);
  }
  inspect(ast);
});

const bodies = [
  ["valid JSON", JSON.stringify({ email: "caller@example.invalid", subject: "Caller subject", message: "Caller message" })],
  ["missing email", "{}"],
  ["null JSON", "null"],
  ["falsy email", '{"email":false}'],
  ["malformed JSON", "{"],
  ["empty body", ""],
  ["HTML injection", JSON.stringify({ email: "<b>caller</b>", subject: "Untrusted", message: "<img src=x onerror=alert(1)>" })],
  ["oversized fields", JSON.stringify({ email: "caller@example.invalid", message: "x".repeat(1_000_000) })],
] as const;

for (const [label, body] of bodies) {
  test(`${label} receives the same inert 410 response`, async () => {
    const request = new Request("http://localhost/api/amazon", { method: "POST", body });
    const response = await Reflect.apply(post, undefined, [request]);
    assert.equal(response.status, 410);
    assert.equal(response.headers.get("content-type"), "application/json");
    assert.deepEqual(await response.json(), expected);
  });
}

test("request properties and body readers are never accessed", async () => {
  const request = new Proxy({}, {
    get() { throw new Error("The retired endpoint must not inspect its request"); },
  });
  const response = await Reflect.apply(post, undefined, [request]);
  assert.equal(response.status, 410);
  assert.deepEqual(await response.json(), expected);
});

test("repeated requests with forged identity remain inert", async () => {
  for (let index = 0; index < 20; index++) {
    const request = new Request("http://localhost/api/amazon", {
      method: "POST", headers: { authorization: "Bearer forged", cookie: "session=forged" },
    });
    const response = await Reflect.apply(post, undefined, [request]);
    assert.equal(response.status, 410);
    assert.deepEqual(await response.json(), expected);
  }
});

test("newsletter clients keep their independent signup endpoint", () => {
  const root = new URL("../../../../../", import.meta.url);
  for (const path of ["src/components/NewsLetterForm.tsx", "src/app/newsletter/page.tsx"]) {
    const client = readFileSync(new URL(path, root), "utf8");
    assert.match(client, /fetch\("\/api\/newsletter"/);
    assert.doesNotMatch(client, /\/api\/amazon/);
  }
});
