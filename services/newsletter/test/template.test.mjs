import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateAlarms } from "../scripts/validate-template.mjs";
import { fixture } from "./fixture.mjs";

const template = JSON.parse(readFileSync(new URL("../template.json", import.meta.url), "utf8"));
const alarmIds = ["DeadLetterAlarm", "ExecutionHealthAlarm", "SafetyBacklogAlarm", "SafetyFailureAlarm"];

test("all four source alarms satisfy local static CloudWatch configuration checks", () => {
  assert.deepEqual(validateAlarms(template).sort(), [...alarmIds].sort());
  for (const id of alarmIds) assert.equal(template.Resources[id].Properties.ComparisonOperator, "GreaterThanOrEqualToThreshold");
});

for (const id of alarmIds) test(`${id}: missing Threshold reproduces the deployment defect and is rejected`, () => {
  const t = structuredClone(template);
  delete t.Resources[id].Properties.Threshold;
  assert.throws(() => validateAlarms(t), /finite numeric Threshold required/);
});

for (const [name, mutate, reason] of [
  ["string threshold", p => { p.Threshold = "1"; }, /Threshold/],
  ["null threshold", p => { p.Threshold = null; }, /Threshold/],
  ["non-finite threshold", p => { p.Threshold = Infinity; }, /Threshold/],
  ["anomaly/static mix", p => { p.ThresholdMetricId = "band"; }, /ThresholdMetricId/],
  ["missing comparison", p => { delete p.ComparisonOperator; }, /ComparisonOperator/],
  ["missing evaluation", p => { delete p.EvaluationPeriods; }, /EvaluationPeriods/],
  ["zero evaluation", p => { p.EvaluationPeriods = 0; }, /EvaluationPeriods/],
  ["too many breaching datapoints", p => { p.DatapointsToAlarm = 2; }, /DatapointsToAlarm/],
  ["invalid missing-data policy", p => { p.TreatMissingData = "typo"; }, /missing data/],
  ["missing namespace", p => { delete p.Namespace; }, /Namespace/],
  ["missing metric name", p => { delete p.MetricName; }, /MetricName/],
  ["missing statistic", p => { delete p.Statistic; }, /Statistic/],
  ["conflicting statistics", p => { p.ExtendedStatistic = "p99"; }, /ExtendedStatistic/],
  ["invalid period", p => { p.Period = 61; }, /Period/],
  ["dimension missing value", p => { delete p.Dimensions[0].Value; }, /dimension Value/],
  ["duplicate dimension", p => { p.Dimensions.push(structuredClone(p.Dimensions[0])); }, /duplicate dimension/],
]) test(`alarm validator rejects ${name}`, () => {
  const t = structuredClone(template); mutate(t.Resources.DeadLetterAlarm.Properties);
  assert.throws(() => validateAlarms(t), reason);
});

for (const [name, mutate, reason] of [
  ["top-level metric with math", p => { p.MetricName = "Errors"; }, /conflicts/],
  ["top-level period with math", p => { p.Period = 300; }, /conflicts/],
  ["duplicate query ID", p => { p.Metrics[2].Id = "errors"; }, /duplicate metric Id/],
  ["invalid query ID", p => { p.Metrics[1].Id = "Errors"; }, /metric Id/],
  ["query expression and metric together", p => { p.Metrics[1].Expression = "MAX([errors])"; }, /exclusively/],
  ["query without expression or metric", p => { delete p.Metrics[1].MetricStat; }, /exclusively/],
  ["implicit query output", p => { delete p.Metrics[1].ReturnData; }, /ReturnData/],
  ["multiple outputs", p => { p.Metrics[1].ReturnData = true; }, /exactly one/],
  ["missing output", p => { p.Metrics[0].ReturnData = false; }, /exactly one/],
  ["dangling expression reference", p => { p.Metrics[0].Expression = "MAX([errors,typo])"; }, /unknown\/non-metric/],
  ["self reference", p => { p.Metrics[0].Expression = "MAX([health,errors])"; }, /unknown\/non-metric/],
  ["scalar expression", p => { p.Metrics[0].Expression = "MAX(errors)"; }, /single-series/],
  ["division by zero", p => { p.Metrics[0].Expression = "MAX([errors/0,throttles])"; }, /divisor/],
  ["mismatched periods", p => { p.Metrics[1].MetricStat.Period = 60; }, /periods must align/],
  ["missing metric statistic", p => { delete p.Metrics[1].MetricStat.Stat; }, /Stat/],
]) test(`alarm validator rejects ${name}`, () => {
  const t = structuredClone(template); mutate(t.Resources.ExecutionHealthAlarm.Properties);
  assert.throws(() => validateAlarms(t), reason);
});

test("DLQ and safety-fault thresholds match emitted metric identities and dimensions", () => {
  const dlq = template.Resources.DeadLetterAlarm.Properties;
  assert.equal(dlq.Threshold, 1); assert.equal(dlq.ComparisonOperator, "GreaterThanOrEqualToThreshold");
  assert.equal(dlq.Namespace, "AWS/SQS"); assert.equal(dlq.MetricName, "ApproximateNumberOfMessagesVisible");
  assert.equal(dlq.Statistic, "Maximum"); assert.equal(dlq.Period, 300);
  assert.deepEqual(dlq.Dimensions, [{ Name: "QueueName", Value: { "Fn::GetAtt": ["FailureQueue", "QueueName"] } }]);
  const fault = template.Resources.SafetyFailureAlarm.Properties;
  assert.equal(fault.Threshold, 1); assert.equal(fault.ComparisonOperator, "GreaterThanOrEqualToThreshold");
  assert.equal(fault.Namespace, "Chronoverse/Newsletter"); assert.equal(fault.MetricName, "SafetyFailure");
  assert.equal(fault.Statistic, "Sum"); assert.equal(fault.Period, 300);
  assert.equal(fault.Dimensions, undefined); // EMF emits Dimensions: [[]].
  assert.equal(template.Resources.ExecutionHealthAlarm.Properties.Threshold, 1);
  assert.equal(template.Resources.SafetyBacklogAlarm.Properties.Threshold, 3600);
});

// Resolve only conditions/parameter references; physical resource references stay
// symbolic. AWS::NoValue is removed just as CloudFormation removes it.
const absent = Symbol("AWS::NoValue");
function resolve(value, parameters) {
  if (Array.isArray(value)) return value.map(v => resolve(v, parameters)).filter(v => v !== absent);
  if (!value || typeof value !== "object") return value;
  if (value.Ref === "AWS::NoValue") return absent;
  if (value.Ref && Object.hasOwn(parameters, value.Ref)) return parameters[value.Ref];
  if (Object.keys(value).length === 1 && typeof value.Condition === "string") return resolve(template.Conditions[value.Condition], parameters);
  if (value["Fn::Equals"]) { const [a, b] = resolve(value["Fn::Equals"], parameters); return a === b; }
  if (value["Fn::And"]) return resolve(value["Fn::And"], parameters).every(Boolean);
  if (value["Fn::Or"]) return resolve(value["Fn::Or"], parameters).some(Boolean);
  if (value["Fn::Not"]) return !resolve(value["Fn::Not"][0], parameters);
  if (value["Fn::If"]) {
    const [condition, yes, no] = value["Fn::If"];
    return resolve(resolve(template.Conditions[condition], parameters) ? yes : no, parameters);
  }
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, resolve(v, parameters)]).filter(([, v]) => v !== absent));
}

test("all 32 activation combinations gate schedule, SES sending and IAM grants consistently", () => {
  const flags = ["DeliveryEnabled", "RegistrationEnabled", "ConfirmationEnabled", "LegacyDispatchRetired", "ComplianceApproved"];
  for (const flag of flags) {
    assert.equal(template.Parameters[flag].Default, "false");
    assert.equal(template.Parameters[flag].Type, "String");
    assert.deepEqual(template.Parameters[flag].AllowedValues, ["false", "true"]);
  }
  for (let mask = 0; mask < 32; mask++) {
    const bits = flags.map((_, i) => Boolean(mask & (1 << i)));
    const parameters = Object.fromEntries(flags.map((flag, i) => [flag, bits[i] ? "true" : "false"]));
    const r = resolve(template.Resources, { ...parameters, AlarmTopicArn: "" });
    const digest = bits[0] && bits[3] && bits[4];
    const confirmation = bits[1] && bits[2] && bits[3] && bits[4];
    assert.equal(r.WeeklySchedule.Properties.State, digest ? "ENABLED" : "DISABLED");
    assert.equal(r.Configuration.Properties.SendingOptions.SendingEnabled, digest || confirmation);
    for (const id of ["PlannerMapping", "WorkerMapping"]) assert.equal(r[id].Properties.Enabled, digest);
    const sendRoles = Object.entries(r).filter(([, resource]) => resource.Type === "AWS::IAM::Role" && JSON.stringify(resource).includes('"ses:SendEmail"')).map(([id]) => id).sort();
    assert.deepEqual(sendRoles, [...(digest ? ["WorkerRole"] : []), ...(confirmation ? ["ApiRole"] : [])].sort());
    const env = resolve(template.Globals.Function.Environment.Variables, parameters);
    for (const [name, flag] of [["DELIVERY_ENABLED", "DeliveryEnabled"], ["REGISTRATION_ENABLED", "RegistrationEnabled"], ["CONFIRMATION_ENABLED", "ConfirmationEnabled"], ["LEGACY_DISPATCH_RETIRED", "LegacyDispatchRetired"], ["COMPLIANCE_APPROVED", "ComplianceApproved"]]) assert.equal(env[name], parameters[flag]);
    for (const id of alarmIds) assert.equal(r[id].Properties.AlarmActions, undefined);
    assert.equal(r.FeedbackMapping.Properties.Enabled, true);
    assert.equal(r.Contacts.Properties.Topics[0].DefaultSubscriptionStatus, "OPT_OUT");
  }
  const r = resolve(template.Resources, { AlarmTopicArn: "arn:aws:sns:eu-north-1:000000000000:synthetic" });
  for (const id of alarmIds) assert.deepEqual(r[id].Properties.AlarmActions, ["arn:aws:sns:eu-north-1:000000000000:synthetic"]);
});

test("actual template defaults deny signup, confirmation and direct delivery with no side effects", async () => {
  const f = fixture(), job = f.confirmed();
  for (const [name, reference] of Object.entries(template.Globals.Function.Environment.Variables)) {
    if (reference.Ref && template.Parameters[reference.Ref]?.Default === "false") f.env[name] = template.Parameters[reference.Ref].Default;
  }
  const documents = structuredClone(f.state.documents), contacts = structuredClone(f.state.contacts);
  assert.equal((await f.subscribe("synthetic-paused@example.test")).statusCode, 503);
  assert.equal((await f.api("/confirm", { token: f.token(job.id, "confirm", "c".repeat(32), f.state.time + 10000) })).statusCode, 503);
  await assert.rejects(() => f.service.plan({ kind: "weekly" }), /sending_paused/);
  await assert.rejects(() => f.service.deliver(job), /sending_paused/);
  assert.deepEqual(f.state.documents, documents); assert.deepEqual(f.state.contacts, contacts);
  assert.equal(f.state.sends.length, 0); assert.equal(f.state.rates.size, 0);
});

test("independent public routes reuse the existing API; no content/admin/restore writes or extra services are exposed", () => {
  const events = Object.values(template.Resources.ApiFunction.Properties.Events).map(e => `${e.Properties.Method} ${e.Properties.Path}`).sort();
  assert.deepEqual(events, ["GET /api/newsletter/confirm", "GET /api/newsletter/unsubscribe", "GET /confirm", "GET /register", "GET /unsubscribe", "POST /api/newsletter/confirm", "POST /api/newsletter/unsubscribe", "POST /confirm", "POST /register", "POST /subscribe", "POST /unsubscribe"]);
  assert.equal(Object.keys(template.Resources).length, 38);
  assert.equal(template.Parameters.PublicOrigin.Default, ""); assert.equal(template.Parameters.ContentBucket.Default, "");
  assert.equal(template.Resources.HttpApi.Properties.CorsConfiguration, undefined);
  assert.doesNotMatch(JSON.stringify(template), /AWS::S3::Bucket|s3:PutObject|s3:ListBucket|s3:DeleteObject/);
});

test("all 32 flag combinations keep S3 read permission planner-only, exact-key scoped and gated by delivery approval", () => {
  const flags = ["DeliveryEnabled", "RegistrationEnabled", "ConfirmationEnabled", "LegacyDispatchRetired", "ComplianceApproved"];
  for (let mask = 0; mask < 32; mask++) {
    const p = Object.fromEntries(flags.map((f, i) => [f, mask & (1 << i) ? "true" : "false"]));
    for (const bucket of ["", "synthetic-private-content"]) {
      const r = resolve(template.Resources, { ...p, ContentBucket: bucket });
      const roles = Object.entries(r).filter(([, v]) => v.Type === "AWS::IAM::Role" && JSON.stringify(v).includes('"s3:GetObject"')).map(([id]) => id);
      const enabled = bucket !== "" && p.DeliveryEnabled === "true" && p.LegacyDispatchRetired === "true" && p.ComplianceApproved === "true";
      assert.deepEqual(roles, enabled ? ["PlannerRole"] : []);
    }
  }
  const statements = template.Resources.PlannerRole.Properties.Policies[0].PolicyDocument.Statement;
  const grant = statements.find(s => s["Fn::If"]?.[0] === "ContentMayRead")["Fn::If"][1];
  assert.deepEqual(grant.Resource, { "Fn::Sub": "arn:${AWS::Partition}:s3:::${ContentBucket}/${ContentManifestKey}" });
  assert.deepEqual(grant.Condition, { StringEquals: { "s3:ResourceAccount": { Ref: "AWS::AccountId" } } });
  assert.deepEqual(template.Resources.PlannerFunction.Properties.Environment.Variables.CONTENT_BUCKET_OWNER, { Ref: "AWS::AccountId" });
  assert.equal(statements.some(s => s.Action?.includes("dynamodb:ConditionCheckItem")), false);
  const bounded = statements.find(s => s.Action?.includes("dynamodb:BatchGetItem"));
  assert.deepEqual(bounded.Condition["ForAllValues:StringLike"]["dynamodb:LeadingKeys"], ["ARTICLE#*", "ARTICLE_URL#*", "CAMPAIGN#*"]);
});

test("runtime construction selects the S3 approval adapter and independent public origin, never the website RSS loader", () => {
  const aws = readFileSync(new URL("../src/aws.mjs", import.meta.url), "utf8");
  const service = readFileSync(new URL("../src/service.mjs", import.meta.url), "utf8");
  assert.match(aws, /articles: createContentSource\(/); assert.doesNotMatch(aws, /fetchArticles|sanity|vercel|next\//i);
  assert.match(service, /publicOrigin\(env\).*unsubscribe/); assert.doesNotMatch(service, /\bORIGIN\b|\bFEED\b|chronoversecapital\.com|fetchArticles/);
});
