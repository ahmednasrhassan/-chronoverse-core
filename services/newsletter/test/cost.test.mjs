import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { emitNewsletterMetric } from "../src/aws.mjs";
import { fixture } from "./fixture.mjs";

const template = JSON.parse(readFileSync(new URL("../template.json", import.meta.url), "utf8"));
const emitted = signal => { const lines = []; emitNewsletterMetric(signal, line => lines.push(line)); assert.equal(lines.length, 1); return JSON.parse(lines[0]); };

test("normal diagnostics remain visible without generating paid custom metric series", () => {
  for (const signal of ["Suppressed", "Accepted", "Confirmed", "Paused", "EmptyFeed", "PlannedPage", "DuplicateHeld", "ContactSynced", "Delivered"]) {
    const entry = emitted(signal);
    assert.equal(entry.signal, signal); assert.equal(entry.count, 1);
    assert.equal(entry._aws, undefined); assert.equal(entry.SafetyFailure, undefined);
  }
});

test("every former failure alarm and bounce/complaint/stuck signal uses one dimensionless fault metric", () => {
  for (const signal of ["Held", "ApiFailure", "ProviderFailure", "QueueProcessingFailure", "Throttled", "HardBounce", "Complaint", "ExpiredCampaign"]) {
    const entry = emitted(signal);
    assert.equal(entry.signal, signal); assert.equal(entry.SafetyFailure, 1);
    const emf = entry._aws.CloudWatchMetrics;
    assert.equal(emf.length, 1); assert.equal(emf[0].Namespace, "Chronoverse/Newsletter");
    assert.deepEqual(emf[0].Dimensions, [[]]);
    assert.deepEqual(emf[0].Metrics, [{ Name: "SafetyFailure", Unit: "Count" }]);
    assert.ok(Number.isSafeInteger(entry._aws.Timestamp));
  }
});

test("unknown diagnostics cannot expose caller text or create high-cardinality metrics", () => {
  const sensitive = "synthetic@example.test?token=synthetic-token";
  const entry = emitted(sensitive);
  assert.equal(entry.signal, "UnknownSignal"); assert.equal(entry.SafetyFailure, 1);
  assert.equal(JSON.stringify(entry).includes(sensitive), false);
});

test("hard bounce and complaint visibility follows durable suppression and deduplicated feedback", async () => {
  for (const type of ["Bounce", "Complaint"]) {
    const f = fixture(), job = f.confirmed();
    const envelope = { Type: "Notification", TopicArn: f.env.FEEDBACK_TOPIC_ARN, MessageId: `synthetic-${type}`, Message: JSON.stringify({ eventType: type,
      bounce: { bounceType: "Permanent", bouncedRecipients: [{ emailAddress: "reader@example.test" }] },
      complaint: { complainedRecipients: [{ emailAddress: "reader@example.test" }] } }) };
    await f.service.feedback(envelope); await f.service.feedback(envelope);
    const signal = type === "Bounce" ? "HardBounce" : "Complaint";
    assert.equal(f.state.documents.get(`SUB#${job.id}`).state, "SUPPRESSED");
    assert.equal(f.state.metrics.filter(m => m === signal).length, 1); assert.equal(f.state.sends.length, 0);
  }
});

test("transient bounce and ordinary unsubscribe do not become complaint/hard-bounce alarms", async () => {
  const f = fixture(), job = f.confirmed();
  await f.service.feedback({ Type: "Notification", TopicArn: f.env.FEEDBACK_TOPIC_ARN, MessageId: "synthetic-transient", Message: JSON.stringify({ eventType: "Bounce", bounce: { bounceType: "Transient", bouncedRecipients: [{ emailAddress: "reader@example.test" }] } }) });
  assert.equal(f.state.documents.get(`SUB#${job.id}`).state, "CONFIRMED");
  assert.equal((await f.api("/unsubscribe", { token: f.token(job.id) })).statusCode, 200);
  assert.equal(f.state.metrics.includes("HardBounce"), false); assert.equal(f.state.metrics.includes("Complaint"), false);
});

test("four alarms monitor eight underlying metrics, not four billable metric units", () => {
  const alarms = Object.values(template.Resources).filter(r => r.Type === "AWS::CloudWatch::Alarm");
  assert.equal(alarms.length, 4);
  const count = alarms.reduce((n, r) => n + (r.Properties.Metrics ? r.Properties.Metrics.filter(m => m.MetricStat).length : 1), 0);
  assert.equal(count, 8);
  for (const { Properties: p } of alarms) {
    assert.equal(p.TreatMissingData, "notBreaching");
    assert.equal(p.EvaluationPeriods, 1);
    assert.deepEqual(p.AlarmActions, { "Fn::If": ["HasAlarmTopic", [{ Ref: "AlarmTopicArn" }], { Ref: "AWS::NoValue" }] });
  }
});

test("regional execution alarm covers both errors and invocation throttles without per-function duplication", () => {
  const metrics = template.Resources.ExecutionHealthAlarm.Properties.Metrics;
  assert.equal(metrics.find(m => m.ReturnData).Expression, "MAX([errors,throttles])");
  assert.deepEqual(metrics.filter(m => m.MetricStat).map(m => m.MetricStat.Metric.MetricName).sort(), ["Errors", "Throttles"]);
  for (const { MetricStat: stat } of metrics.filter(m => m.MetricStat)) {
    assert.equal(stat.Metric.Namespace, "AWS/Lambda"); assert.equal(stat.Metric.Dimensions, undefined);
    assert.equal(stat.Period, 300); assert.equal(stat.Stat, "Sum");
  }
});

test("backlog detection covers all queues and converts stream milliseconds to seconds", () => {
  const p = template.Resources.SafetyBacklogAlarm.Properties;
  assert.equal(p.Threshold, 3600);
  assert.equal(p.Metrics.find(m => m.ReturnData).Expression, "MAX([contacts/1000,feedback,planner,digest])");
  const direct = p.Metrics.filter(m => m.MetricStat);
  assert.equal(direct.length, 4);
  const contacts = direct.find(m => m.Id === "contacts").MetricStat;
  assert.equal(contacts.Metric.MetricName, "IteratorAge"); assert.equal(contacts.Metric.Namespace, "AWS/Lambda");
  assert.deepEqual(contacts.Metric.Dimensions, [{ Name: "FunctionName", Value: { Ref: "ContactSyncFunction" } }]);
  for (const [id, queue] of [["feedback", "FeedbackQueue"], ["planner", "PlanQueue"], ["digest", "DigestQueue"]]) {
    const m = direct.find(m => m.Id === id).MetricStat.Metric;
    assert.equal(m.MetricName, "ApproximateAgeOfOldestMessage");
    assert.deepEqual(m.Dimensions, [{ Name: "QueueName", Value: { "Fn::GetAtt": [queue, "QueueName"] } }]);
  }
  // A stall in any input alone must breach; unlike a sum, ages share one unit.
  for (const input of [[3600000, 0, 0, 0], [0, 3600, 0, 0], [0, 0, 3600, 0], [0, 0, 0, 3600]]) assert.ok(Math.max(input[0] / 1000, ...input.slice(1)) >= p.Threshold);
});

test("shorter diagnostic retention leaves durable consent/recovery and safety processing intact", () => {
  const groups = Object.values(template.Resources).filter(r => r.Type === "AWS::Logs::LogGroup");
  assert.equal(groups.length, 5);
  for (const g of groups) { assert.equal(g.Properties.RetentionInDays, 14); assert.equal(g.DeletionPolicy, "Retain"); }
  const ledger = template.Resources.Ledger;
  assert.equal(ledger.Properties.BillingMode, "PAY_PER_REQUEST");
  assert.equal(ledger.Properties.PointInTimeRecoverySpecification.PointInTimeRecoveryEnabled, true);
  assert.equal(ledger.Properties.DeletionProtectionEnabled, true); assert.equal(ledger.DeletionPolicy, "Retain");
  assert.equal(template.Resources.FeedbackMapping.Properties.Enabled, true);
  assert.equal(template.Resources.ContactsMapping.Properties.Enabled, undefined);
  for (const id of ["PlanQueue", "DigestQueue", "FeedbackQueue", "FailureQueue"]) {
    assert.equal(template.Resources[id].Properties.MessageRetentionPeriod, 1209600);
    assert.equal(template.Resources[id].Properties.SqsManagedSseEnabled, true);
  }
  for (const flag of ["DeliveryEnabled", "RegistrationEnabled", "ConfirmationEnabled", "LegacyDispatchRetired", "ComplianceApproved"]) assert.equal(template.Parameters[flag].Default, "false");
});
