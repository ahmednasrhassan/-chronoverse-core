import test from "node:test";
import assert from "node:assert/strict";
import { validateConfig, authConfig, validateAuthConfig, validateCredentials, verifyIdentity, createAwsSource, childEnvironment, loadAwsLibrary } from "../src/aws.mjs";
import { Readable } from "node:stream";
import { config, address } from "./fixtures.mjs";

const now = Date.parse("2026-10-24T12:00:00.000Z");
const temporary = () => ({ Version: 1, AccessKeyId: "ASIA" + "S".repeat(16), SecretAccessKey: "synthetic-fixture-only-".repeat(2), SessionToken: "synthetic-session-only-".repeat(2), Expiration: new Date(now + 3600000).toISOString() });
const identity = () => ({ Account: config.accountId, Arn: `arn:aws:sts::${config.accountId}:assumed-role/NewsletterBackupReadOnly/synthetic-session` });
function fake() {
  const calls = [], cli = [], pauses = [], providers = {}; let clock = now;
  const responses = { GetCallerIdentityCommand: identity(), DescribeTableCommand: { Table: { TableArn: config.tableArn, TableStatus: "ACTIVE", KeySchema: [{ AttributeName: "pk", KeyType: "HASH" }] } }, GetContactListCommand: { ContactListName: config.contactList, Topics: [{ TopicName: "weekly-research" }] }, ScanCommand: { Items: [] }, ListContactsCommand: { Contacts: [] }, GetSuppressedDestinationCommand: { SuppressedDestination: { EmailAddress: address, Reason: "COMPLAINT" } } };
  const library = { command: (name, input) => ({ name, input }), client: (kind, credentials) => { providers[kind] = credentials; return { async send(command, options) { calls.push({ kind, command, options }); const value = responses[command.name]; if (typeof value === "function") return value(credentials); if (value instanceof Error) throw value; return value; }, destroy() {} }; } };
  return { calls, cli, responses, pauses, providers, advance: ms => { clock += ms; }, options: { library, now: () => clock, wait: async ms => { pauses.push(ms); clock += ms; }, execute: async (file, args, options) => { cli.push({ file, args, options }); return { stdout: args[0] === "--version" ? "aws-cli/2.38.5 Python/3 synthetic" : JSON.stringify(temporary()) }; } } };
}
test("configuration rejects unknown fields, wrong region, placeholders and credential-bearing auth", () => {
  assert.deepEqual(validateConfig(config), config);
  for (const bad of [{ ...config, region: "us-east-1" }, { ...config, accountId: "000000000000" }, { ...config, accessKey: "never-accepted" }, { ...config, auth: { kind: "login", secret: "not-accepted" } }]) assert.throws(() => validateConfig(bad), /invalid_configuration/);
});
test("expired credential refresh cannot reuse an old session or continue silently", async () => {
  const f = fake(), adapter = await createAwsSource(config, "unused", true, f.options);
  try {
    await adapter.verify(); f.advance(3600000);
    await assert.rejects(f.providers.ddb(), /temporary_authentication_required/);
    assert.equal(f.cli.filter(c => c.args[0] === "configure").length, 2);
  } finally { adapter.close(); }
});
test("only isolated login/SSO auth profiles can be used; static keys and endpoint/process overrides fail", () => {
  const valid = authConfig(config) + `login_session = ${config.roleArn}\n`; validateAuthConfig(valid, config);
  for (const suffix of ["credential_process = bad\n", "aws_access_key_id = bad\n", "endpoint_url = https://example.test\n"]) assert.throws(() => validateAuthConfig(valid + suffix, config), /unsafe_auth/);
  assert.throws(() => validateAuthConfig(authConfig(config) + "login_session = arn:aws:iam::111111111111:root\n", config), /unsafe_auth/);
  const sso = { ...config, auth: { kind: "sso", session: "synthetic-session", startUrl: "https://synthetic.awsapps.com/start", region: "eu-north-1", roleName: "NewsletterBackupReadOnly" } };
  validateAuthConfig(authConfig(sso), sso);
  assert.throws(() => validateAuthConfig(authConfig(sso) + "[default]\nregion = eu-north-1\n", sso), /unsafe_auth/);
});
test("temporary credentials require session token, expiry and expected role; root/users/other accounts denied", () => {
  assert.equal(validateCredentials(temporary(), now).accessKeyId.startsWith("ASIA"), true);
  for (const bad of [{ ...temporary(), SessionToken: undefined }, { ...temporary(), Expiration: new Date(now - 1).toISOString() }, { ...temporary(), AccessKeyId: "AKIA" + "S".repeat(16) }, { ...temporary(), Expiration: new Date(now + 24 * 3600000).toISOString() }]) assert.throws(() => validateCredentials(bad, now), /temporary/);
  verifyIdentity(identity(), config);
  for (const Arn of ["arn:aws:iam::111111111111:root", "arn:aws:iam::111111111111:user/synthetic", "arn:aws:sts::222222222222:assumed-role/NewsletterBackupReadOnly/x", "arn:aws:sts::111111111111:assumed-role/Admin/x"]) assert.throws(() => verifyIdentity({ Account: config.accountId, Arn }, config), /wrong_readonly_role/);
});
test("child process environment excludes ambient credentials, endpoints, proxy/debug settings", () => {
  const saved = process.env.AWS_ACCESS_KEY_ID; process.env.AWS_ACCESS_KEY_ID = "synthetic-inherited-value";
  try { const env = childEnvironment("C:\\private\\auth\\config"); assert.equal(env.AWS_ACCESS_KEY_ID, undefined); assert.equal(env.AWS_PROFILE, undefined); assert.equal(env.AWS_MAX_ATTEMPTS, "1"); assert.ok(env.AWS_SHARED_CREDENTIALS_FILE.endsWith("no-static-credentials")); }
  finally { if (saved === undefined) delete process.env.AWS_ACCESS_KEY_ID; else process.env.AWS_ACCESS_KEY_ID = saved; }
});
test("approval and offline gates prevent real runner/SDK use", async () => {
  const f = fake(); await assert.rejects(createAwsSource(config, "unused", false, f.options), /approved/); assert.equal(f.cli.length, 0);
  await assert.rejects(createAwsSource(config, "unused", true), /disabled/);
});
test("verified read adapter uses pagination inputs, targeted suppression and no write/send/secret API", async () => {
  const f = fake(), adapter = await createAwsSource(config, "synthetic-config", true, f.options);
  await adapter.verify(); await adapter.scan({ ExclusiveStartKey: { pk: { S: "cursor" } }, TableName: "not-allowed", ConsistentRead: false }); await adapter.contacts({ NextToken: "next", ContactListName: "not-allowed" });
  const suppression = await adapter.suppression(address); assert.equal(suppression.Reason, "COMPLAINT"); adapter.close();
  assert.deepEqual(f.calls.map(x => x.command.name), ["GetCallerIdentityCommand", "DescribeTableCommand", "GetContactListCommand", "ScanCommand", "ListContactsCommand", "GetSuppressedDestinationCommand"]);
  assert.equal(f.calls.find(x => x.command.name === "ScanCommand").command.input.ConsistentRead, true);
  assert.equal(f.calls.find(x => x.command.name === "ScanCommand").command.input.TableName, config.tableArn);
  assert.equal(f.calls.find(x => x.command.name === "ListContactsCommand").command.input.NextToken, "next");
  assert.equal(f.calls.find(x => x.command.name === "ListContactsCommand").command.input.ContactListName, config.contactList);
  assert.equal(JSON.stringify(f.cli).includes(address), false); assert.equal(f.cli[1].options.shell, false);
  assert.ok(f.pauses.filter(ms => ms >= 2000).length >= 2);
});
test("missing destination alone means clear; permissions, provider failures and malformed success do not", async () => {
  for (const name of ["NotFoundException", "AccessDeniedException", "InternalServiceErrorException"]) {
    const f = fake(); f.responses.GetSuppressedDestinationCommand = Object.assign(new Error(address), { name });
    const adapter = await createAwsSource(config, "synthetic-config", true, f.options);
    try { if (name === "NotFoundException") assert.equal(await adapter.suppression(address), null); else await assert.rejects(adapter.suppression(address), e => e.message === "aws_read_failed" && !e.message.includes(address)); } finally { adapter.close(); }
  }
  const f = fake(); f.responses.GetSuppressedDestinationCommand = {};
  const adapter = await createAwsSource(config, "unused", true, f.options);
  try { await assert.rejects(adapter.suppression(address), /invalid_page/); } finally { adapter.close(); }
});
test("bounded SES retries are paced; table or identity mismatch aborts before collection", async () => {
  const f = fake(); f.responses.GetSuppressedDestinationCommand = Object.assign(new Error("synthetic"), { name: "TooManyRequestsException" });
  const adapter = await createAwsSource(config, "unused", true, f.options);
  try { await assert.rejects(adapter.suppression(address), /aws_read_failed/); assert.equal(f.calls.filter(x => x.command.name === "GetSuppressedDestinationCommand").length, 3); } finally { adapter.close(); }
  const g = fake(); g.responses.GetCallerIdentityCommand = { Account: "222222222222", Arn: identity().Arn };
  const wrong = await createAwsSource(config, "unused", true, g.options);
  try { await assert.rejects(wrong.verify(), /wrong_readonly_role/); assert.equal(g.calls.some(x => x.kind === "ddb"), false); } finally { wrong.close(); }
});
test("locked SDK clients serialize, sign and decode synthetic reads through a mocked HTTP transport", async () => {
  const actual = await loadAwsLibrary(), f = fake(), wire = [];
  f.options.library = { command: actual.command, client(service, credentials, region) {
    const client = actual.client(service, credentials, region);
    client.config.requestHandler = { async handle(request) {
      wire.push({ method: request.method, hostname: request.hostname, path: request.path });
      let payload;
      if (service === "sts") payload = identity();
      else if (request.headers["x-amz-target"]?.endsWith("DescribeTable")) payload = f.responses.DescribeTableCommand;
      else if (service === "ddb") payload = { Items: [] };
      else if (request.path.includes("suppression/addresses")) payload = f.responses.GetSuppressedDestinationCommand;
      else if (request.path.endsWith("/contacts/list")) payload = { Contacts: [] };
      else payload = f.responses.GetContactListCommand;
      // STS Query protocol uses XML; SES and DynamoDB use JSON.
      const body = service === "sts" ? `<GetCallerIdentityResponse xmlns="https://sts.amazonaws.com/doc/2011-06-15/"><GetCallerIdentityResult><Arn>${identity().Arn}</Arn><UserId>synthetic</UserId><Account>${config.accountId}</Account></GetCallerIdentityResult><ResponseMetadata><RequestId>synthetic</RequestId></ResponseMetadata></GetCallerIdentityResponse>` : JSON.stringify(payload);
      return { response: { statusCode: 200, headers: { "content-type": service === "sts" ? "text/xml" : "application/json" }, body: Readable.from([Buffer.from(body)]) } };
    }, destroy() {} };
    return client;
  } };
  const adapter = await createAwsSource(config, "unused", true, f.options);
  try { await adapter.verify(); await adapter.scan({}); assert.deepEqual((await adapter.contacts({})).Contacts, []); assert.equal((await adapter.suppression(address)).Reason, "COMPLAINT"); assert.ok(wire.every(r => r.hostname.endsWith(".eu-north-1.amazonaws.com"))); }
  finally { adapter.close(); }
});
