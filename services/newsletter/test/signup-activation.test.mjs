import test from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./fixture.mjs";
import { subscriberId, TOPIC } from "../src/domain.mjs";
import { createHandlers } from "../src/handlers.mjs";

for (const mode of ["SES timeout", "SES rejection", "lost acceptance acknowledgement", "acceptance write declined", "acceptance committed then acknowledgement lost"]) {
  test(`confirmation reports unavailable for ${mode}, preserves pending consent and never automatically resends`, async () => {
    const f = fixture(), email = "reader@example.test", id = subscriberId(email);
    const save = f.deps.store.deliveryResult;
    if (mode === "SES timeout") f.state.sendError = new Error("synthetic_timeout");
    if (mode === "SES rejection") f.state.sendError = Object.assign(new Error("synthetic_rejection"), { name: "MessageRejected" });
    if (mode === "lost acceptance acknowledgement") f.state.lostAck = true;
    if (mode === "acceptance write declined") f.deps.store.deliveryResult = (...args) => args[1] === "ACCEPTED" ? false : save(...args);
    if (mode === "acceptance committed then acknowledgement lost") f.deps.store.deliveryResult = async (...args) => {
      const result = await save(...args);
      if (args[1] === "ACCEPTED") throw new Error("synthetic_lost_ack");
      return result;
    };
    const result = await f.subscribe(email);
    assert.equal(result.statusCode, 503);
    assert.deepEqual(JSON.parse(result.body), { code: "temporarily_unavailable" });
    const row = f.state.documents.get(`SUB#${id}`);
    assert.equal(row.state, "PENDING"); assert.equal(row.audienceKey, undefined);
    assert.equal(f.state.contacts.size, 0); assert.equal(f.state.sends.length, 1);
    const claim = f.state.documents.get(`MAIL#confirmation#${id}#${row.confirmationNonce}`);
    assert.ok(["UNKNOWN", "CLAIMED", "ACCEPTED"].includes(claim.state));
    assert.equal(claim.attempts, 1); assert.ok(!f.state.metrics.includes("Accepted"));
    await f.subscribe(email);
    assert.equal(f.state.sends.length, 1); assert.equal(claim.attempts, 1);
    assert.equal(f.state.documents.get(`SUB#${id}`).state, "PENDING");
  });
}

test("independent public registration does not show check-inbox success after an SES failure", async () => {
  const f = fixture(); f.state.sendError = new Error("synthetic_timeout");
  const response = await f.service.api({ version: "2.0", routeKey: "POST /register", rawPath: "/register", rawQueryString: "",
    requestContext: { http: { method: "POST", sourceIp: "192.0.2.10" } },
    headers: { origin: f.env.PUBLIC_ORIGIN, "content-type": "application/x-www-form-urlencoded" },
    body: "email=reader%40example.test&consent=yes" });
  assert.equal(response.statusCode, 503); assert.match(response.body, /Request unavailable/);
  assert.doesNotMatch(response.body, /Check your inbox|Subscription confirmed|synthetic_timeout|reader@example/);
  assert.equal(f.state.documents.get(`SUB#${subscriberId("reader@example.test")}`).state, "PENDING");
});

for (const type of ["Complaint", "Bounce", "Subscription"]) {
  test(`SNS-in-SQS ${type} retries failed suppression, remains active with sending off and never reactivates a subscriber`, async () => {
    const f = fixture(), email = "reader@example.test", job = f.confirmed(email);
    for (const key of ["DELIVERY_ENABLED", "REGISTRATION_ENABLED", "CONFIRMATION_ENABLED", "LEGACY_DISPATCH_RETIRED", "COMPLIANCE_APPROVED"]) f.env[key] = "false";
    Object.assign(f.state.documents.get("CONTROL"), { deliveryEnabled: false, registrationEnabled: false, confirmationEnabled: false });
    const handlers = createHandlers(f.service, f.env);
    const event = { eventType: type, mail: { destination: [email] },
      complaint: { complainedRecipients: [{ emailAddress: email }] },
      bounce: { bounceType: "Permanent", bouncedRecipients: [{ emailAddress: email }] },
      subscription: { contactList: f.env.CONTACT_LIST, newTopicPreferences: { unsubscribeAll: true } } };
    const envelope = { Type: "Notification", TopicArn: f.env.FEEDBACK_TOPIC_ARN, MessageId: `synthetic-${type}`, Message: JSON.stringify(event) };
    const batch = { Records: [{ eventSource: "aws:sqs", eventSourceARN: f.env.FEEDBACK_QUEUE_ARN, messageId: "synthetic-record", body: JSON.stringify(envelope) }] };
    const suppress = f.deps.store.suppress;
    f.deps.store.suppress = async () => { throw new Error("synthetic_storage_outage"); };
    assert.deepEqual(await handlers.feedback(batch), { batchItemFailures: [{ itemIdentifier: "synthetic-record" }] });
    assert.equal(f.state.documents.get(`SUB#${job.id}`).state, "CONFIRMED");
    assert.equal([...f.state.documents.keys()].filter(key => key.startsWith("EVENT#")).length, 0);
    f.deps.store.suppress = suppress;
    assert.deepEqual(await handlers.feedback(batch), { batchItemFailures: [] });
    const saved = structuredClone(f.state.documents.get(`SUB#${job.id}`));
    assert.equal(saved.state, "SUPPRESSED"); assert.equal(saved.audienceKey, undefined);
    f.state.time += 2000;
    assert.deepEqual(await handlers.feedback(batch), { batchItemFailures: [] });
    assert.deepEqual(f.state.documents.get(`SUB#${job.id}`), saved);
    const stream = { Records: [{ eventSource: "aws:dynamodb", eventSourceARN: f.env.TABLE_STREAM_ARN, eventName: "MODIFY",
      dynamodb: { Keys: { pk: { S: `SUB#${job.id}` } }, SequenceNumber: "synthetic-sequence" } }] };
    assert.deepEqual(await handlers.contacts(stream), { batchItemFailures: [] });
    assert.equal(f.state.contacts.get(email).UnsubscribeAll, true);
    await f.service.feedback({ ...envelope, MessageId: "synthetic-provider-optin", Message: JSON.stringify({ eventType: "Subscription",
      mail: { destination: [email] }, subscription: { contactList: f.env.CONTACT_LIST,
        newTopicPreferences: { unsubscribeAll: false, topicSubscriptionStatus: [{ topicName: TOPIC, subscriptionStatus: "OptIn" }] } } }) });
    assert.deepEqual(f.state.documents.get(`SUB#${job.id}`), saved);
    assert.equal((await f.subscribe(email)).statusCode, 503); assert.equal(f.state.sends.length, 0);
  });
}
