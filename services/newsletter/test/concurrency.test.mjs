import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { SESv2Client, SendEmailCommand, GetContactCommand, GetSuppressedDestinationCommand } from "@aws-sdk/client-sesv2";
import { createAwsDependencies } from "../src/aws.mjs";
import { createHandlers } from "../src/handlers.mjs";
import { SEND_LEASE_MS, SEND_COOLDOWN_MS, SendCapacityUnavailable } from "../src/domain.mjs";
import { fixture } from "./fixture.mjs";

const message = { subject: "Synthetic", text: "Synthetic", html: "Synthetic" };
function setup(t) {
  const f = fixture(), commands = [], sends = [];
  const state = { acquireFailure: null, releaseFailure: null, afterAcquire: null, send: null };
  t.after(() => mock.restoreAll());
  mock.method(Date, "now", () => f.state.time);
  const conditional = () => { throw Object.assign(new Error("synthetic condition"), { name: "ConditionalCheckFailedException" }); };
  mock.method(DynamoDBDocumentClient.prototype, "send", async command => {
    commands.push(command); const i = command.input, pk = i.Key?.pk;
    if (command instanceof GetCommand) {
      assert.equal(i.ConsistentRead, true); return { Item: structuredClone(f.state.documents.get(pk)) };
    }
    assert.ok(command instanceof UpdateCommand); const v = i.ExpressionAttributeValues;
    if (pk === "RATE#SES_SEND_GATE") {
      const row = f.state.documents.get(pk);
      if (i.UpdateExpression.includes("REMOVE leaseOwner")) {
        if (state.releaseFailure) throw state.releaseFailure;
        assert.equal(i.ConditionExpression, "leaseOwner = :owner");
        if (!row || row.leaseOwner !== v[":owner"]) return conditional();
        row.leaseUntil = v[":until"]; delete row.leaseOwner;
      } else {
        assert.equal(i.ConditionExpression, "attribute_not_exists(pk) OR leaseUntil <= :now");
        assert.equal(v[":until"] - v[":now"], SEND_LEASE_MS);
        if (row && !(typeof row.leaseUntil === "number" && row.leaseUntil <= v[":now"])) return conditional();
        f.state.documents.set(pk, { pk, leaseOwner: v[":owner"], leaseUntil: v[":until"] });
        state.afterAcquire?.();
        if (state.acquireFailure) throw state.acquireFailure;
      }
    } else {
      assert.match(i.UpdateExpression, /ADD attempts :minus/);
      assert.equal(i.ConditionExpression, "#state = :claimed AND attempts >= :one");
      const row = f.state.documents.get(pk);
      if (row?.state !== "CLAIMED" || row.attempts < 1) return conditional();
      row.state = v[":retry"]; row.attempts += v[":minus"];
    }
    return {};
  });
  mock.method(SESv2Client.prototype, "send", async function (command) {
    if (command instanceof GetContactCommand) return structuredClone(f.state.contacts.get(command.input.EmailAddress));
    if (command instanceof GetSuppressedDestinationCommand) {
      if (f.state.suppressed.has(command.input.EmailAddress)) return {};
      throw Object.assign(new Error("synthetic absent"), { name: "NotFoundException" });
    }
    assert.ok(command instanceof SendEmailCommand); assert.equal(await this.config.maxAttempts(), 1);
    sends.push({ at: f.state.time, input: command.input });
    return state.send ? state.send() : { MessageId: "synthetic-only" };
  });
  const env = { ...f.env, AWS_REGION: "eu-north-1", TABLE_NAME: "synthetic" };
  const a = createAwsDependencies(env), b = createAwsDependencies(env);
  Object.assign(f.deps.mail, a.mail); f.deps.store.deferUnsent = a.store.deferUnsent;
  const send = (deps, job, kind = "digest") => deps.mail.send(f.state.documents.get(`SUB#${job.id}`).email, message, { kind, id: job.id });
  return { f, state, commands, sends, a, b, send };
}

test("template supports quota ten without reservations; SQS caps are two, not sequential", () => {
  const t = JSON.parse(readFileSync(new URL("../template.json", import.meta.url), "utf8"));
  assert.equal(Object.values(t.Resources).filter(r => r.Type === "AWS::Serverless::Function").length, 5);
  for (const r of Object.values(t.Resources).filter(r => r.Type === "AWS::Serverless::Function")) {
    assert.equal(r.Properties.ReservedConcurrentExecutions, undefined);
    assert.equal(r.Properties.ProvisionedConcurrencyConfig, undefined);
    assert.ok((r.Properties.Timeout || t.Globals.Function.Timeout) * 2000 <= SEND_LEASE_MS);
  }
  assert.equal(t.Globals.Function.ReservedConcurrentExecutions, undefined);
  for (const name of ["PlannerMapping", "WorkerMapping", "FeedbackMapping"]) {
    const p = t.Resources[name].Properties;
    assert.deepEqual(p.ScalingConfig, { MaximumConcurrency: 2 });
    assert.equal(p.BatchSize, 1); assert.deepEqual(p.FunctionResponseTypes, ["ReportBatchItemFailures"]);
  }
  for (const name of ["PlanQueue", "DigestQueue", "FeedbackQueue"]) {
    const p = t.Resources[name].Properties;
    assert.ok(p.VisibilityTimeout >= 6 * t.Globals.Function.Timeout);
    assert.equal(p.RedrivePolicy.maxReceiveCount, 5); assert.equal(p.MessageRetentionPeriod, 1209600);
  }
  assert.equal(t.Resources.ContactsMapping.Properties.ParallelizationFactor, 1);
  assert.equal(t.Resources.ContactsMapping.Properties.StartingPosition, "TRIM_HORIZON");
  assert.equal(t.Resources.ContactsMapping.Properties.Enabled, undefined);
  assert.equal(t.Resources.FeedbackMapping.Properties.Enabled, true);
  for (const name of ["DeliveryEnabled", "RegistrationEnabled", "ConfirmationEnabled", "LegacyDispatchRetired", "ComplianceApproved"]) assert.equal(t.Parameters[name].Default, "false");
});

test("separate runtimes and distinct subscribers share one SES lease and post-send cooldown", async t => {
  const { f, state, sends, a, b, send } = setup(t);
  const first = f.confirmed(), second = f.confirmed("second@example.test");
  let finish, entered; const started = new Promise(resolve => { entered = resolve; });
  state.send = () => { entered(); return new Promise(resolve => { finish = resolve; }); };
  const inFlight = send(a, first); await started;
  await assert.rejects(() => send(b, second), SendCapacityUnavailable);
  finish({ MessageId: "synthetic-only" }); await inFlight;
  assert.equal(sends.length, 1);
  f.state.time += SEND_COOLDOWN_MS - 1;
  await assert.rejects(() => send(b, second), SendCapacityUnavailable);
  f.state.time++; state.send = null;
  await send(b, second); assert.equal(sends.length, 2);
  assert.ok(sends[1].at - sends[0].at >= SEND_COOLDOWN_MS);
  assert.equal(f.state.documents.get("RATE#SES_SEND_GATE").expiresAt, undefined);
});

test("confirmation and digest mail share the capacity gate; a corrupt gate fails closed", async t => {
  const { f, a, b, send, sends } = setup(t);
  const digest = f.confirmed(), pending = f.confirmed("pending@example.test");
  f.state.documents.get(`SUB#${pending.id}`).state = "PENDING";
  await send(a, digest);
  await assert.rejects(() => send(b, pending, "confirmation"), SendCapacityUnavailable);
  f.state.time += SEND_COOLDOWN_MS; await send(b, pending, "confirmation");
  f.state.documents.set("RATE#SES_SEND_GATE", { pk: "RATE#SES_SEND_GATE", leaseUntil: "malformed" });
  f.state.time += SEND_LEASE_MS;
  await assert.rejects(() => send(a, digest), SendCapacityUnavailable);
  assert.equal(sends.length, 2);
});

test("abandoned lease blocks until expiry; a stale owner cannot release a new owner's lease", async t => {
  const { f, a, b } = setup(t);
  assert.equal(await a.store.acquireSendLease("synthetic-owner-a", f.state.time), true);
  f.state.time += SEND_LEASE_MS - 1;
  assert.equal(await b.store.acquireSendLease("synthetic-owner-b", f.state.time), false);
  f.state.time++;
  assert.equal(await b.store.acquireSendLease("synthetic-owner-b", f.state.time), true);
  assert.equal(await a.store.releaseSendLease("synthetic-owner-a", f.state.time), false);
  assert.equal(f.state.documents.get("RATE#SES_SEND_GATE").leaseOwner, "synthetic-owner-b");
});

test("capacity contention retries without consuming SES attempts; duplicate workers still send once", async t => {
  const { f, sends, a } = setup(t), job = f.confirmed(), key = `MAIL#${job.campaign}#${job.id}`;
  await a.store.acquireSendLease("synthetic-other", f.state.time);
  for (let n = 0; n < 5; n++) {
    await assert.rejects(() => f.service.deliver(job), /send_capacity_retry_required/);
    assert.equal(f.state.documents.get(key).attempts, 0);
    assert.equal(f.state.documents.get(key).state, "RETRYABLE");
  }
  assert.equal(sends.length, 0);
  f.state.time += SEND_LEASE_MS;
  await Promise.all([f.service.deliver(job), f.service.deliver(job), f.service.deliver(job)]);
  assert.equal(sends.length, 1); assert.equal(f.state.documents.get(key).state, "ACCEPTED");
  await f.service.deliver(job); assert.equal(sends.length, 1);
});

test("lost lease-acquisition acknowledgement and uncertain SES/release outcomes stay held", async t => {
  const { f, state, sends } = setup(t), job = f.confirmed(), key = `MAIL#${job.campaign}#${job.id}`;
  state.acquireFailure = new Error("synthetic-lost-ack");
  await f.service.deliver(job); assert.equal(sends.length, 0);
  assert.equal(f.state.documents.get(key).state, "UNKNOWN");
  state.acquireFailure = null; f.state.time += SEND_LEASE_MS;
  await f.service.deliver(job); assert.equal(sends.length, 0);
  const next = f.confirmed("next@example.test");
  state.releaseFailure = new Error("synthetic-lost-release-ack");
  await f.service.deliver(next);
  assert.equal(sends.length, 1);
  assert.equal(f.state.documents.get(`MAIL#${next.campaign}#${next.id}`).state, "UNKNOWN");
  f.state.time += SEND_LEASE_MS; state.releaseFailure = null;
  await f.service.deliver(next); assert.equal(sends.length, 1);
});

test("SES explicit 429 keeps its bounded retry budget independently of local contention", async t => {
  const { f, state, sends } = setup(t), job = f.confirmed();
  state.send = () => { throw Object.assign(new Error("synthetic-throttle"), { name: "TooManyRequestsException", $metadata: { httpStatusCode: 429 } }); };
  for (let n = 0; n < 3; n++) {
    await assert.rejects(() => f.service.deliver(job), /retryable_rejection/);
    f.state.time += SEND_COOLDOWN_MS;
  }
  await f.service.deliver(job);
  assert.equal(sends.length, 3); assert.equal(f.state.documents.get(`MAIL#${job.campaign}#${job.id}`).attempts, 3);
});

test("pause, ledger suppression and provider opt-out racing lease acquisition deny SES", async t => {
  const { f, state, a, send, sends } = setup(t), job = f.confirmed();
  const control = f.state.documents.get("CONTROL");
  for (const mode of ["pause", "ledger", "provider", "topic"]) {
    f.state.documents.delete("RATE#SES_SEND_GATE");
    const row = f.state.documents.get(`SUB#${job.id}`); row.state = "CONFIRMED";
    control.deliveryEnabled = true; f.state.suppressed.clear();
    f.state.contacts.get(row.email).UnsubscribeAll = false;
    state.afterAcquire = () => {
      if (mode === "pause") control.deliveryEnabled = false;
      if (mode === "ledger") row.state = "SUPPRESSED";
      if (mode === "provider") f.state.suppressed.add(row.email);
      if (mode === "topic") f.state.contacts.get(row.email).UnsubscribeAll = true;
    };
    await assert.rejects(() => send(a, job), /sending_paused/);
  }
  assert.equal(sends.length, 0);
});

test("busy send capacity and disabled mail never block unsubscribe, complaint or contact safety processing", async t => {
  const { f, sends, a } = setup(t), job = f.confirmed();
  await a.store.acquireSendLease("synthetic-blocker", f.state.time);
  for (const flag of ["DELIVERY_ENABLED", "REGISTRATION_ENABLED", "CONFIRMATION_ENABLED", "LEGACY_DISPATCH_RETIRED", "COMPLIANCE_APPROVED"]) f.env[flag] = "false";
  f.state.documents.delete("CONTROL");
  assert.equal((await f.api("/unsubscribe", { token: f.token(job.id) })).statusCode, 200);
  assert.equal(f.state.documents.get(`SUB#${job.id}`).state, "SUPPRESSED");
  const other = f.confirmed("complaint@example.test");
  await f.service.feedback({ Type: "Notification", TopicArn: f.env.FEEDBACK_TOPIC_ARN, MessageId: "synthetic", Message: JSON.stringify({ eventType: "Complaint", complaint: { complainedRecipients: [{ emailAddress: "complaint@example.test" }] } }) });
  assert.equal(f.state.documents.get(`SUB#${other.id}`).state, "SUPPRESSED");
  // Use the existing contact-safety fixture transport; this test must never send.
  let optedOut = false; f.deps.mail.optout = async email => { optedOut = true; f.state.contacts.set(email, { UnsubscribeAll: true }); };
  await f.service.sync(other.id); assert.equal(optedOut, true); assert.equal(sends.length, 0);
});

test("partial SQS capacity failures stay retryable; later opt-out and campaign expiry prevent sending", async t => {
  const { f, a, sends } = setup(t), job = f.confirmed();
  await a.store.acquireSendLease("synthetic-blocker", f.state.time);
  const handlers = createHandlers(f.service, f.env);
  const event = { Records: [{ eventSourceARN: "digest", eventSource: "aws:sqs", messageId: "synthetic", body: JSON.stringify(job) }] };
  assert.deepEqual(await handlers.worker(event), { batchItemFailures: [{ itemIdentifier: "synthetic" }] });
  await f.api("/unsubscribe", { token: f.token(job.id) }); f.state.time += SEND_LEASE_MS;
  assert.deepEqual(await handlers.worker(event), { batchItemFailures: [] });
  const stale = f.confirmed("stale@example.test"); f.state.time += 4 * 86400000;
  await f.service.deliver(stale); assert.equal(sends.length, 0);
});

test("confirmation capacity rejection is truthful and never activates pending consent", async t => {
  const { f, a, sends } = setup(t);
  await a.store.acquireSendLease("synthetic-blocker", f.state.time);
  assert.equal((await f.subscribe("pending@example.test")).statusCode, 503);
  const record = [...f.state.documents.values()].find(row => row.email === "pending@example.test");
  assert.equal(record.state, "PENDING"); assert.equal(record.audienceKey, undefined);
  const claim = [...f.state.documents.values()].find(row => row.pk?.startsWith("MAIL#confirmation#"));
  assert.equal(claim.state, "NOT_SENT"); assert.equal(sends.length, 0);
});

test("SDK timeouts and lookalike capacity errors cannot refund claims or allow resending", async t => {
  const { f, state, sends } = setup(t);
  for (const error of [new Error("synthetic-timeout"), Object.assign(new Error("send_capacity_unavailable"), { name: "SendCapacityUnavailable" })]) {
    const job = f.confirmed(`held-${sends.length}@example.test`);
    state.send = () => { throw error; };
    await f.service.deliver(job); f.state.time += SEND_LEASE_MS;
    await f.service.deliver(job);
    const claim = f.state.documents.get(`MAIL#${job.campaign}#${job.id}`);
    assert.equal(claim.state, "UNKNOWN"); assert.equal(claim.attempts, 1);
  }
  assert.equal(sends.length, 2);
});

test("local capacity deferral cannot reset accepted, unknown or already deferred claims", async t => {
  const { f, a } = setup(t);
  for (const state of ["ACCEPTED", "UNKNOWN", "RETRYABLE"]) {
    const pk = `MAIL#synthetic#${state}`, row = { pk, state, attempts: 1 };
    f.state.documents.set(pk, row);
    assert.equal(await a.store.deferUnsent(pk, f.state.time), false);
    assert.equal(row.state, state); assert.equal(row.attempts, 1);
  }
});
