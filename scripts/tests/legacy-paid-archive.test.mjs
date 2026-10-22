import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = fileURLToPath(new URL("../../", import.meta.url));
const archive = path.join(root, "archive/legacy-paid-intelligence");
const manifest = JSON.parse(readFileSync(path.join(archive, "manifest.json"), "utf8"));
const config = ts.readConfigFile(path.join(root, "tsconfig.json"), ts.sys.readFile);
assert.equal(config.error, undefined);
const project = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
assert.deepEqual(project.errors, []);

test("every archived implementation preserves its recorded source Git blob", () => {
  assert.equal(manifest.entries.length, 25);
  assert.equal(new Set(manifest.entries.map(entry => entry.original)).size, 25);
  for (const entry of manifest.entries) {
    const destination = path.resolve(root, entry.archived);
    assert.ok(destination.startsWith(archive + path.sep));
    assert.ok(destination.endsWith(".source"));
    const bytes = readFileSync(destination);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), entry.sha256);
    const blob = createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
    assert.equal(blob, entry.gitBlob, entry.original);
    assert.equal(entry.sourceCommit, manifest.sourceCommit);
    if (entry.action === "move") assert.equal(existsSync(path.join(root, entry.original)), false);
    else assert.ok(existsSync(path.join(root, entry.original)), "operational route boundary remains");
  }
});

test("archive stays outside TypeScript inputs and every active module import", () => {
  const moved = new Set(manifest.entries.filter(entry => entry.action === "move")
    .map(entry => path.resolve(root, entry.original).replace(/\.[^.]+$/, "").toLowerCase()));
  for (const file of project.fileNames) {
    assert.ok(!path.resolve(file).startsWith(archive + path.sep), file);
    if (!path.relative(root, file).replaceAll("\\", "/").startsWith("src/")) continue;
    const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
    const check = specifier => {
      const resolved = specifier.startsWith("@/") ? path.resolve(root, "src", specifier.slice(2))
        : specifier.startsWith(".") ? path.resolve(path.dirname(file), specifier) : undefined;
      if (!resolved) return;
      assert.ok(!resolved.startsWith(archive + path.sep), `${file}: ${specifier}`);
      assert.ok(!moved.has(resolved.replace(/\.(?:tsx?|jsx?|mts|mjs)$/, "").toLowerCase()), `${file}: ${specifier}`);
    };
    const visit = node => {
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
        check(node.moduleSpecifier.text);
      }
      if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || node.expression.getText(source) === "require") && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) {
        check(node.arguments[0].text);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
});

test("the actual Tailwind compiler and scanner exclude all archived content", async () => {
  const { compile } = await import("@tailwindcss/node");
  const { Scanner } = await import("@tailwindcss/oxide");
  const cssFile = path.join(root, "src/app/globals.css");
  const compiler = await compile(readFileSync(cssFile, "utf8"), {
    base: path.dirname(cssFile), onDependency() {},
  });
  assert.ok(compiler.sources.some(source => source.negated && path.resolve(source.base, source.pattern) === archive));
  const sources = compiler.root === "none" ? [] : compiler.root ? [compiler.root] : [{ base: root, pattern: "**/*", negated: false }];
  const scanner = new Scanner({ sources: [...sources, ...compiler.sources] });
  scanner.scan();
  const files = scanner.files.map(file => path.resolve(file));
  assert.ok(files.includes(path.join(root, "src/components/home/HomeMarketTools.tsx")), "active market UI remains scanned");
  assert.ok(!files.some(file => file.startsWith(archive + path.sep)), "no archive file contributes production CSS");
});
