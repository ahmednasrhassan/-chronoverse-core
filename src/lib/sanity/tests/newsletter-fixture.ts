import assert from "node:assert/strict";
import { mock } from "node:test";
import { SanityClient } from "@sanity/client";
import type { NewsletterConfig } from "../../newsletter/config";
import type { NewsletterArticle } from "../../newsletter/store";

type Doc = Record<string, unknown> & { _id: string; _rev: string; _type: string };
type Selection = string | { query: string; params: { email: string } };

export const syntheticConfig: NewsletterConfig = {
  sender: "sender@example.test", postalAddress: "Synthetic postal fixture (not a business address)",
  region: "us-east-1", mode: "digest", unsubscribeSecret: "nonproduction-unsubscribe-fixture-0123456789",
};

// Stateful isolated SDK boundary. Real handlers/store/crypto/MIME code run;
// all reads/writes remain in this map, and the readiness guard denies networking.
export function newsletterFixture() {
  const env = {
    SANITY_NEWSLETTER_READ_TOKEN: "offline-reader-fixture",
    SANITY_NEWSLETTER_WRITE_TOKEN: "offline-writer-fixture",
    NEWSLETTER_UNSUBSCRIBE_SECRET: syntheticConfig.unsubscribeSecret,
  };
  const old = new Map(Object.keys(env).map(key => [key, process.env[key]]));
  Object.assign(process.env, env);
  const documents = new Map<string, Doc>();
  const publishedArticles: NewsletterArticle[] = [];
  const calls: { operation: string; authenticated: boolean }[] = [];
  const failures = new Set<string>();
  let revision = 0;
  const copy = <T>(value: T): T => structuredClone(value);
  function fail(operation: string) {
    if (failures.delete(operation)) throw new Error("Synthetic storage failure");
  }
  function read(client: SanityClient, operation: string) {
    calls.push({ operation, authenticated: !!client.config().token });
    assert.equal(client.config().useCdn, false);
    assert.ok([env.SANITY_NEWSLETTER_READ_TOKEN, env.SANITY_NEWSLETTER_WRITE_TOKEN].includes(client.config().token!));
    fail("read");
  }
  function write(client: SanityClient, operation: string) {
    assert.equal(client.config().token, env.SANITY_NEWSLETTER_WRITE_TOKEN);
    calls.push({ operation, authenticated: true });
    fail(operation);
  }
  function put(value: Record<string, unknown>): Doc {
    const doc = { ...value, _id: String(value._id), _type: String(value._type), _rev: String(++revision) };
    documents.set(doc._id, doc);
    return copy(doc);
  }
  function patch(selection: Selection, fields: Record<string, unknown>, expected?: string): Doc {
    const ids = typeof selection === "string" ? [selection] : [...documents.values()]
      .filter(doc => doc._type === "subscriber" && String(doc.email).toLowerCase() === selection.params.email).map(doc => doc._id);
    let result: Doc | undefined;
    for (const id of ids) {
      const current = documents.get(id);
      if (!current) throw new Error("Missing fixture document");
      if (expected && current._rev !== expected) throw Object.assign(new Error("Synthetic revision conflict"), { statusCode: 409 });
      result = put({ ...current, ...fields });
    }
    return result!;
  }
  mock.method(SanityClient.prototype, "fetch", (async function(this: SanityClient, query: string, params?: { email?: string }) {
    if (query.includes('_type == "post"')) {
      assert.equal(this.config().token, undefined, "only public editorial reads use the public client");
      fail("read");
      return query.includes("[0]{") ? copy(publishedArticles[0] ?? null) : copy(publishedArticles);
    }
    read(this, "fetch");
    if (query.includes('lower(email) == $email')) {
      if (failures.delete("stale-lookup")) return null;
      const record = [...documents.values()].find(doc => doc._type === "subscriber" && !/^(drafts|versions)\./.test(doc._id) && String(doc.email).toLowerCase() === params?.email);
      return copy(record ?? null);
    }
    assert.match(query, /_type == "subscriber"/);
    assert.match(query, /active == true/);
    assert.match(query, /suppressed != true/);
    return copy([...documents.values()].filter(doc => doc._type === "subscriber" && doc.active === true && doc.suppressed !== true && !/^(drafts|versions)\./.test(doc._id)).slice(0, 1001));
  }) as unknown as SanityClient["fetch"]);
  mock.method(SanityClient.prototype, "getDocument", (async function(this: SanityClient, id: string) {
    read(this, "getDocument"); return copy(documents.get(id));
  }) as unknown as SanityClient["getDocument"]);
  mock.method(SanityClient.prototype, "createIfNotExists", (async function(this: SanityClient, value: Doc) {
    write(this, "create"); return copy(documents.get(value._id) ?? put(value));
  }) as unknown as SanityClient["createIfNotExists"]);
  mock.method(SanityClient.prototype, "patch", (function(this: SanityClient, selection: Selection) {
    let fields: Record<string, unknown> = {}, expected: string | undefined;
    const builder = {
      set(value: Record<string, unknown>) { fields = value; return builder; },
      ifRevisionId(value: string) { expected = value; return builder; },
      commit: async () => { write(this, "patch"); return patch(selection, fields, expected); },
    };
    return builder;
  }) as unknown as SanityClient["patch"]);
  mock.method(SanityClient.prototype, "transaction", (function(this: SanityClient) {
    const actions: (() => void)[] = [];
    const transaction = {
      createIfNotExists(value: Doc) { actions.push(() => { if (!documents.has(value._id)) put(value); }); return transaction; },
      patch(selection: Selection, operations: { set: Record<string, unknown> }) { actions.push(() => { patch(selection, operations.set); }); return transaction; },
      commit: async () => { write(this, "transaction"); for (const action of actions) action(); return {}; },
    };
    return transaction;
  }) as unknown as SanityClient["transaction"]);
  return { documents, publishedArticles, put, calls, failures,
    close() {
      mock.restoreAll();
      for (const [key, value] of old) {
        if (value === undefined) delete process.env[key]; else process.env[key] = value;
      }
    },
  };
}
