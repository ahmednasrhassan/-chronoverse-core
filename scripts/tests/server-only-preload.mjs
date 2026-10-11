// Test processes only. Mirrors createServerOnlyClientOnlyAliases(true) in the
// installed Next compiler; never load this preload in application startup.
// Usage: node --import ./scripts/tests/server-only-preload.mjs --import tsx <test.ts>
import { createRequire, registerHooks } from "node:module";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const serverMarker = pathToFileURL(
  require.resolve("next/dist/compiled/server-only/empty.js"),
).href;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") return { url: serverMarker, shortCircuit: true };
    return nextResolve(specifier, context);
  },
});
