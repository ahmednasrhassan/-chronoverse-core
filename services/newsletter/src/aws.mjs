import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, BatchGetCommand, PutCommand, UpdateCommand, QueryCommand, TransactWriteCommand } from "@aws-sdk/lib-dynamodb";
import { SESv2Client, GetContactCommand, CreateContactCommand, UpdateContactCommand, GetSuppressedDestinationCommand, SendEmailCommand } from "@aws-sdk/client-sesv2";
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import { audienceKey, nonce, TOPIC, ENROLLMENT_POLICY, FORWARD_ONLY_STATUS, CONSENT_VERSION, CONSENT_TEXT, pendingEnrollment, campaignEligible, assertMailAllowed, assertConfirmationAllowed, readCapability, emailAddress, SEND_LEASE_MS, SEND_COOLDOWN_MS, SendCapacityUnavailable } from "./domain.mjs";
import { createContentSource } from "./content.mjs";
import { articleKey, articleUrlKey } from "./discovery.mjs";
import { assertPublicationCurrent } from "./publication.mjs";

const conditional = error => error?.name === "ConditionalCheckFailedException" ||
  (error?.name === "TransactionCanceledException" && error.CancellationReasons?.some(x => x.Code === "ConditionalCheckFailed"));
const signals = new Set(["Suppressed", "Accepted", "Throttled", "Held", "Confirmed", "Paused", "ApiFailure", "ExpiredCampaign", "EmptyFeed", "PlannedPage", "DuplicateHeld", "ContactSynced", "Delivered", "ProviderFailure", "QueueProcessingFailure", "HardBounce", "Complaint"]);
const faults = new Set(["Throttled", "Held", "ApiFailure", "ExpiredCampaign", "ProviderFailure", "QueueProcessingFailure", "HardBounce", "Complaint", "UnknownSignal"]);
export function emitNewsletterMetric(name, write = value => process.stdout.write(value)) {
  // Keep diagnostic categories in logs, with one dimensionless paid metric for
  // actionable faults. Never turn caller-provided text into metric dimensions.
  const signal = signals.has(name) ? name : "UnknownSignal";
  const entry = { event: "newsletter", signal, count: 1 };
  if (faults.has(signal)) {
    entry._aws = { Timestamp: Date.now(), CloudWatchMetrics: [{ Namespace: "Chronoverse/Newsletter", Dimensions: [[]], Metrics: [{ Name: "SafetyFailure", Unit: "Count" }] }] };
    entry.SafetyFailure = 1;
  }
  write(JSON.stringify(entry) + "\n");
}
export function emitNewsletterDiagnostic(entry, write = value => process.stdout.write(value)) {
  const phases = new Set("request bridge query control body_decode origin body_parse context consent secrets internal identity subscriber_read rate_email rate_client provider_suppression contact_read pending_write claim_write send_recheck send send_ack confirm confirm_control confirm_token confirm_action confirm_pending confirm_suppression confirm_transaction unsubscribe".split(" "));
  const reasons = new Set("not_found method_not_allowed bad_request unauthorized bridge_result page_ready origin_denied context_denied unsupported_media internal_failure accepted_or_ineligible permission_denied dependency_validation dependency_throttled provider_rejected gate_closed configuration dependency_failure outcome_uncertain confirmation_ineligible confirmation_conflict confirmation_recorded".split(" "));
  const safe = { event: "newsletter_http", status: [200, 202, 400, 401, 403, 404, 405, 410, 415, 429, 500, 502, 503, 504].includes(entry.status) ? entry.status : 500,
    phase: phases.has(entry.phase) ? entry.phase : "internal", reason: reasons.has(entry.reason) ? entry.reason : "internal_failure", encoded: entry.encoded === true };
  if (/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(entry.requestId || "")) safe.requestId = entry.requestId;
  write(JSON.stringify(safe) + "\n");
}
export function createAwsDependencies(env) {
  // Execution-role credentials only. Never install or copy website AWS keys.
  const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: env.AWS_REGION, maxAttempts: 3 }), { marshallOptions: { removeUndefinedValues: true } });
  const ses = new SESv2Client({ region: env.AWS_REGION, maxAttempts: 1 });
  const sqs = new SQSClient({ region: env.AWS_REGION, maxAttempts: 3 });
  const sm = new SecretsManagerClient({ region: env.AWS_REGION, maxAttempts: 3 });
  const TableName = env.TABLE_NAME;
  async function secrets() {
    const result = await sm.send(new GetSecretValueCommand({ SecretId: env.SECRETS_ARN }));
    if (!result.SecretString) throw new Error("not_configured"); return JSON.parse(result.SecretString);
  }
  async function conditionalSend(command) { try { await ddb.send(command); return true; } catch (e) { if (conditional(e)) return false; throw e; } }
  const store = {
    async acceptContentManifest(observation) {
      try {
        await ddb.send(new PutCommand({ TableName, Item: { pk: "CONTENT#STATE", sequence: observation.sequence,
          contentHash: observation.sha256, versionId: observation.versionId, evidence: observation },
          ConditionExpression: "attribute_not_exists(pk) OR #sequence < :sequence OR (#sequence = :sequence AND contentHash = :hash AND versionId = :version)",
          ExpressionAttributeNames: { "#sequence": "sequence" },
          ExpressionAttributeValues: { ":sequence": observation.sequence, ":hash": observation.sha256, ":version": observation.versionId } }));
        return true;
      } catch (error) { if (conditional(error)) return false; throw error; }
    },
    async get(pk) { return (await ddb.send(new GetCommand({ TableName, Key: { pk }, ConsistentRead: true }))).Item; },
    async getMany(keys) {
      const unique = [...new Set(keys)];
      if (unique.some(pk => !/^ARTICLE(?:_URL)?#[a-f0-9]{64}$/.test(pk))) throw new Error("invalid_article_key");
      const items = new Map();
      for (let offset = 0; offset < unique.length; offset += 100) {
        let pending = unique.slice(offset, offset + 100).map(pk => ({ pk }));
        for (let attempt = 0; pending.length; attempt++) {
          if (attempt >= 5) throw new Error("article_reads_incomplete");
          if (attempt) await new Promise(resolve => setTimeout(resolve, 50 * 2 ** attempt));
          const result = await ddb.send(new BatchGetCommand({ RequestItems: { [TableName]: { Keys: pending, ConsistentRead: true } } }));
          for (const item of result.Responses?.[TableName] || []) items.set(item.pk, item);
          pending = result.UnprocessedKeys?.[TableName]?.Keys || [];
        }
      }
      return items;
    },
    putAbsent: item => conditionalSend(new PutCommand({ TableName, Item: item, ConditionExpression: "attribute_not_exists(pk)" })),
    freezeCampaign(campaign) {
      if (!campaign.articles?.length || campaign.articles.length > 10 ||
          new Set(campaign.articles.map(a => a.id)).size !== campaign.articles.length ||
          new Set(campaign.articles.map(a => a.url)).size !== campaign.articles.length) throw new Error("invalid_campaign");
      const manifest = campaign.articles[0].contentManifest;
      if (manifest && campaign.articles.some(a => a.contentManifest?.sequence !== manifest.sequence || a.contentManifest?.sha256 !== manifest.sha256)) throw new Error("invalid_campaign");
      return conditionalSend(new TransactWriteCommand({ TransactItems: [
        ...(manifest ? [{ Put: { TableName, Item: { pk: "CONTENT#STATE", sequence: manifest.sequence,
          contentHash: manifest.sha256, versionId: manifest.versionId, evidence: manifest },
          ConditionExpression: "#sequence = :sequence AND contentHash = :hash AND versionId = :version",
          ExpressionAttributeNames: { "#sequence": "sequence" },
          ExpressionAttributeValues: { ":sequence": manifest.sequence, ":hash": manifest.sha256, ":version": manifest.versionId } } }] : []),
        { Put: { TableName, Item: campaign, ConditionExpression: "attribute_not_exists(pk)" } },
        ...campaign.articles.flatMap(article => [
          { Update: { TableName, Key: { pk: articleKey(article.id) },
            UpdateExpression: "SET #state = :issued, #campaign = :campaign, #title = :title, #summary = :summary, #url = :url",
            ConditionExpression: "#state = :pending AND #published = :published",
            ExpressionAttributeNames: { "#state": "state", "#url": "url", "#campaign": "campaign", "#title": "title", "#summary": "summary", "#published": "published" },
            ExpressionAttributeValues: { ":issued": "ISSUED", ":pending": "PENDING", ":published": article.published,
              ":campaign": campaign.id, ":title": article.title, ":summary": article.summary, ":url": article.url } } },
          { Put: { TableName, Item: { pk: articleUrlKey(article.url), id: article.id, campaign: campaign.id, createdAt: campaign.createdAt }, ConditionExpression: "attribute_not_exists(pk)" } },
        ]),
      ] }));
    },
    pending(item, previousNonce) {
      return conditionalSend(new TransactWriteCommand({ TransactItems: [{ Put: { TableName, Item: item,
        ConditionExpression: previousNonce ? "#state = :pending AND confirmationNonce = :nonce" : "attribute_not_exists(pk)",
        ...(previousNonce ? { ExpressionAttributeNames: { "#state": "state" }, ExpressionAttributeValues: { ":pending": "PENDING", ":nonce": previousNonce } } : {}) } },
        { Put: { TableName, Item: { pk: `AUDIT#${item.id}#request#${item.confirmationNonce}`, kind: "requested", at: item.requestedAt,
          consentVersion: item.consentVersion, consentText: item.consentText, enrollmentPolicy: item.enrollmentPolicy, source: item.source }, ConditionExpression: "attribute_not_exists(pk)" } }] }));
    },
    async rateLimit(key, bucket, limit, expires) {
      return conditionalSend(new UpdateCommand({ TableName, Key: { pk: `RATE#${key}#${bucket}` },
        UpdateExpression: "SET expiresAt = :expiry ADD attempts :one", ConditionExpression: "attribute_not_exists(attempts) OR attempts < :limit",
        ExpressionAttributeValues: { ":expiry": Math.floor(expires / 1000), ":one": 1, ":limit": limit } }));
    },
    acquireSendLease(owner, time) {
      return conditionalSend(new UpdateCommand({ TableName, Key: { pk: "RATE#SES_SEND_GATE" },
        UpdateExpression: "SET leaseOwner = :owner, leaseUntil = :until",
        ConditionExpression: "attribute_not_exists(pk) OR leaseUntil <= :now",
        ExpressionAttributeValues: { ":owner": owner, ":until": time + SEND_LEASE_MS, ":now": time } }));
    },
    releaseSendLease(owner, time) {
      return conditionalSend(new UpdateCommand({ TableName, Key: { pk: "RATE#SES_SEND_GATE" },
        UpdateExpression: "SET leaseUntil = :until REMOVE leaseOwner",
        ConditionExpression: "leaseOwner = :owner",
        ExpressionAttributeValues: { ":owner": owner, ":until": time + SEND_COOLDOWN_MS } }));
    },
    async confirm(token) {
      // Revalidate even direct internal callers. A stale read alone cannot authorize activation.
      const control = await store.get("CONTROL");
      assertConfirmationAllowed(env, control);
      const secret = await secrets();
      const time = Date.now();
      const { id, nonce: tokenNonce } = readCapability(secret.capabilityKey, token, "confirm", time);
      assertConfirmationAllowed(env, control);
      const renewal = await store.get(`RENEW#${id}`), original = await store.get(`SUB#${id}`);
      const pending = renewal?.confirmationNonce === tokenNonce ? renewal : original;
      if (!pendingEnrollment(pending) || pending.confirmationNonce !== tokenNonce || pending.requestedAt > time) return false;
      const renewing = pending.pk === `RENEW#${id}`;
      const proofCondition = "#state = :pending AND confirmationNonce = :nonce AND enrollmentPolicy = :policy AND consentVersion = :consentVersion AND consentText = :consentText AND requestedAt = :requestedAt";
      const proofValues = { ":pending": "PENDING", ":nonce": tokenNonce, ":policy": ENROLLMENT_POLICY, ":consentVersion": CONSENT_VERSION, ":consentText": CONSENT_TEXT, ":requestedAt": pending.requestedAt };
      // Bind the transaction to the exact reviewed initialization read above.
      // Historical recovery is never falsely marked complete to admit new consent.
      const initialized = control.migrationComplete === true
        ? { condition: "migrationComplete = :approved", values: {} }
        : { condition: "forwardOnlyReady = :approved AND forwardOnlyPolicy = :forwardPolicy AND historicalRecoveryStatus = :historyStatus AND forwardOnlyReceipt = :receipt",
          values: { ":forwardPolicy": ENROLLMENT_POLICY, ":historyStatus": FORWARD_ONLY_STATUS, ":receipt": control.forwardOnlyReceipt } };
      try {
        await ddb.send(new TransactWriteCommand({ TransactItems: [
          { ConditionCheck: { TableName, Key: { pk: "CONTROL" },
            ConditionExpression: "registrationEnabled = :approved AND confirmationEnabled = :approved AND legacyRetired = :approved AND complianceApproved = :approved AND " + initialized.condition,
            ExpressionAttributeValues: { ":approved": true, ...initialized.values } } },
          { Update: { TableName, Key: { pk: `SUB#${id}` }, UpdateExpression: "SET #state = :confirmed, confirmedAt = :now, unsubscribeNonce = " + (renewing ? "if_not_exists(unsubscribeNonce, :unsub)" : ":unsub") + ", audienceKey = :audience, confirmedPolicy = :policy, awsConsentVersion = :consentVersion, awsConsentText = :consentText, awsRequestedAt = :requestedAt, confirmedRequestNonce = :nonce" + (renewing ? "" : " REMOVE confirmationNonce"),
            ConditionExpression: (renewing ? "attribute_exists(pk) AND (#state = :hold OR #state = :oldConfirmed OR #state = :pending)" : proofCondition) + " AND attribute_not_exists(suppressedAt) AND attribute_not_exists(suppressionReason)",
            ExpressionAttributeNames: { "#state": "state" }, ExpressionAttributeValues: { ...proofValues, ":confirmed": "CONFIRMED", ":now": time, ":unsub": nonce(), ":audience": audienceKey(id), ...(renewing ? { ":hold": "HOLD", ":oldConfirmed": "CONFIRMED" } : {}) } } },
          ...(renewing ? [{ Update: { TableName, Key: { pk: pending.pk }, UpdateExpression: "SET #state = :done REMOVE confirmationNonce",
            ConditionExpression: proofCondition, ExpressionAttributeNames: { "#state": "state" }, ExpressionAttributeValues: { ...proofValues, ":done": "CONFIRMED" } } }] : []),
          { Put: { TableName, Item: { pk: `AUDIT#${id}#confirm#${tokenNonce}`, kind: "confirmed", at: time, consentVersion: CONSENT_VERSION, consentText: CONSENT_TEXT, enrollmentPolicy: ENROLLMENT_POLICY, requestedAt: pending.requestedAt, source: "mailbox-capability" }, ConditionExpression: "attribute_not_exists(pk)" } },
        ] }));
        return true;
      } catch (error) {
        if (error?.name === "TransactionCanceledException" && error.CancellationReasons?.[0]?.Code === "ConditionalCheckFailed") throw new Error("sending_paused");
        if (conditional(error)) return false;
        throw error;
      }
    },
    async suppress(id, email, reason, eventId, time) {
      // Audit insertion is separate and idempotent. Suppression itself never depends on an audit duplicate.
      await ddb.send(new UpdateCommand({ TableName, Key: { pk: `SUB#${id}` },
        UpdateExpression: "SET id = :id, email = if_not_exists(email, :email), #state = :state, suppressedAt = if_not_exists(suppressedAt, :now), suppressionReason = if_not_exists(suppressionReason, :reason) REMOVE audienceKey",
        ExpressionAttributeNames: { "#state": "state" }, ExpressionAttributeValues: { ":id": id, ":email": email, ":state": "SUPPRESSED", ":now": time, ":reason": reason } }));
      await store.putAbsent({ pk: `AUDIT#${id}#suppress#${eventId}`, kind: "suppressed", reason, at: time });
    },
    claim(pk, time) {
      return conditionalSend(new UpdateCommand({ TableName, Key: { pk },
        UpdateExpression: "SET #state = :claimed, createdAt = if_not_exists(createdAt, :now), attempts = if_not_exists(attempts, :zero) + :one",
        ConditionExpression: "attribute_not_exists(pk) OR (#state = :retry AND attempts < :max)",
        ExpressionAttributeNames: { "#state": "state" }, ExpressionAttributeValues: { ":claimed": "CLAIMED", ":retry": "RETRYABLE", ":now": time, ":zero": 0, ":one": 1, ":max": 3 } }));
    },
    deliveryResult(pk, state, messageId, time) {
      return conditionalSend(new UpdateCommand({ TableName, Key: { pk }, UpdateExpression: "SET #state = :state, updatedAt = :now" + (messageId ? ", messageId = :message" : ""),
        ConditionExpression: "#state = :claimed", ExpressionAttributeNames: { "#state": "state" }, ExpressionAttributeValues: { ":state": state, ":now": time, ":claimed": "CLAIMED", ...(messageId ? { ":message": messageId } : {}) } }));
    },
    deferUnsent(pk, time) {
      // Only a locally rejected lease acquisition can call this. No SES request
      // started, so contention must not consume the three SES-rejection attempts.
      return conditionalSend(new UpdateCommand({ TableName, Key: { pk },
        UpdateExpression: "SET #state = :retry, updatedAt = :now ADD attempts :minus",
        ConditionExpression: "#state = :claimed AND attempts >= :one",
        ExpressionAttributeNames: { "#state": "state" },
        ExpressionAttributeValues: { ":retry": "RETRYABLE", ":claimed": "CLAIMED", ":now": time, ":minus": -1, ":one": 1 } }));
    },
    async audience(shard, cursor) {
      const result = await ddb.send(new QueryCommand({ TableName, IndexName: "Audience", KeyConditionExpression: "audienceKey = :audience",
        ExpressionAttributeValues: { ":audience": `AUDIENCE#${shard}` }, Limit: 100, ExclusiveStartKey: cursor }));
      return { items: result.Items || [], cursor: result.LastEvaluatedKey };
    },
  };
  const ContactListName = env.CONTACT_LIST;
  const mail = {
    async contact(email) {
      try { return await ses.send(new GetContactCommand({ ContactListName, EmailAddress: email })); }
      catch (e) { if (e.name === "NotFoundException") return null; throw e; }
    },
    async accountSuppressed(email) {
      try { await ses.send(new GetSuppressedDestinationCommand({ EmailAddress: email })); return true; }
      catch (e) { if (e.name === "NotFoundException") return false; throw e; }
    },
    async createContact(email) {
      try { await ses.send(new CreateContactCommand({ ContactListName, EmailAddress: email, TopicPreferences: [{ TopicName: TOPIC, SubscriptionStatus: "OPT_IN" }] })); }
      catch (e) { if (e.name !== "AlreadyExistsException") throw e; }
    },
    optout: email => ses.send(new UpdateContactCommand({ ContactListName, EmailAddress: email, UnsubscribeAll: true, TopicPreferences: [{ TopicName: TOPIC, SubscriptionStatus: "OPT_OUT" }] })),
    async send(email, message, tags) {
      if (!["digest", "confirmation"].includes(tags.kind)) throw new Error("invalid_message");
      assertMailAllowed(env, await store.get("CONTROL"), tags.kind);
      emailAddress(email);
      const owner = nonce();
      if (!await store.acquireSendLease(owner, Date.now())) throw new SendCapacityUnavailable();
      try {
        // The gate is shared by confirmation and digest sends, including direct
        // adapter calls. Never wait with an old consent/suppression decision.
        assertMailAllowed(env, await store.get("CONTROL"), tags.kind);
        if (!/^[a-f0-9]{64}$/.test(tags.id || "")) throw new Error("invalid_message");
        const record = await store.get(`SUB#${tags.id}`);
        const renewal = tags.kind === "confirmation" ? await store.get(`RENEW#${tags.id}`) : undefined;
        if (record?.email !== email || record?.state === "SUPPRESSED" ||
            (tags.kind === "digest" ? !campaignEligible(record) : !pendingEnrollment(renewal || record)) ||
            record.suppressedAt !== undefined || record.suppressionReason !== undefined || await mail.accountSuppressed(email)) throw new Error("sending_paused");
        const contact = await mail.contact(email);
        if (contact?.UnsubscribeAll === true || contact?.TopicPreferences?.some(p => p.TopicName === TOPIC && p.SubscriptionStatus === "OPT_OUT") ||
            (tags.kind === "digest" && !contact?.TopicPreferences?.some(p => p.TopicName === TOPIC && p.SubscriptionStatus === "OPT_IN"))) throw new Error("sending_paused");
        if (tags.kind === "digest" && message.publicationCheck) await assertPublicationCurrent(store, message.publicationCheck.articles, Date.now(), message.publicationCheck.end);
        const result = await ses.send(new SendEmailCommand({ FromEmailAddress: env.SENDER_EMAIL, Destination: { ToAddresses: [email] }, ConfigurationSetName: env.CONFIGURATION_SET,
        Content: { Simple: { Subject: { Data: message.subject, Charset: "UTF-8" }, Body: { Html: { Data: message.html, Charset: "UTF-8" }, Text: { Data: message.text, Charset: "UTF-8" } },
          ...(tags.kind === "digest" && message.unsubscribeUrl ? { Headers: [
            { Name: "List-Unsubscribe", Value: `<${message.unsubscribeUrl}>` },
            { Name: "List-Unsubscribe-Post", Value: "List-Unsubscribe=One-Click" },
          ] } : {}) } },
        EmailTags: Object.entries(tags).map(([Name, Value]) => ({ Name, Value })),
        ...(tags.kind === "digest" ? { ListManagementOptions: { ContactListName, TopicName: TOPIC } } : {}) }));
        if (!result.MessageId) throw new Error("unknown_send_outcome"); return result.MessageId;
      } finally {
        // Release only our lease, after SES settles, with a full cooldown. Lost
        // acknowledgements keep delivery claims held; a crash keeps this lease.
        if (!await store.releaseSendLease(owner, Date.now())) throw new Error("send_gate_release_uncertain");
      }
    },
  };
  const enqueue = QueueUrl => body => sqs.send(new SendMessageCommand({ QueueUrl, MessageBody: JSON.stringify(body) }));
  return { store, mail, queue: { digest: enqueue(env.DIGEST_QUEUE_URL), plan: enqueue(env.PLAN_QUEUE_URL) },
    // No cache: disabling bridge access or restoring the original key takes effect promptly.
    secrets,
    now: () => Date.now(), articles: createContentSource(env, store, ses.config.credentials), wait: () => new Promise(resolve => setTimeout(resolve, 1000)),
    metric: emitNewsletterMetric,
    diagnostic: emitNewsletterDiagnostic,
  };
}
