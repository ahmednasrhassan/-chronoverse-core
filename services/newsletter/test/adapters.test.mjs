import test from "node:test";
import assert from "node:assert/strict";
import { mock } from "node:test";
import { DynamoDBDocumentClient, GetCommand, TransactWriteCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { SESv2Client, SendEmailCommand, CreateContactCommand, UpdateContactCommand, GetSuppressedDestinationCommand, GetContactCommand } from "@aws-sdk/client-sesv2";
import { createAwsDependencies } from "../src/aws.mjs";
import { fixture } from "./fixture.mjs";

test("actual SESv2 adapter enforces gates even for direct internal calls and SDK retries are one", async () => {
  const f = fixture(), job = f.confirmed(); const commands = []; const attempts = [];
  mock.method(DynamoDBDocumentClient.prototype, "send", async command => {
    if (command instanceof UpdateCommand) return {};
    assert.ok(command instanceof GetCommand); assert.equal(command.input.ConsistentRead, true);
    return { Item: f.state.documents.get(command.input.Key.pk) };
  });
  mock.method(SESv2Client.prototype, "send", async function (command) {
    if (command instanceof GetSuppressedDestinationCommand) throw Object.assign(new Error("synthetic"), { name: "NotFoundException" });
    if (command instanceof GetContactCommand) return f.state.contacts.get(command.input.EmailAddress);
    attempts.push(await this.config.maxAttempts()); commands.push(command); return { MessageId: "synthetic-only" };
  });
  try {
    const env = { ...f.env, AWS_REGION: "eu-west-1", TABLE_NAME: "synthetic" };
    const deps = createAwsDependencies(env);
    delete env.DELIVERY_ENABLED;
    await assert.rejects(() => deps.mail.send("reader@example.test", { subject: "Synthetic", text: "Synthetic", html: "Synthetic" }, { kind: "digest" }), /sending_paused/);
    assert.equal(commands.length, 0);
    env.DELIVERY_ENABLED = "true";
    await deps.mail.send("reader@example.test", { subject: "Synthetic", text: "Synthetic", html: "Synthetic" }, { kind: "digest", id: job.id });
    assert.ok(commands[0] instanceof SendEmailCommand);
    assert.deepEqual(commands[0].input.Destination, { ToAddresses: ["reader@example.test"] });
    assert.equal(commands[0].input.ListManagementOptions.ContactListName, env.CONTACT_LIST);
    assert.equal(commands[0].input.ConfigurationSetName, env.CONFIGURATION_SET); assert.deepEqual(attempts, [1]);
    f.state.documents.get(`SUB#${job.id}`).state = "PENDING";
    await deps.mail.send("reader@example.test", { subject: "Confirm", text: "Fixture", html: "Fixture" }, { kind: "confirmation", id: job.id });
    assert.equal(commands[1].input.ListManagementOptions, undefined);
  } finally { mock.restoreAll(); }
});
test("actual DynamoDB adapter uses atomic consent transactions, immutable first suppression and conditional delivery claims", async () => {
  const f = fixture(); const commands = [];
  mock.method(DynamoDBDocumentClient.prototype, "send", async command => { commands.push(command); return {}; });
  try {
    const deps = createAwsDependencies({ ...f.env, AWS_REGION: "eu-west-1", TABLE_NAME: "synthetic" });
    const row = { pk: "SUB#fixture", id: "fixture", confirmationNonce: "nonce", consentVersion: "fixture-version", consentText: "Fixture consent", requestedAt: 1, source: "fixture-source", state: "PENDING" };
    await deps.store.pending(row);
    assert.ok(commands[0] instanceof TransactWriteCommand); assert.equal(commands[0].input.TransactItems.length, 2);
    assert.match(commands[0].input.TransactItems[0].Put.ConditionExpression, /attribute_not_exists/);
    assert.equal(commands[0].input.TransactItems[1].Put.Item.consentText, "Fixture consent");
    await deps.store.suppress("0".repeat(64), "reader@example.test", "unsubscribe", "fixture", 1);
    const suppression = commands[1]; assert.ok(suppression instanceof UpdateCommand);
    assert.match(suppression.input.UpdateExpression, /if_not_exists\(suppressionReason/); assert.match(suppression.input.UpdateExpression, /REMOVE audienceKey/);
    await deps.store.claim("MAIL#fixture", 1);
    assert.match(commands.at(-1).input.ConditionExpression, /attribute_not_exists\(pk\).*attempts < :max/);
    assert.equal(commands.at(-1).input.ExpressionAttributeValues[":max"], 3);
  } finally { mock.restoreAll(); }
});
test("SES contact adapter never requests reactivation of an existing contact", async () => {
  const f = fixture(); const commands = [];
  mock.method(SESv2Client.prototype, "send", async command => { commands.push(command); return {}; });
  try {
    const deps = createAwsDependencies({ ...f.env, AWS_REGION: "eu-west-1" });
    await deps.mail.createContact("reader@example.test"); await deps.mail.optout("reader@example.test");
    assert.ok(commands[0] instanceof CreateContactCommand); assert.equal(commands[0].input.UnsubscribeAll, undefined);
    assert.ok(commands[1] instanceof UpdateContactCommand); assert.equal(commands[1].input.UnsubscribeAll, true);
    assert.equal(commands[1].input.TopicPreferences[0].SubscriptionStatus, "OPT_OUT");
  } finally { mock.restoreAll(); }
});
