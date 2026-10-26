import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { GetCommand, PutCommand, DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { SESv2Client, GetContactCommand, GetSuppressedDestinationCommand, SendEmailCommand } from "@aws-sdk/client-sesv2";
import { assertPublicationCurrent, PUBLICATION_STATE, PUBLICATION_POLICY, PUBLICATION_MAX_AGE, publicationKey, PublicationUnavailable } from "../src/publication.mjs";
import { createPublicationStore, createPublicationObject } from "../src/publication-aws.mjs";
import { createAwsDependencies } from "../src/aws.mjs";
import { fixture } from "./fixture.mjs";
import { createService } from "../src/service.mjs";

function prepared() {
  const f = fixture(), job = f.confirmed(), campaign = f.state.documents.get(`CAMPAIGN#${job.campaign}`), a = campaign.articles[0];
  f.state.time = campaign.end + 600000; a.approval.approvedBy = PUBLICATION_POLICY;
  const cutover = campaign.end - 7 * 86400000;
  Object.assign(f.state.documents.get("CONTROL"), { contentStartAt: cutover, sanityPublishedStateApproved: true });
  f.state.documents.set(PUBLICATION_STATE, { status: "READY", sequence: a.contentManifest.sequence, cutover, lastSuccessfulAt: campaign.end + 30000 });
  f.state.documents.set(publicationKey(a.id), { active: true, cutover, article: { url: a.url, publishedAt: a.provenance.originalPublishedAt, provenance: a.provenance } });
  return { ...f, job, campaign, a, check: () => assertPublicationCurrent(f.deps.store, [a], f.state.time, campaign.end) };
}
test("current AWS-owned eligibility passes without any source HTTP request", async () => { const f = prepared(); await f.check(); assert.equal(f.state.sends.length, 0); });
test("approved automatic-source content reaches the existing mocked transport once with its final eligibility context", async () => {
  const f = prepared(); await f.service.deliver(f.job); await f.service.deliver(f.job);
  assert.equal(f.state.sends.length, 1); assert.equal(f.state.sends[0].message.publicationCheck.end, f.campaign.end);
});
test("a failed first planner fetch remembers the real approved cutover without opening historical replay", async () => {
  const f = fixture(), start = Date.parse("2026-10-12T09:00:00Z");
  Object.assign(f.state.documents.get("CONTROL"), { sanityPublishedStateApproved: true, contentStartAt: start });
  f.deps.articles = async () => { throw new Error("synthetic_archive_unavailable"); };
  const service = createService(f.deps, f.env);
  await assert.rejects(() => service.plan({ kind: "weekly" }), /synthetic_archive_unavailable/);
  assert.equal(f.state.documents.get("DISCOVERY").start, start); assert.equal(f.state.jobs.length, 0); assert.equal(f.state.sends.length, 0);
});
for (const [name, change] of [
  ["missing checkpoint", f => f.state.documents.delete(PUBLICATION_STATE)],
  ["failed scan", f => { f.state.documents.get(PUBLICATION_STATE).status = "FAILED"; }],
  ["scan in progress", f => { f.state.documents.get(PUBLICATION_STATE).status = "CHECKING"; }],
  ["stale scan", f => { f.state.documents.get(PUBLICATION_STATE).lastSuccessfulAt = f.state.time - PUBLICATION_MAX_AGE - 1; }],
  ["previous weekly boundary", f => { f.state.documents.get(PUBLICATION_STATE).lastSuccessfulAt = f.campaign.end - 1; }],
  ["revoked policy", f => { f.state.documents.get("CONTROL").sanityPublishedStateApproved = false; }],
  ["unpublished article", f => { f.state.documents.get(publicationKey(f.a.id)).active = false; }],
  ["new revision", f => { f.state.documents.get(publicationKey(f.a.id)).article.provenance = { ...f.a.provenance, revision: "synthetic-new" }; }],
  ["changed canonical", f => { f.state.documents.get(publicationKey(f.a.id)).article.url = "https://reference.example.test/new"; }],
]) test(`planner/worker freshness denies ${name} before claims or mocked email handoff`, async () => {
  const f = prepared(); change(f); await assert.rejects(f.check, PublicationUnavailable);
  await assert.rejects(() => f.service.deliver(f.job), PublicationUnavailable);
  assert.equal(f.state.sends.length, 0); assert.equal(f.state.documents.has(`MAIL#${f.job.campaign}#${f.job.id}`), false);
});
test("a checkpoint changing during eligibility reads fails closed", async () => {
  const f = prepared(), get = f.deps.store.get; let reads = 0;
  f.deps.store.get = async key => { const result = await get(key); if (key === PUBLICATION_STATE && ++reads === 2) result.sequence++; return result; };
  await assert.rejects(f.check, PublicationUnavailable);
});
test("actual SES adapter rechecks AWS eligibility immediately before handoff and cannot send a revoked snapshot", async () => {
  const f = prepared(); let sends = 0;
  mock.method(Date, "now", () => f.state.time);
  mock.method(DynamoDBDocumentClient.prototype, "send", async command => command instanceof GetCommand ? { Item: f.state.documents.get(command.input.Key.pk) } : {});
  mock.method(SESv2Client.prototype, "send", async command => {
    if (command instanceof SendEmailCommand) { sends++; return { MessageId: "synthetic" }; }
    if (command instanceof GetSuppressedDestinationCommand) throw Object.assign(new Error("synthetic"), { name: "NotFoundException" });
    assert.ok(command instanceof GetContactCommand); return f.state.contacts.get(command.input.EmailAddress);
  });
  try {
    const deps = createAwsDependencies({ ...f.env, AWS_REGION: "eu-north-1", TABLE_NAME: "synthetic" });
    f.state.documents.get(publicationKey(f.a.id)).active = false;
    await assert.rejects(() => deps.mail.send("reader@example.test", { publicationCheck: { articles: [f.a], end: f.campaign.end } }, { kind: "digest", id: f.job.id }), PublicationUnavailable);
    assert.equal(sends, 0);
  } finally { mock.restoreAll(); }
});

const credentials = async () => ({ accessKeyId: "synthetic-session-key", secretAccessKey: "synthetic-session-secret" });
const env = { AWS_REGION: "eu-north-1", CONTENT_BUCKET: "synthetic-private-content", CONTENT_MANIFEST_KEY: "newsletter-content/approved.json", CONTENT_BUCKET_OWNER: "000000000000" };
test("S3 writer validates versioning and uses exact owner, encryption and conditional creation/update", async () => {
  const requests = [];
  const object = createPublicationObject(env, credentials, async (url, options) => {
    requests.push({ url, options }); assert.equal(options.headers["x-amz-expected-bucket-owner"], "000000000000"); assert.match(options.headers.authorization, /^AWS4-HMAC-SHA256 /);
    if (url.endsWith("?versioning=")) return new Response("<VersioningConfiguration><Status>Enabled</Status></VersioningConfiguration>");
    if (options.method === "GET") return new Response("{}", { headers: { "content-type": "application/json", etag: '"synthetic-1"', "x-amz-version-id": "synthetic-1" } });
    assert.equal(url, "https://synthetic-private-content.s3.eu-north-1.amazonaws.com/newsletter-content/approved.json");
    assert.equal(options.headers["x-amz-server-side-encryption"], "AES256");
    return new Response("", { headers: { "x-amz-version-id": "synthetic-new", "x-amz-server-side-encryption": "AES256" } });
  });
  await object.versioning(); const old = await object.read(false); await object.write("{}", old.etag); await object.write("{}");
  assert.equal(requests[2].options.headers["if-match"], '"synthetic-1"'); assert.equal(requests[3].options.headers["if-none-match"], "*");
});
test("403 bootstrap permits only create-if-absent, and conflicts/unversioned writes cannot claim success", async () => {
  let calls = 0;
  const object = createPublicationObject(env, credentials, async (_, options) => {
    calls++; if (options.method === "GET") return new Response("", { status: 403 });
    assert.equal(options.headers["if-none-match"], "*"); return new Response("", { status: 412 });
  });
  assert.equal(await object.read(true), undefined); await assert.rejects(() => object.write("{}"), /publication_write_conflict/);
  await assert.rejects(() => object.read(false), /publication_storage_unavailable/); assert.equal(calls, 3);
  const unsafe = createPublicationObject(env, credentials, async () => new Response("", { headers: { "x-amz-version-id": "null", "x-amz-server-side-encryption": "AES256" } }));
  await assert.rejects(() => unsafe.write("{}"), /publication_storage_unversioned/);
});
test("actual DynamoDB adapter uses strong reads, conditional leases/observations and post-persistence checkpoints", async () => {
  const calls = [], ddb = { send: async command => { calls.push(command); return command instanceof GetCommand ? { Item: undefined } : {}; } };
  const store = createPublicationStore(ddb, "synthetic"); await store.begin("synthetic-owner", 1000);
  await store.observe({ pk: "PUBLICATION#ARTICLE#synthetic", version: 2 }, 1);
  await store.finish("synthetic-owner", { sequence: 1 }, 1100);
  assert.ok(calls[0] instanceof GetCommand); assert.equal(calls[0].input.ConsistentRead, true);
  assert.ok(calls[1] instanceof PutCommand); assert.equal(calls[1].input.ConditionExpression, "attribute_not_exists(pk)");
  assert.match(calls[2].input.ConditionExpression, /#version = :version/); assert.match(calls[3].input.ConditionExpression, /#owner = :owner.*#sequence < :sequence/);
});

test("companion is isolated, all 32 default/activation combinations preserve mail isolation and exact S3/IAM scopes", () => {
  const t = JSON.parse(readFileSync(new URL("../discovery-template.json", import.meta.url))), base = JSON.parse(readFileSync(new URL("../template.json", import.meta.url)));
  const flags = ["DeliveryEnabled", "RegistrationEnabled", "ConfirmationEnabled", "LegacyDispatchRetired", "ComplianceApproved"];
  for (const flag of flags) assert.equal(t.Parameters[flag].Default, "false");
  const text = JSON.stringify(t); assert.doesNotMatch(text, /ses:|secretsmanager:|AWS::S3::Bucket|AWS::DynamoDB::Table|AWS::EC2|AWS::ApiGateway|s3:ListBucket|s3:DeleteObject|dynamodb:Scan/);
  const absent = Symbol();
  function resolve(v, p) {
    if (Array.isArray(v)) return v.map(x => resolve(x, p)).filter(x => x !== absent);
    if (!v || typeof v !== "object") return v;
    if (v.Ref === "AWS::NoValue") return absent;
    if (v.Ref && Object.hasOwn(p, v.Ref)) return p[v.Ref];
    if (Object.keys(v).length === 1 && v.Condition) return resolve(t.Conditions[v.Condition], p);
    if (v["Fn::Equals"]) { const [a, b] = resolve(v["Fn::Equals"], p); return a === b; }
    if (v["Fn::Not"]) return !resolve(v["Fn::Not"][0], p);
    if (v["Fn::And"]) return resolve(v["Fn::And"], p).every(Boolean);
    if (v["Fn::If"]) { const [c, yes, no] = v["Fn::If"]; return resolve(resolve(t.Conditions[c], p) ? yes : no, p); }
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, resolve(x, p)]).filter(([, x]) => x !== absent));
  }
  for (let mask = 0; mask < 32; mask++) for (const configured of [true, false]) {
    const p = { ...Object.fromEntries(flags.map((f, i) => [f, mask & (1 << i) ? "true" : "false"])), ContentBucket: configured ? "synthetic-content" : "", SanityProjectId: "synthetic", SanityDataset: "production", ArticleOrigin: "https://reference.example.test" };
    const r = resolve(t.Resources, p), enabled = configured && p.DeliveryEnabled === "true" && p.LegacyDispatchRetired === "true" && p.ComplianceApproved === "true";
    assert.equal(r.DailyDiscovery.Properties.State, enabled ? "ENABLED" : "DISABLED");
    assert.equal(JSON.stringify(r.DiscoveryRole).includes('"s3:PutObject"'), Boolean(enabled));
    assert.equal(JSON.stringify(r.DiscoverySchedulerRole).includes('"lambda:InvokeFunction"'), Boolean(enabled));
    const failures = r.DiscoveryRole.Properties.Policies.flatMap(policy => policy.PolicyDocument.Statement)
      .filter(statement => statement.Action?.includes("sqs:SendMessage"));
    assert.deepEqual(failures, [{ Effect: "Allow", Action: ["sqs:SendMessage"], Resource: { Ref: "FailureQueueArn" } }]);
    assert.deepEqual(r.DiscoveryInvokeConfig.Properties.DestinationConfig.OnFailure.Destination, { Ref: "FailureQueueArn" });
  }
  const statements = t.Resources.DiscoveryRole.Properties.Policies[0].PolicyDocument.Statement;
  assert.deepEqual(t.Resources.DiscoverySchedulerRole.Properties.AssumeRolePolicyDocument.Statement[0].Condition, {
    StringEquals: { "aws:SourceAccount": { Ref: "AWS::AccountId" } },
    ArnEquals: { "aws:SourceArn": { "Fn::Sub": "arn:${AWS::Partition}:scheduler:${AWS::Region}:${AWS::AccountId}:schedule-group/default" } },
  });
  const write = statements.find(s => s["Fn::If"]?.[1]?.Action?.includes("s3:PutObject"))["Fn::If"][1];
  assert.deepEqual(write.Resource, { "Fn::Sub": "arn:${AWS::Partition}:s3:::${ContentBucket}/${ContentManifestKey}" });
  assert.equal(write.Condition.StringEquals["s3:x-amz-server-side-encryption"], "AES256");
  assert.deepEqual(write.Condition.StringEquals["s3:ResourceAccount"], { Ref: "AWS::AccountId" });
  assert.equal(t.Resources.DailyDiscovery.Properties.ScheduleExpression, "cron(0 9 * * ? *)");
  assert.equal(base.Resources.WeeklySchedule.Properties.ScheduleExpression, "cron(10 9 ? * MON *)");
});
