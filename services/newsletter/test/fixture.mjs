import { createService } from "../src/service.mjs";
import { capability, readCapability, assertConfirmationAllowed, subscriberId, audienceKey, CONSENT_TEXT, CONSENT_VERSION, TOPIC } from "../src/domain.mjs";
import { articleKey, articleUrlKey } from "../src/discovery.mjs";
export function approvedFixtureArticle(article, time) {
  return { ...article, approvedAt: article.published,
    approval: { approvedBy: "synthetic-editor", approvedAt: new Date(article.published).toISOString() },
    provenance: { sourceId: article.id, revision: "synthetic-revision", originalPublishedAt: new Date(article.published).toISOString(), evidenceSha256: "a".repeat(64) },
    contentManifest: { sequence: Math.floor(time / 1000), sha256: "b".repeat(64), versionId: "synthetic-version", expiresAt: time + 3 * 86400000 } };
}
export function fixture() {
  const state = { time: Date.parse("2026-10-26T10:00:00Z"), sends: [], jobs: [], metrics: [], contacts: new Map(), suppressed: new Set(), documents: new Map(), rates: new Map(), sendError: null, lostAck: false, beforeSend: null };
  const env = { DELIVERY_ENABLED: "true", REGISTRATION_ENABLED: "true", CONFIRMATION_ENABLED: "true", LEGACY_DISPATCH_RETIRED: "true", COMPLIANCE_APPROVED: "true", SENDER_EMAIL: "newsletter@example.test", POSTAL_ADDRESS: "Synthetic fixture address — never publish", CONTACT_LIST: "synthetic-list", CONFIGURATION_SET: "synthetic-config", FEEDBACK_TOPIC_ARN: "arn:aws:sns:eu-west-1:000000000000:synthetic", PLAN_QUEUE_ARN: "plan", DIGEST_QUEUE_ARN: "digest", FEEDBACK_QUEUE_ARN: "feedback", TABLE_STREAM_ARN: "stream" };
  env.PUBLIC_ORIGIN = "https://synthetic.execute-api.eu-north-1.amazonaws.com";
  const keys = { capabilityKey: "synthetic-capability-key-for-tests-only-0123456789", websiteKey: "synthetic-website-key-for-tests-only-0123456789", legacyV1Key: "synthetic-original-v1-key-for-tests-only-0123456789" };
  state.documents.set("CONTROL", { legacyRetired: true, complianceApproved: true, deliveryEnabled: true, registrationEnabled: true, confirmationEnabled: true, migrationComplete: true });
  state.documents.get("CONTROL").contentSourceApproved = true;
  const copy = value => value === undefined ? undefined : structuredClone(value);
  const store = {
    get: async pk => copy(state.documents.get(pk)),
    getMany: async keys => new Map([...new Set(keys)].filter(key => state.documents.has(key)).map(key => [key, copy(state.documents.get(key))])),
    putAbsent: async item => { if (state.documents.has(item.pk)) return false; state.documents.set(item.pk, copy(item)); return true; },
    freezeCampaign: async campaign => {
      if (state.documents.has(campaign.pk) || campaign.articles.some(article =>
        state.documents.get(articleKey(article.id))?.state !== "PENDING" ||
        state.documents.get(articleKey(article.id))?.published !== article.published ||
        state.documents.has(articleUrlKey(article.url)))) return false;
      state.documents.set(campaign.pk, copy(campaign));
      for (const article of campaign.articles) {
        Object.assign(state.documents.get(articleKey(article.id)), copy(article), { state: "ISSUED", campaign: campaign.id });
        state.documents.set(articleUrlKey(article.url), { pk: articleUrlKey(article.url), id: article.id, campaign: campaign.id, createdAt: campaign.createdAt });
      }
      return true;
    },
    pending: async (item, previous) => {
      const old = state.documents.get(item.pk);
      if ((previous && (old?.state !== "PENDING" || old.confirmationNonce !== previous)) || (!previous && old)) return false;
      state.documents.set(item.pk, copy(item)); return true;
    },
    rateLimit: async (key, bucket, limit) => { const k = `${key}:${bucket}`; const count = state.rates.get(k) || 0; if (count >= limit) return false; state.rates.set(k, count + 1); return true; },
    confirm: async token => {
      assertConfirmationAllowed(env, state.documents.get("CONTROL"));
      const { id, nonce } = readCapability(keys.capabilityKey, token, "confirm", state.time);
      const record = state.documents.get(`SUB#${id}`);
      if (record?.state !== "PENDING" || record.confirmationNonce !== nonce || record.suppressedAt !== undefined || record.suppressionReason !== undefined) return false;
      Object.assign(record, { state: "CONFIRMED", confirmedAt: state.time, unsubscribeNonce: "u".repeat(32), audienceKey: audienceKey(id) });
      delete record.confirmationNonce; return true;
    },
    suppress: async (id, email, reason, eventId, at) => {
      const old = state.documents.get(`SUB#${id}`) || { id, email };
      const record = { ...old, pk: `SUB#${id}`, state: "SUPPRESSED", suppressionReason: old.suppressionReason || reason, suppressedAt: old.suppressedAt || at };
      delete record.audienceKey; state.documents.set(record.pk, record);
      state.documents.set(`AUDIT#${id}#${eventId}`, { reason, at });
    },
    claim: async (pk, at) => {
      const old = state.documents.get(pk);
      if (old && !(old.state === "RETRYABLE" && old.attempts < 3)) return false;
      state.documents.set(pk, { pk, state: "CLAIMED", attempts: (old?.attempts || 0) + 1, createdAt: at }); return true;
    },
    deliveryResult: async (pk, status, messageId) => {
      if (state.lostAck && status === "ACCEPTED") throw new Error("synthetic_lost_ack");
      const row = state.documents.get(pk); if (row?.state !== "CLAIMED") return false;
      Object.assign(row, { state: status, messageId }); return true;
    },
    deferUnsent: async pk => {
      const row = state.documents.get(pk);
      if (row?.state !== "CLAIMED" || row.attempts < 1) return false;
      Object.assign(row, { state: "RETRYABLE", attempts: row.attempts - 1 }); return true;
    },
    audience: async shard => ({ items: [...state.documents.values()].filter(x => x.audienceKey === `AUDIENCE#${shard}`).map(copy) }),
  };
  const deps = { store, now: () => state.time, secrets: async () => keys, metric: name => state.metrics.push(name), wait: async () => state.beforeSend?.(),
    articles: async () => [approvedFixtureArticle({ id: "urn:chronoverse:article:fixture", title: "Fixture article", summary: "Synthetic summary", url: "https://chronoversecapital.com/fixture-article", published: Date.parse("2026-10-25T08:00:00Z") }, state.time)],
    queue: { digest: async job => state.jobs.push({ type: "digest", ...job }), plan: async job => state.jobs.push({ type: "plan", ...job }) },
    mail: {
      accountSuppressed: async email => state.suppressed.has(email),
      contact: async email => copy(state.contacts.get(email)) || null,
      createContact: async email => { if (!state.contacts.has(email)) state.contacts.set(email, { UnsubscribeAll: false, TopicPreferences: [{ TopicName: TOPIC, SubscriptionStatus: "OPT_IN" }] }); },
      optout: async email => state.contacts.set(email, { UnsubscribeAll: true }),
      send: async (email, message, tags) => { state.sends.push({ email, message, tags }); if (state.sendError) throw state.sendError; return "synthetic-message-id"; },
    },
  };
  const service = createService(deps, env);
  const api = (path, body, overrides = {}) => service.api({ rawPath: path, requestContext: { http: { method: "POST" } }, headers: { "x-newsletter-bridge": keys.websiteKey }, body: JSON.stringify(body), ...overrides });
  const subscribe = email => api("/subscribe", { email, consent: true, consentVersion: CONSENT_VERSION, consentText: CONSENT_TEXT, clientFingerprint: "f".repeat(64) });
  function confirmed(email = "reader@example.test") {
    const id = subscriberId(email);
    state.documents.set(`SUB#${id}`, { pk: `SUB#${id}`, id, email, state: "CONFIRMED", confirmedAt: state.time - 7200000, unsubscribeNonce: "u".repeat(32), audienceKey: audienceKey(id) });
    state.contacts.set(email, { UnsubscribeAll: false, TopicPreferences: [{ TopicName: TOPIC, SubscriptionStatus: "OPT_IN" }] });
    state.documents.set("CAMPAIGN#2026-10-26", { pk: "CAMPAIGN#2026-10-26", id: "2026-10-26", end: Date.parse("2026-10-26T09:00:00Z"), articles: [approvedFixtureArticle({ id: "urn:chronoverse:article:fixture", title: "Fixture", summary: "Fixture", url: "https://chronoversecapital.com/fixture", published: Date.parse("2026-10-25T08:00:00Z") }, state.time)] });
    return { id, campaign: "2026-10-26" };
  }
  /** @param {number | null} [exp] Confirmation expiry, or null for unsubscribe. */
  const token = (id, purpose = "unsubscribe", tokenNonce = "u".repeat(32), exp = null) => capability(keys.capabilityKey, purpose, id, tokenNonce, exp);
  return { state, env, keys, deps, service, api, subscribe, confirmed, token };
}
