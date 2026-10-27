import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DynamoDBDocumentClient, GetCommand, TransactWriteCommand } from "@aws-sdk/lib-dynamodb";
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import { createAwsDependencies } from "../src/aws.mjs";
import { createService } from "../src/service.mjs";
import { subscriberId, CONSENT_TEXT, CONSENT_VERSION, ENROLLMENT_POLICY, FORWARD_ONLY_STATUS, campaignEligible } from "../src/domain.mjs";
import { fixture } from "./fixture.mjs";

const flags = ["REGISTRATION_ENABLED", "CONFIRMATION_ENABLED", "LEGACY_DISPATCH_RETIRED", "COMPLIANCE_APPROVED"];
const controls = ["registrationEnabled", "confirmationEnabled", "legacyRetired", "complianceApproved", "migrationComplete"];
const malformed = [undefined, null, false, "false", "true", "TRUE", 0, 1, [], {}];

test("DynamoDB forward-only confirmation binds the receipt atomically and preserves unresolved historical recovery", async () => {
  const f = fixture(), p = pending(f);
  Object.assign(f.state.documents.get("CONTROL"), { migrationComplete: false, forwardOnlyReady: true, forwardOnlyPolicy: ENROLLMENT_POLICY,
    historicalRecoveryStatus: FORWARD_ONLY_STATUS, forwardOnlyReceipt: "a".repeat(64) });
  await withAdapter(f, async (deps, commands) => {
    assert.equal(await deps.store.confirm(p.token), true);
    assert.equal(campaignEligible(f.state.documents.get(p.row.pk)), true);
    const check = commands.find(c => c instanceof TransactWriteCommand).input.TransactItems[0].ConditionCheck;
    assert.match(check.ConditionExpression, /forwardOnlyReceipt = :receipt/);
    assert.equal(check.ExpressionAttributeValues[":receipt"], "a".repeat(64));
    assert.equal(f.state.documents.get("CONTROL").migrationComplete, false);
  });
});
for (const field of ["forwardOnlyReady", "forwardOnlyPolicy", "historicalRecoveryStatus", "forwardOnlyReceipt"]) test(`revoking forward-only ${field} between read and transaction prevents confirmation`, async () => {
  const f = fixture(), p = pending(f), original = structuredClone(p.row);
  Object.assign(f.state.documents.get("CONTROL"), { migrationComplete: false, forwardOnlyReady: true, forwardOnlyPolicy: ENROLLMENT_POLICY,
    historicalRecoveryStatus: FORWARD_ONLY_STATUS, forwardOnlyReceipt: "a".repeat(64) });
  await withAdapter(f, async deps => {
    await assert.rejects(() => deps.store.confirm(p.token), /sending_paused/);
    assert.deepEqual(f.state.documents.get(p.row.pk), original);
  }, { beforeTransaction: () => { delete f.state.documents.get("CONTROL")[field]; } });
});

function pending(f) {
  const email = "pending@example.test", id = subscriberId(email);
  const row = { pk: `SUB#${id}`, id, email, state: "PENDING", confirmationNonce: "p".repeat(32), enrollmentPolicy: ENROLLMENT_POLICY, consentVersion: CONSENT_VERSION, consentText: CONSENT_TEXT, requestedAt: f.state.time - 1000 };
  f.state.documents.set(row.pk, row);
  return { id, row, token: f.token(id, "confirm", row.confirmationNonce, f.state.time + 60000) };
}

// A small synthetic command model, not a DynamoDB integration test. Conditions
// are evaluated from the actual SDK command, before any transaction write.
function matches(operation, row) {
  return operation.ConditionExpression.split(" AND ").every(atom => {
    if (atom.startsWith("(") && atom.endsWith(")")) return atom.slice(1, -1).split(" OR ").some(part => matches({ ...operation, ConditionExpression: part }, row));
    const exists = /^attribute_exists\((\w+)\)$/.exec(atom);
    if (exists) return !!row && Object.hasOwn(row, exists[1]);
    const absent = /^attribute_not_exists\((\w+)\)$/.exec(atom);
    if (absent) return !row || !Object.hasOwn(row, absent[1]);
    const equals = /^(#?\w+) = (:\w+)$/.exec(atom);
    assert.ok(equals, `Unsupported test condition: ${atom}`);
    const attribute = operation.ExpressionAttributeNames?.[equals[1]] || equals[1];
    return row?.[attribute] === operation.ExpressionAttributeValues[equals[2]];
  });
}
async function withAdapter(f, run, hooks = {}) {
  const commands = [];
  mock.method(Date, "now", () => f.state.time);
  mock.method(SecretsManagerClient.prototype, "send", async command => {
    assert.ok(command instanceof GetSecretValueCommand);
    assert.equal(command.input.SecretId, "synthetic-secret");
    await hooks.beforeSecret?.();
    return { SecretString: JSON.stringify(f.keys) };
  });
  mock.method(DynamoDBDocumentClient.prototype, "send", async command => {
    commands.push(command);
    if (command instanceof GetCommand) {
      assert.equal(command.input.ConsistentRead, true);
      const Item = structuredClone(f.state.documents.get(command.input.Key.pk));
      await hooks.afterGet?.();
      return { Item };
    }
    assert.ok(command instanceof TransactWriteCommand);
    await hooks.beforeTransaction?.();
    const operations = command.input.TransactItems.map(item => Object.values(item)[0]);
    const reasons = operations.map(operation => ({ Code: matches(operation, f.state.documents.get(operation.Key?.pk || operation.Item.pk)) ? "None" : "ConditionalCheckFailed" }));
    if (reasons.some(reason => reason.Code !== "None")) throw Object.assign(new Error("synthetic_condition_failed"), { name: "TransactionCanceledException", CancellationReasons: reasons });
    for (const item of command.input.TransactItems) {
      if (item.Put) { f.state.documents.set(item.Put.Item.pk, structuredClone(item.Put.Item)); continue; }
      if (!item.Update) continue;
      const update = item.Update, row = f.state.documents.get(update.Key.pk);
      const [set, remove] = update.UpdateExpression.slice(4).split(" REMOVE ");
      for (const assignment of set.split(/, (?![^()]*\))/)) {
        const [name, value] = assignment.split(" = ");
        const fallback = /^if_not_exists\((\w+), (:\w+)\)$/.exec(value);
        row[update.ExpressionAttributeNames?.[name] || name] = fallback ? row[fallback[1]] ?? update.ExpressionAttributeValues[fallback[2]] : update.ExpressionAttributeValues[value];
      }
      for (const name of remove?.split(", ") || []) delete row[name];
    }
    return {};
  });
  try {
    const env = { ...f.env, AWS_REGION: "eu-north-1", TABLE_NAME: "synthetic-ledger", SECRETS_ARN: "synthetic-secret" };
    await run(createAwsDependencies(env), commands, env);
  } finally { mock.restoreAll(); }
}

for (const flag of flags) test(`confirmation service denies missing, false and malformed ${flag}`, async () => {
  for (const value of malformed.filter(value => value !== "true")) {
    const f = fixture(), p = pending(f), before = structuredClone(p.row);
    f.env[flag] = value;
    assert.equal((await f.api("/confirm", { token: p.token })).statusCode, 503);
    assert.deepEqual(f.state.documents.get(p.row.pk), before);
    assert.equal(f.state.sends.length, 0); assert.equal(f.state.contacts.size, 0);
  }
});
for (const name of controls) test(`confirmation service denies missing, false and malformed CONTROL.${name}`, async () => {
  for (const value of malformed) {
    const f = fixture(), p = pending(f), before = structuredClone(p.row);
    f.state.documents.get("CONTROL")[name] = value;
    assert.equal((await f.api("/confirm", { token: p.token })).statusCode, 503);
    assert.deepEqual(f.state.documents.get(p.row.pk), before); assert.equal(f.state.sends.length, 0);
  }
});
test("absent or malformed CONTROL denies an issued pending link without creating records", async () => {
  for (const control of [undefined, null, false, "approved", [], {}]) {
    const f = fixture(), p = pending(f);
    f.state.documents.set("CONTROL", control);
    assert.equal((await f.api("/confirm", { token: p.token })).statusCode, 503);
    assert.equal(p.row.state, "PENDING"); assert.equal(f.state.documents.size, 2);
  }
});
test("simultaneous HTTP-handler confirmations consume a pending capability once", async () => {
  const f = fixture(), p = pending(f);
  const results = await Promise.all(Array.from({ length: 12 }, () => f.api("/confirm", { token: p.token })));
  assert.equal(results.filter(result => result.statusCode === 200).length, 1);
  assert.equal(results.filter(result => result.statusCode === 400).length, 11);
  const before = structuredClone(p.row);
  assert.equal((await f.api("/confirm", { token: p.token })).statusCode, 400);
  assert.deepEqual(p.row, before); assert.equal(p.row.confirmationNonce, undefined); assert.equal(f.state.sends.length, 0);
});
test("provider suppression racing confirmation prevents consent activation", async () => {
  for (const mode of ["account", "topic"]) {
    const f = fixture(), p = pending(f);
    if (mode === "account") f.state.suppressed.add(p.row.email);
    else f.state.contacts.set(p.row.email, { UnsubscribeAll: true });
    assert.equal((await f.api("/confirm", { token: p.token })).statusCode, 400);
    assert.equal(f.state.documents.get(p.row.pk).state, "SUPPRESSED");
    assert.equal(f.state.documents.get(p.row.pk).audienceKey, undefined); assert.equal(f.state.sends.length, 0);
  }
});

test("direct persistence calls enforce every runtime activation flag strictly", async () => {
  const f = fixture(), p = pending(f);
  await withAdapter(f, async (deps, commands, env) => {
    for (const flag of flags) {
      for (const value of malformed.filter(value => value !== "true")) {
        env[flag] = value;
        await assert.rejects(() => deps.store.confirm(p.token), /sending_paused/);
        assert.equal(p.row.state, "PENDING");
      }
      env[flag] = "true";
    }
    assert.ok(commands.every(command => command instanceof GetCommand));
  });
});
test("direct persistence calls enforce every durable activation field strictly", async () => {
  const f = fixture(), p = pending(f);
  await withAdapter(f, async (deps, commands) => {
    for (const name of controls) {
      for (const value of malformed) {
        f.state.documents.get("CONTROL")[name] = value;
        await assert.rejects(() => deps.store.confirm(p.token), /sending_paused/);
        assert.equal(p.row.state, "PENDING");
      }
      f.state.documents.get("CONTROL")[name] = true;
    }
    f.state.documents.delete("CONTROL");
    await assert.rejects(() => deps.store.confirm(p.token), /sending_paused/);
    assert.ok(commands.every(command => command instanceof GetCommand));
  });
});
test("persistence revalidates token signature, purpose and expiry instead of trusting internal callers", async () => {
  const f = fixture(), p = pending(f);
  await withAdapter(f, async (deps, commands) => {
    const tampered = p.token.slice(0, -1) + (p.token.endsWith("a") ? "b" : "a");
    for (const token of [undefined, "v1.invalid", p.token + "x", tampered, f.token(p.id), f.token(p.id, "confirm", p.row.confirmationNonce, f.state.time)]) {
      await assert.rejects(() => deps.store.confirm(token), /invalid_link/);
    }
    assert.ok(commands.every(command => command instanceof GetCommand)); assert.equal(p.row.state, "PENDING");
  });
});
test("expired-during-validation links and runtime flags changed during I/O cannot activate", async () => {
  for (const mode of ["expiry", "flag"]) {
    const f = fixture(), p = pending(f);
    const hooks = {};
    await withAdapter(f, async (deps, commands, env) => {
      hooks.beforeSecret = () => { if (mode === "expiry") f.state.time += 60000; else env.CONFIRMATION_ENABLED = "false"; };
      await assert.rejects(() => deps.store.confirm(p.token), mode === "expiry" ? /invalid_link/ : /sending_paused/);
      assert.ok(commands.every(command => command instanceof GetCommand)); assert.equal(p.row.state, "PENDING");
    }, hooks);
  }
});
for (const name of controls) test(`atomic transaction denies CONTROL.${name} revoked after its strong read`, async () => {
  const f = fixture(), p = pending(f);
  await withAdapter(f, async (deps, commands) => {
    await assert.rejects(() => deps.store.confirm(p.token), /sending_paused/);
    assert.equal(p.row.state, "PENDING");
    assert.equal([...f.state.documents.keys()].filter(key => key.startsWith("AUDIT#")).length, 0);
    const transaction = commands.find(command => command instanceof TransactWriteCommand);
    const check = transaction.input.TransactItems[0].ConditionCheck;
    assert.deepEqual(check.Key, { pk: "CONTROL" }); assert.deepEqual(check.ExpressionAttributeValues, { ":approved": true });
    for (const field of controls) assert.ok(check.ConditionExpression.includes(`${field} = :approved`));
  }, { beforeTransaction: () => { f.state.documents.get("CONTROL")[name] = false; } });
});
test("atomic persistence transaction permits one winner and one audit under simultaneous requests", async () => {
  const f = fixture(), p = pending(f);
  await withAdapter(f, async (deps, commands) => {
    const results = await Promise.all(Array.from({ length: 12 }, () => deps.store.confirm(p.token)));
    assert.equal(results.filter(Boolean).length, 1);
    assert.equal(p.row.state, "CONFIRMED"); assert.equal(p.row.confirmationNonce, undefined);
    const auditKeys = [...f.state.documents.keys()].filter(key => key.startsWith("AUDIT#")); assert.equal(auditKeys.length, 1);
    const before = structuredClone(p.row);
    assert.equal(await deps.store.confirm(p.token), false); assert.deepEqual(p.row, before);
    assert.equal(commands.find(command => command instanceof TransactWriteCommand).input.TransactItems.length, 3);
  });
});
test("nonce revocation, prior consumption, HOLD and suppression markers deny persistence activation", async () => {
  for (const change of [row => { row.confirmationNonce = "r".repeat(32); }, row => { delete row.confirmationNonce; }, row => { row.state = "CONFIRMED"; }, row => { row.state = "HOLD"; }, row => { row.state = "SUPPRESSED"; }, row => { row.suppressedAt = 0; }, row => { row.suppressionReason = "complaint"; }]) {
    const f = fixture(), p = pending(f); change(p.row); const before = structuredClone(p.row);
    await withAdapter(f, async deps => { assert.equal(await deps.store.confirm(p.token), false); assert.deepEqual(p.row, before); });
  }
});
test("durable suppression wins whether committed before or after the activation transaction", async () => {
  for (const before of [true, false]) {
    const f = fixture(), p = pending(f);
    await withAdapter(f, async deps => {
      if (before) assert.equal(await deps.store.confirm(p.token), false);
      else { assert.equal(await deps.store.confirm(p.token), true); await f.deps.store.suppress(p.id, p.row.email, "complaint", "synthetic", f.state.time); }
      const row = f.state.documents.get(p.row.pk); assert.equal(row.state, "SUPPRESSED"); assert.equal(row.audienceKey, undefined);
      const snapshot = structuredClone(row); assert.equal(await deps.store.confirm(p.token), false); assert.deepEqual(f.state.documents.get(p.row.pk), snapshot);
    }, { beforeTransaction: async () => { if (before) await f.deps.store.suppress(p.id, p.row.email, "unsubscribe", "synthetic", f.state.time); } });
  }
});
test("service cannot bypass a durable pause introduced immediately before the persistence transaction", async () => {
  const f = fixture(), p = pending(f);
  await withAdapter(f, async deps => {
    const service = createService({ ...f.deps, store: deps.store }, f.env);
    const result = await service.api({ rawPath: "/confirm", requestContext: { http: { method: "POST" } }, headers: { "x-newsletter-bridge": f.keys.websiteKey }, body: JSON.stringify({ token: p.token }) });
    assert.equal(result.statusCode, 503); assert.equal(p.row.state, "PENDING"); assert.equal(f.state.sends.length, 0);
  }, { beforeTransaction: () => { f.state.documents.get("CONTROL").registrationEnabled = false; } });
});
test("unsubscribe, bounce, complaint and SES opt-out processing stay available with every flag off and no CONTROL", async () => {
  for (const type of ["unsubscribe", "Bounce", "Complaint", "Subscription"]) {
    const f = fixture(), job = f.confirmed();
    for (const name of [...flags, "DELIVERY_ENABLED"]) f.env[name] = "false";
    f.state.documents.delete("CONTROL");
    if (type === "unsubscribe") assert.equal((await f.api("/unsubscribe", { token: f.token(job.id) })).statusCode, 200);
    else await f.service.feedback({ Type: "Notification", TopicArn: f.env.FEEDBACK_TOPIC_ARN, MessageId: "synthetic-feedback", Message: JSON.stringify({ eventType: type, mail: { destination: ["reader@example.test"] }, bounce: { bounceType: "Permanent", bouncedRecipients: [{ emailAddress: "reader@example.test" }] }, complaint: { complainedRecipients: [{ emailAddress: "reader@example.test" }] }, subscription: { contactList: f.env.CONTACT_LIST, newTopicPreferences: { unsubscribeAll: true } } }) });
    await f.service.sync(job.id);
    assert.equal(f.state.documents.get(`SUB#${job.id}`).state, "SUPPRESSED"); assert.equal(f.state.contacts.get("reader@example.test").UnsubscribeAll, true); assert.equal(f.state.sends.length, 0);
  }
});
test("an empty paused launch never seeds an audience or CONTROL through confirmation", async () => {
  const f = fixture(); f.state.documents.clear();
  for (const name of [...flags, "DELIVERY_ENABLED"]) f.env[name] = "false";
  assert.equal((await f.api("/confirm", { token: f.token(subscriberId("absent@example.test"), "confirm", "p".repeat(32), f.state.time + 1000) })).statusCode, 503);
  assert.equal(f.state.documents.size, 0); assert.equal(f.state.contacts.size, 0); assert.equal(f.state.sends.length, 0);
});
test("approved confirmation can activate while digest delivery stays disabled, without sending mail", async () => {
  const f = fixture(), p = pending(f);
  f.env.DELIVERY_ENABLED = "false"; f.state.documents.get("CONTROL").deliveryEnabled = false;
  assert.equal((await f.api("/confirm", { token: p.token })).statusCode, 200);
  assert.equal(p.row.state, "CONFIRMED"); assert.equal(f.state.sends.length, 0);
});
test("deleting CONTROL or revoking the nonce before transaction commit denies activation", async () => {
  for (const mode of ["missing-control", "revoked-nonce"]) {
    const f = fixture(), p = pending(f);
    await withAdapter(f, async deps => {
      if (mode === "missing-control") await assert.rejects(() => deps.store.confirm(p.token), /sending_paused/);
      else assert.equal(await deps.store.confirm(p.token), false);
      assert.equal(p.row.state, "PENDING");
      assert.equal([...f.state.documents.keys()].filter(key => key.startsWith("AUDIT#")).length, 0);
    }, { beforeTransaction: () => { if (mode === "missing-control") f.state.documents.delete("CONTROL"); else p.row.confirmationNonce = "r".repeat(32); } });
  }
});
test("malformed durable approval introduced after a valid read still denies the atomic write", async () => {
  for (const value of [undefined, "true", 1, []]) {
    const f = fixture(), p = pending(f);
    await withAdapter(f, async deps => {
      await assert.rejects(() => deps.store.confirm(p.token), /sending_paused/);
      assert.equal(p.row.state, "PENDING");
    }, { beforeTransaction: () => { f.state.documents.get("CONTROL").confirmationEnabled = value; } });
  }
});
test("only API receives table-scoped ConditionCheckItem authorization; infrastructure stays disabled", () => {
  const template = JSON.parse(readFileSync(new URL("../template.json", import.meta.url), "utf8"));
  const roles = Object.entries(template.Resources).filter(([, resource]) => resource.Type === "AWS::IAM::Role");
  const granted = roles.filter(([, role]) => JSON.stringify(role).includes("dynamodb:ConditionCheckItem"));
  assert.deepEqual(granted.map(([name]) => name), ["ApiRole"]);
  const statement = granted[0][1].Properties.Policies[0].PolicyDocument.Statement.find(statement => statement.Action?.includes("dynamodb:ConditionCheckItem"));
  assert.deepEqual(statement.Resource, { "Fn::GetAtt": ["Ledger", "Arn"] });
  for (const name of ["RegistrationEnabled", "ConfirmationEnabled", "DeliveryEnabled", "LegacyDispatchRetired", "ComplianceApproved"]) assert.equal(template.Parameters[name].Default, "false");
});

test("renewal atomically consumes fresh proof and preserves original consent and existing unsubscribe capability", async () => {
  const f = fixture(), p = pending(f), oldNonce = "u".repeat(32);
  const renewal = { ...p.row, pk: `RENEW#${p.id}` };
  f.state.documents.set(renewal.pk, renewal);
  Object.assign(p.row, { state: "HOLD", consentVersion: "historical", consentText: "original evidence", sources: ["legacy"], unsubscribeNonce: oldNonce });
  delete p.row.enrollmentPolicy;
  await withAdapter(f, async (deps, commands) => {
    assert.equal(await deps.store.confirm(p.token), true);
    assert.equal(campaignEligible(p.row), true); assert.equal(p.row.consentVersion, "historical"); assert.equal(p.row.consentText, "original evidence");
    assert.deepEqual(p.row.sources, ["legacy"]); assert.equal(p.row.unsubscribeNonce, oldNonce);
    assert.equal(renewal.state, "CONFIRMED"); assert.equal(renewal.confirmationNonce, undefined);
    assert.equal(commands.find(command => command instanceof TransactWriteCommand).input.TransactItems.length, 4);
    assert.equal(await deps.store.confirm(p.token), false);
  });
});
for (const mode of ["suppression", "nonce", "consent", "policy", "control"]) test(`renewal transaction rejects racing ${mode} without partial consent changes`, async () => {
  const f = fixture(), p = pending(f), renewal = { ...p.row, pk: `RENEW#${p.id}` };
  f.state.documents.set(renewal.pk, renewal); p.row.state = "HOLD"; delete p.row.enrollmentPolicy;
  await withAdapter(f, async deps => {
    if (mode === "control") await assert.rejects(() => deps.store.confirm(p.token), /sending_paused/);
    else assert.equal(await deps.store.confirm(p.token), false);
    assert.equal(p.row.state, "HOLD"); assert.equal(p.row.confirmedPolicy, undefined); assert.equal(renewal.state, "PENDING");
    assert.equal([...f.state.documents.keys()].some(key => key.includes("#confirm#")), false);
  }, { beforeTransaction: () => {
    if (mode === "suppression") p.row.suppressedAt = 0;
    if (mode === "nonce") renewal.confirmationNonce = "r".repeat(32);
    if (mode === "consent") renewal.consentText = "changed";
    if (mode === "policy") delete renewal.enrollmentPolicy;
    if (mode === "control") f.state.documents.get("CONTROL").confirmationEnabled = false;
  } });
});
