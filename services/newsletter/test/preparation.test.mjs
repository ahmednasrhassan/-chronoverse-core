import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";
import { SESv2Client } from "@aws-sdk/client-sesv2";
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import { createAwsDependencies } from "../src/aws.mjs";
import { fixture } from "./fixture.mjs";

for (const field of ["registrationEnabled", "confirmationEnabled", "legacyRetired", "complianceApproved", "migrationComplete"]) {
  test(`durable ${field} must approve enrollment before pending consent or confirmation email`, async () => {
    for (const value of [undefined, null, false, "false", "true", "TRUE", 0, 1, [], {}]) {
      const f = fixture(); f.state.documents.get("CONTROL")[field] = value;
      const result = await f.subscribe("pending@example.test");
      assert.equal(result.statusCode, 503); assert.equal(JSON.parse(result.body).code, "sending_paused");
      assert.equal(f.state.documents.size, 1); assert.equal(f.state.rates.size, 0);
      assert.equal(f.state.sends.length, 0); assert.equal(f.state.contacts.size, 0);
    }
  });
}

test("direct SES adapter cannot send confirmation emails through a durable pause or incomplete recovery", async () => {
  const f = fixture(); let sends = 0;
  mock.method(DynamoDBDocumentClient.prototype, "send", async command => {
    assert.ok(command instanceof GetCommand); assert.equal(command.input.ConsistentRead, true);
    return { Item: structuredClone(f.state.documents.get("CONTROL")) };
  });
  mock.method(SESv2Client.prototype, "send", async () => { sends++; return { MessageId: "synthetic" }; });
  try {
    const deps = createAwsDependencies({ ...f.env, AWS_REGION: "eu-north-1", TABLE_NAME: "synthetic" });
    for (const field of ["confirmationEnabled", "migrationComplete"]) {
      const control = f.state.documents.get("CONTROL"); control[field] = false;
      await assert.rejects(() => deps.mail.send("pending@example.test", { subject: "Synthetic", text: "Synthetic", html: "Synthetic" }, { kind: "confirmation" }), /sending_paused/);
      control[field] = true;
    }
    assert.equal(sends, 0);
  } finally { mock.restoreAll(); }
});

test("dedicated secret contract reads named JSON keys only from the selected ARN using a mocked transport", async () => {
  const f = fixture(), calls = [];
  const env = { ...f.env, AWS_REGION: "eu-north-1", SECRETS_ARN: "arn:aws:secretsmanager:eu-north-1:000000000000:secret:synthetic-ABC123" };
  let synthetic = { capabilityKey: f.keys.capabilityKey, websiteKey: f.keys.websiteKey };
  mock.method(SecretsManagerClient.prototype, "send", async command => {
    assert.ok(command instanceof GetSecretValueCommand); calls.push(command.input);
    return { SecretString: JSON.stringify(synthetic) };
  });
  try {
    const deps = createAwsDependencies(env);
    assert.deepEqual(await deps.secrets(), synthetic);
    assert.deepEqual(Object.keys(await deps.secrets()).sort(), ["capabilityKey", "websiteKey"]);
    synthetic = { ...synthetic, legacyV1Key: f.keys.legacyV1Key };
    assert.deepEqual(await deps.secrets(), synthetic);
    assert.ok(calls.every(input => input.SecretId === env.SECRETS_ARN));
    assert.equal(f.state.sends.length, 0);
  } finally { mock.restoreAll(); }
});

test("SAM packages from the approved lockfile and references existing secret/identity without creating them", () => {
  const t = JSON.parse(readFileSync(new URL("../template.json", import.meta.url), "utf8"));
  const resources = Object.values(t.Resources);
  assert.equal(resources.filter(r => r.Type === "AWS::Serverless::Function").length, 5);
  for (const resource of resources.filter(r => r.Type === "AWS::Serverless::Function")) assert.equal(resource.Metadata.BuildProperties.UseNpmCi, true);
  assert.equal(resources.some(r => ["AWS::SecretsManager::Secret", "AWS::SES::EmailIdentity", "AWS::S3::Bucket"].includes(r.Type)), false);
  assert.deepEqual(t.Globals.Function.Environment.Variables.SECRETS_ARN, { Ref: "SecretsArn" });
  assert.equal(t.Parameters.PostalAddress.NoEcho, true);
  assert.equal(t.Resources.Contacts.Properties.Topics[0].Description, "Up to ten published research articles weekly");
  for (const name of ["DeliveryEnabled", "RegistrationEnabled", "ConfirmationEnabled", "LegacyDispatchRetired", "ComplianceApproved"]) assert.equal(t.Parameters[name].Default, "false");
});
