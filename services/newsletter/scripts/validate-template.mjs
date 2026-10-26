import assert from "node:assert/strict";

// Project-specific static alarm checks. Full SAM/CloudFormation schema validation
// still runs separately; new expression forms require an explicit local review.
export function validateAlarms(template) {
  const alarms = Object.entries(template.Resources).filter(([, r]) => r.Type === "AWS::CloudWatch::Alarm");
  assert.equal(alarms.length, 4, "Newsletter must retain all four safety alarms");
  const period = n => Number.isInteger(n) && n >= 60 && n % 60 === 0;
  const metric = (m, label) => {
    assert.ok(typeof m?.Namespace === "string" && m.Namespace.length, `${label}: Namespace required`);
    assert.ok(typeof m.MetricName === "string" && m.MetricName.length, `${label}: MetricName required`);
    if (m.Dimensions !== undefined) {
      assert.ok(Array.isArray(m.Dimensions) && m.Dimensions.length <= 30, `${label}: invalid Dimensions`);
      const names = new Set();
      for (const d of m.Dimensions) {
        assert.ok(typeof d.Name === "string" && d.Name.length && !names.has(d.Name), `${label}: invalid/duplicate dimension`);
        assert.ok(typeof d.Value === "string" ? d.Value.length > 0 : d.Value && typeof d.Value === "object" && !Array.isArray(d.Value), `${label}: dimension Value required`);
        names.add(d.Name);
      }
    }
  };
  for (const [id, { Properties: p }] of alarms) {
    assert.ok(p && typeof p.Threshold === "number" && Number.isFinite(p.Threshold), `${id}: finite numeric Threshold required`);
    assert.equal(p.ThresholdMetricId, undefined, `${id}: static alarms cannot use ThresholdMetricId`);
    assert.ok(["GreaterThanOrEqualToThreshold", "GreaterThanThreshold", "LessThanOrEqualToThreshold", "LessThanThreshold"].includes(p.ComparisonOperator), `${id}: invalid static ComparisonOperator`);
    assert.ok(Number.isInteger(p.EvaluationPeriods) && p.EvaluationPeriods > 0, `${id}: EvaluationPeriods required`);
    if (p.DatapointsToAlarm !== undefined) assert.ok(Number.isInteger(p.DatapointsToAlarm) && p.DatapointsToAlarm > 0 && p.DatapointsToAlarm <= p.EvaluationPeriods, `${id}: invalid DatapointsToAlarm`);
    assert.equal(p.TreatMissingData, "notBreaching", `${id}: missing data policy changed`);
    assert.deepEqual(p.AlarmActions, { "Fn::If": ["HasAlarmTopic", [{ Ref: "AlarmTopicArn" }], { Ref: "AWS::NoValue" }] }, `${id}: optional notification condition changed`);
    if (p.Metrics !== undefined) {
      for (const field of ["Namespace", "MetricName", "Dimensions", "Period", "Statistic", "ExtendedStatistic", "Unit"]) assert.equal(p[field], undefined, `${id}: Metrics conflicts with ${field}`);
      assert.ok(Array.isArray(p.Metrics) && p.Metrics.length > 0 && p.Metrics.length <= 20, `${id}: invalid Metrics`);
      const ids = new Set();
      for (const q of p.Metrics) {
        assert.ok(typeof q.Id === "string" && /^[a-z][a-zA-Z0-9_]{0,254}$/.test(q.Id) && !ids.has(q.Id), `${id}: invalid/duplicate metric Id`);
        ids.add(q.Id);
        assert.equal(typeof q.ReturnData, "boolean", `${id}: explicit ReturnData required`);
        assert.notEqual(q.Expression !== undefined, q.MetricStat !== undefined, `${id}: specify Expression or MetricStat exclusively`);
      }
      const outputs = p.Metrics.filter(q => q.ReturnData);
      assert.equal(outputs.length, 1, `${id}: exactly one ReturnData output required`);
      assert.ok(outputs[0].Expression, `${id}: output must be a single time series expression`);
      const stats = p.Metrics.filter(q => q.MetricStat);
      assert.ok(stats.length > 0 && stats.length <= 10, `${id}: invalid metric count`);
      assert.ok(p.Metrics.length - stats.length <= 10, `${id}: invalid expression count`);
      for (const q of stats) {
        metric(q.MetricStat.Metric, `${id}.${q.Id}`);
        assert.ok(period(q.MetricStat.Period), `${id}: invalid standard metric period`);
        assert.ok(["Sum", "Maximum", "Minimum", "Average", "SampleCount"].includes(q.MetricStat.Stat), `${id}: invalid Stat`);
      }
      assert.equal(new Set(stats.map(q => q.MetricStat.Period)).size, 1, `${id}: metric periods must align`);
      for (const q of p.Metrics.filter(q => q.Expression !== undefined)) {
        // MAX of an array of time series returns one time series; MAX(single
        // time series) instead returns a scalar and is unsuitable here.
        assert.ok(typeof q.Expression === "string" && /^MAX\(\[[a-zA-Z0-9_,/.]+\]\)$/.test(q.Expression), `${id}: unsupported single-series expression`);
        for (const term of q.Expression.slice(5, -2).split(",")) {
          const parts = term.split("/");
          assert.ok(parts.length <= 2 && stats.some(s => s.Id === parts[0]), `${id}: expression references unknown/non-metric Id`);
          if (parts.length === 2) assert.ok(Number.isFinite(Number(parts[1])) && Number(parts[1]) > 0, `${id}: invalid expression divisor`);
        }
      }
    } else {
      metric(p, id);
      assert.ok(period(p.Period), `${id}: invalid standard metric Period`);
      assert.ok(["Sum", "Maximum", "Minimum", "Average", "SampleCount"].includes(p.Statistic), `${id}: Statistic required`);
      assert.equal(p.ExtendedStatistic, undefined, `${id}: Statistic conflicts with ExtendedStatistic`);
    }
  }
  return alarms.map(([id]) => id);
}
