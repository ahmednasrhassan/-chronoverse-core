import { CONSENT_VERSION, CONSENT_TEXT, TOPIC, emailAddress, subscriberId, nonce, hash, capability, readCapability, legacyOptout, assertMailAllowed, assertConfirmationAllowed, equalSecret, weeklyWindow, escapeHtml, SendCapacityUnavailable } from "./domain.mjs";
import { digestMessage } from "./rss.mjs";
import { discoverCampaign, initializeDiscovery } from "./discovery.mjs";
import { createPublicApi, publicOrigin, securityHeaders } from "./http.mjs";
import { approvedArticle } from "./content.mjs";
import { assertPublicationCurrent, isPublicationArticle } from "./publication.mjs";

const json = (statusCode, code) => ({ statusCode, headers: { ...securityHeaders, "content-type": "application/json" }, body: JSON.stringify({ code }) });
const contactOptout = contact => contact?.UnsubscribeAll === true || contact?.TopicPreferences?.some(p => p.TopicName === TOPIC && p.SubscriptionStatus === "OPT_OUT");
const contactOptin = contact => contact && contact.UnsubscribeAll !== true && contact.TopicPreferences?.some(p => p.TopicName === TOPIC && p.SubscriptionStatus === "OPT_IN");
const expiredCampaign = (campaign, now) => !campaign || !Number.isFinite(campaign.end) || now < campaign.end || now - campaign.end > 72 * 3600000;

export function createService(deps, env) {
  const { store, mail, queue, secrets, now, articles, metric } = deps;
  async function allowed(kind) { assertMailAllowed(env, await store.get("CONTROL"), kind); }
  async function suppress(id, email, reason, eventId) {
    // The ledger commits first. Contact synchronization is a retried stream outbox.
    await store.suppress(id, email, reason, hash(eventId), now());
    metric("Suppressed");
  }
  async function api(event, publicContext) {
    try {
      if (event.requestContext?.http?.method !== "POST") return json(405, "method_not_allowed");
      if (event.isBase64Encoded || typeof event.body !== "string" || Buffer.byteLength(event.body) > 4096) return json(400, "invalid_request");
      const secret = publicContext?.secret || await secrets();
      if (!publicContext && !equalSecret(event.headers?.["x-newsletter-bridge"], secret.websiteKey)) return json(401, "unauthorized");
      let body; try { body = JSON.parse(event.body); } catch { return json(400, "invalid_request"); }
      if (!body || typeof body !== "object" || Array.isArray(body)) return json(400, "invalid_request");
      const path = event.rawPath;
      if (path === "/subscribe") {
        // Check all gates before even parsing an address or touching an audience.
        await allowed("confirmation");
        const origin = publicOrigin(env);
        if (body.consent !== true || body.consentVersion !== CONSENT_VERSION || body.consentText !== CONSENT_TEXT) return json(400, "explicit_consent_required");
        const email = emailAddress(body.email); const id = subscriberId(email);
        const existing = await store.get(`SUB#${id}`);
        // Never reactivate imports, inactive states, previous opt-outs or bounces.
        if (existing && existing.state !== "PENDING") return json(202, "check_inbox_if_eligible");
        if (!await store.rateLimit(`EMAIL#${id}`, Math.floor(now() / 86400000), 1, now() + 172800000)) return json(202, "check_inbox_if_eligible");
        if (typeof body.clientFingerprint !== "string" || !/^[a-f0-9]{64}$/.test(body.clientFingerprint) ||
            !await store.rateLimit(`CLIENT#${body.clientFingerprint}`, Math.floor(now() / 3600000), 10, now() + 7200000)) return json(202, "check_inbox_if_eligible");
        if (await mail.accountSuppressed(email)) { await suppress(id, email, "provider-suppression", `provider:${id}`); return json(202, "check_inbox_if_eligible"); }
        const contact = await mail.contact(email);
        if (contactOptout(contact)) { await suppress(id, email, "ses-optout", `ses:${id}`); return json(202, "check_inbox_if_eligible"); }
        const tokenNonce = nonce();
        const pending = { pk: `SUB#${id}`, id, email, state: "PENDING", confirmationNonce: tokenNonce,
          requestedAt: now(), consentVersion: CONSENT_VERSION, consentText: CONSENT_TEXT, source: `${origin}/register` };
        if (!await store.pending(pending, existing?.confirmationNonce)) return json(202, "check_inbox_if_eligible");
        const token = capability(secret.capabilityKey, "confirm", id, tokenNonce, now() + 86400000);
        const url = `${origin}/confirm?token=${token}`;
        // Claim before SES; uncertain outcomes are held, never automatically resent.
        const claim = `MAIL#confirmation#${id}#${tokenNonce}`;
        if (!await store.claim(claim, now())) return json(202, "check_inbox_if_eligible");
        await allowed("confirmation");
        const latest = await store.get(pending.pk);
        if (latest?.state !== "PENDING" || latest.confirmationNonce !== tokenNonce) return json(202, "check_inbox_if_eligible");
        try {
          const result = await mail.send(email, { subject: "Confirm your Chronoverse Capital newsletter subscription",
            text: `Confirm only if you requested our weekly research newsletter: ${url}\nThis link expires in 24 hours. Ignore it if you did not request this.\n${env.POSTAL_ADDRESS}`,
            html: `<html lang="en"><body><p>Confirm your weekly research subscription using the link below. If you did not request this, ignore this message.</p><p><a href="${url}">Review and confirm subscription</a></p><footer><p>${escapeHtml(env.POSTAL_ADDRESS)}</p></footer></body></html>` }, { kind: "confirmation", id });
          await store.deliveryResult(claim, "ACCEPTED", result, now()); metric("Accepted");
        } catch (error) {
          const deferred = error instanceof SendCapacityUnavailable;
          await store.deliveryResult(claim, deferred ? "NOT_SENT" : "UNKNOWN", undefined, now()); metric(deferred ? "Throttled" : "Held");
          if (deferred) return json(503, "temporarily_unavailable");
        }
        return json(202, "check_inbox_if_eligible");
      }
      if (path === "/confirm") {
        assertConfirmationAllowed(env, await store.get("CONTROL"));
        const data = readCapability(secret.capabilityKey, body.token, "confirm", now());
        const record = await store.get(`SUB#${data.id}`);
        if (record?.state !== "PENDING" || record.confirmationNonce !== data.nonce) return json(400, "invalid_link");
        if (await mail.accountSuppressed(record.email) || contactOptout(await mail.contact(record.email))) {
          await suppress(data.id, record.email, "provider-suppression", `confirm:${data.id}`); return json(400, "invalid_link");
        }
        if (!await store.confirm(body.token)) return json(400, "invalid_link");
        metric("Confirmed"); return json(200, "subscription_confirmed");
      }
      if (path === "/unsubscribe") {
        let id, email;
        if (typeof body.token === "string" && body.token.startsWith("v1.")) {
          email = legacyOptout(secret.legacyV1Key, body.token); id = subscriberId(email);
        } else {
          const data = readCapability(secret.capabilityKey, body.token, "unsubscribe", now());
          id = data.id;
          const record = await store.get(`SUB#${id}`);
          if (!record || record.unsubscribeNonce !== data.nonce) return json(400, "invalid_link");
          email = record.email;
        }
        await suppress(id, email, "unsubscribe", `unsubscribe:${hash(body.token)}`);
        return json(200, "unsubscribe_recorded");
      }
      return json(404, "not_found");
    } catch (error) {
      // No addresses, raw request bodies, capabilities, keys or SDK errors in logs.
      const code = ["invalid_input", "invalid_link", "sending_paused"].includes(error?.message) ? error.message : "temporarily_unavailable";
      metric(code === "sending_paused" ? "Paused" : "ApiFailure");
      return json(code.startsWith("invalid_") ? 400 : 503, code);
    }
  }

  async function plan(event, context = {}) {
    await allowed("digest");
    const work = event.kind === "weekly" ? { campaign: weeklyWindow(now()).id, shard: 0 } : event;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(work.campaign) || !Number.isInteger(work.shard) || work.shard < 0 || work.shard > 15) throw new Error("invalid_job");
    let campaign = await store.get(`CAMPAIGN#${work.campaign}`);
    if (!campaign) {
      const window = weeklyWindow(now());
      if (window.id !== work.campaign) throw new Error("invalid_job");
      if (expiredCampaign(window, now())) { metric("ExpiredCampaign"); return; }
      // Record the first approved period even during an outage or empty feed;
      // otherwise a failed first week would become permanently undiscoverable.
      const sourceControl = await store.get("CONTROL");
      const firstWindow = sourceControl?.sanityPublishedStateApproved === true && Number.isSafeInteger(sourceControl.contentStartAt) ?
        { ...window, start: Math.min(window.start, sourceControl.contentStartAt) } : window;
      await initializeDiscovery(store, firstWindow, now());
      const found = await articles(window); // No fallback to retained backlog on an unavailable/unapproved archive.
      if (!Array.isArray(found) || found.some(a => !approvedArticle(a, now(), window.end))) throw new Error("unapproved_content");
      await assertPublicationCurrent(store, found, now(), window.end);
      if (!found.length) { metric("EmptyFeed"); return; }
      campaign = await discoverCampaign(store, window, found, now());
      if (!campaign) { metric("EmptyFeed"); return; }
    }
    if (expiredCampaign(campaign, now())) { metric("ExpiredCampaign"); return; }
    if (!campaign.articles?.length || campaign.articles.some(a => !approvedArticle(a, now(), campaign.end))) { metric("Held"); return; }
    await assertPublicationCurrent(store, campaign.articles, now(), campaign.end);
    const page = await store.audience(work.shard, work.cursor);
    for (const record of page.items) {
      if (record.state === "CONFIRMED" && record.confirmedAt <= campaign.end) await queue.digest({ campaign: campaign.id, id: record.id });
      if (context.getRemainingTimeInMillis?.() < 15000) throw new Error("planner_retry_required");
    }
    if (page.cursor) await queue.plan({ ...work, cursor: page.cursor });
    else if (work.shard < 15) await queue.plan({ campaign: work.campaign, shard: work.shard + 1 });
    metric("PlannedPage");
  }

  async function deliver(job) {
    await allowed("digest");
    if (!/^[a-f0-9]{64}$/.test(job.id) || !/^\d{4}-\d{2}-\d{2}$/.test(job.campaign)) throw new Error("invalid_job");
    const campaign = await store.get(`CAMPAIGN#${job.campaign}`);
    let record = await store.get(`SUB#${job.id}`);
    if (expiredCampaign(campaign, now()) || !record || record.state !== "CONFIRMED" || record.confirmedAt > campaign.end) return;
    if (!campaign.articles?.length || campaign.articles.some(a => !approvedArticle(a, now(), campaign.end))) { metric("Held"); return; }
    await assertPublicationCurrent(store, campaign.articles, now(), campaign.end);
    const contact = await mail.contact(record.email);
    if (contactOptout(contact) || await mail.accountSuppressed(record.email)) {
      await suppress(record.id, record.email, "provider-suppression", `pre-send:${job.campaign}:${job.id}`); return;
    }
    // Contact sync failure cannot silently bypass the secondary opt-in safeguard.
    if (!contactOptin(contact)) throw new Error("contact_sync_pending");
    const secret = await secrets();
    const token = capability(secret.capabilityKey, "unsubscribe", record.id, record.unsubscribeNonce);
    const message = digestMessage(campaign.articles, env.POSTAL_ADDRESS, `${publicOrigin(env)}/unsubscribe?token=${token}`);
    if (campaign.articles.some(isPublicationArticle)) message.publicationCheck = { articles: campaign.articles, end: campaign.end };
    const claim = `MAIL#${job.campaign}#${job.id}`;
    if (!await store.claim(claim, now())) { metric("DuplicateHeld"); return; }
    await deps.wait(); // Local pacing only; the shared SES lease enforces the cross-invocation limit.
    await allowed("digest");
    record = await store.get(`SUB#${job.id}`);
    if (record?.state !== "CONFIRMED") { await store.deliveryResult(claim, "SUPPRESSED", undefined, now()); return; }
    try {
      const messageId = await mail.send(record.email, message, { kind: "digest", id: job.id, campaign: job.campaign });
      await store.deliveryResult(claim, "ACCEPTED", messageId, now()); metric("Accepted");
    } catch (error) {
      if (error instanceof SendCapacityUnavailable) {
        await store.deferUnsent(claim, now()); metric("Throttled");
        throw new Error("send_capacity_retry_required");
      }
      // Only explicit SES throttling rejection is safe for an automatic retry.
      const retry = error?.name === "TooManyRequestsException" && error?.$metadata?.httpStatusCode === 429;
      await store.deliveryResult(claim, retry ? "RETRYABLE" : "UNKNOWN", undefined, now());
      metric(retry ? "Throttled" : "Held");
      if (retry) throw new Error("retryable_rejection");
    }
  }

  async function sync(id) {
    let record = await store.get(`SUB#${id}`);
    if (!record?.email || !["CONFIRMED", "SUPPRESSED"].includes(record.state)) return;
    const contact = await mail.contact(record.email);
    if (record.state === "SUPPRESSED") { if (contact) await mail.optout(record.email); return; }
    if (contactOptout(contact) || await mail.accountSuppressed(record.email)) { await suppress(id, record.email, "provider-suppression", `sync:${id}`); return; }
    if (!contact) await mail.createContact(record.email);
    // An unsubscribe racing contact creation wins in both stores.
    record = await store.get(`SUB#${id}`);
    if (record?.state === "SUPPRESSED") await mail.optout(record.email);
    metric("ContactSynced");
  }

  async function feedback(envelope) {
    if (envelope.Type !== "Notification" || envelope.TopicArn !== env.FEEDBACK_TOPIC_ARN) throw new Error("untrusted_feedback");
    const event = JSON.parse(envelope.Message);
    const eventId = hash(`${envelope.MessageId}:${event.eventType || event.notificationType}`);
    if (await store.get(`EVENT#${eventId}`)) return;
    const type = event.eventType || event.notificationType;
    let addresses = [], reason;
    if (type === "Complaint") { addresses = (event.complaint?.complainedRecipients || []).map(x => x.emailAddress); reason = "complaint"; }
    if (type === "Bounce" && event.bounce?.bounceType === "Permanent") { addresses = (event.bounce.bouncedRecipients || []).map(x => x.emailAddress); reason = "hard-bounce"; }
    if (type === "Subscription" && event.subscription?.contactList === env.CONTACT_LIST) {
      const preferences = event.subscription.newTopicPreferences;
      const topics = preferences?.topicSubscriptionStatus || [];
      if (preferences?.unsubscribeAll === true || topics.some(p => p.topicName === TOPIC && p.subscriptionStatus === "OptOut")) {
        addresses = event.mail?.destination || []; reason = "ses-optout";
      }
      // Provider OPT_IN events never clear the permanent ledger suppression.
    }
    for (const value of addresses) {
      const email = emailAddress(value); await suppress(subscriberId(email), email, reason, eventId);
    }
    if (addresses.length && reason === "complaint") metric("Complaint");
    if (addresses.length && reason === "hard-bounce") metric("HardBounce");
    if (type === "Delivery") metric("Delivered");
    if (["Reject", "Rendering Failure", "DeliveryDelay"].includes(type)) metric("ProviderFailure");
    const id = event.mail?.tags?.id?.[0], campaign = event.mail?.tags?.campaign?.[0];
    await store.putAbsent({ pk: `EVENT#${eventId}`, type, processedAt: now(),
      providerMessageId: typeof event.mail?.messageId === "string" ? event.mail.messageId : undefined,
      subscriberId: /^[a-f0-9]{64}$/.test(id || "") ? id : undefined,
      campaign: /^\d{4}-\d{2}-\d{2}$/.test(campaign || "") ? campaign : undefined });
  }
  return { api: createPublicApi(api, deps, env), plan, deliver, sync, feedback, failure: () => metric("QueueProcessingFailure") };
}
