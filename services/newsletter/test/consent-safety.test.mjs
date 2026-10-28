import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const template = JSON.parse(readFileSync(new URL('../consent-safety-template.json', import.meta.url)));
const resources = template.Resources;
const definition = JSON.parse(resources.Closer.Properties.DefinitionString['Fn::Sub']);
const statements = role => resources[role].Properties.Policies.flatMap(p => p.PolicyDocument.Statement);

test('companion adds a separate recipient policy without managing existing newsletter resources', () => {
  const types = Object.values(resources).map(r => r.Type);
  assert.ok(!types.some(t => /Lambda|DynamoDB|SES::|ApiGateway/.test(t)));
  const p = resources.AdditionalRecipientPermission;
  assert.equal(p.Condition, 'AllowAdditionalRecipient');
  assert.equal(template.Parameters.AdditionalRecipientPermissionEnabled.Default, 'true');
  assert.deepEqual(p.Properties.Roles, [{ Ref: 'ApiRoleName' }]);
  assert.notEqual(p.Properties.PolicyName, 'newsletter-scoped');
});

test('additional recipient is exact, private, sender-bound and reversible', () => {
  assert.equal(template.Parameters.AdditionalTestRecipient.NoEcho, true);
  const allowed = new RegExp(template.Parameters.AdditionalTestRecipient.AllowedPattern);
  assert.ok(allowed.test('acceptance@example.test'));
  assert.ok(!allowed.test('*@example.test'));
  assert.ok(!allowed.test('acceptance?@example.test'));
  const s = resources.AdditionalRecipientPermission.Properties.PolicyDocument.Statement[0];
  assert.deepEqual(s.Action, ['ses:SendEmail']);
  assert.deepEqual(s.Resource, [{ Ref: 'IdentityArn' }, { Ref: 'ConfigurationSetArn' }]);
  assert.deepEqual(s.Condition['ForAllValues:StringEquals']['ses:Recipients'], [{ Ref: 'AdditionalTestRecipient' }]);
  assert.equal(s.Condition.Null['ses:Recipients'], 'false');
  assert.deepEqual(s.Condition.StringEquals['ses:FromAddress'], { Ref: 'SenderEmail' });
  assert.deepEqual(template.Parameters.SenderEmail.AllowedValues, ['info@chronoversecapital.com']);
});

test('execution input cannot change the table, key, fields or false values', () => {
  const d = definition;
  assert.equal(d.StartAt, 'CloseConsent');
  assert.deepEqual(Object.keys(d.States), ['CloseConsent']);
  const task = d.States.CloseConsent;
  assert.equal(task.InputPath, null);
  assert.deepEqual(task.Parameters.Key, { pk: { S: 'CONTROL' } });
  assert.deepEqual(task.Parameters.ExpressionAttributeValues, { ':closed': { BOOL: false } });
  assert.equal(task.Parameters.UpdateExpression, 'SET #registration = :closed, #confirmation = :closed');
  assert.equal(task.Parameters.ConditionExpression, 'attribute_exists(#pk)');
  assert.equal(task.Parameters.ReturnValues, 'NONE');
  assert.ok(!JSON.stringify(task.Parameters).includes('deliveryEnabled'));
  assert.ok(!JSON.stringify(task).includes('.$'));
});

test('closer permission is limited to two CONTROL attributes without subscriber or secret access', () => {
  const [s] = statements('CloserRole');
  assert.deepEqual(s.Action, ['dynamodb:UpdateItem']);
  assert.deepEqual(s.Condition['ForAllValues:StringEquals']['dynamodb:LeadingKeys'], ['CONTROL']);
  assert.deepEqual(s.Condition['ForAllValues:StringEquals']['dynamodb:Attributes'], ['pk', 'registrationEnabled', 'confirmationEnabled']);
  assert.equal(s.Condition.StringEquals['dynamodb:ReturnValues'], 'NONE');
  assert.equal(s.Condition.Null['dynamodb:LeadingKeys'], 'false');
  assert.equal(s.Condition.Null['dynamodb:Attributes'], 'false');
  assert.notEqual(s.Resource, '*');
  assert.equal(statements('CloserRole').length, 1);
});

test('deadline is disabled by default with no flexible window and bounded retries', () => {
  const s = resources.DeadlineSchedule.Properties;
  assert.equal(s.State, 'DISABLED');
  assert.equal(s.ScheduleExpression, 'at(2099-01-01T00:00:00)');
  assert.equal(s.ScheduleExpressionTimezone, 'UTC');
  assert.equal(s.ActionAfterCompletion, undefined, 'CloudFormation Schedule does not support this API-only property');
  assert.deepEqual(s.FlexibleTimeWindow, { Mode: 'OFF' });
  assert.equal(s.Target.Input, '{}');
  assert.deepEqual(s.Target.RetryPolicy, { MaximumEventAgeInSeconds: 60, MaximumRetryAttempts: 1 });
  assert.equal(resources.Closer.Properties.StateMachineType, 'STANDARD');
  assert.equal(definition.TimeoutSeconds, 90);
  assert.equal(definition.States.CloseConsent.TimeoutSeconds, 15);
});

test('scheduler cannot directly write CONTROL and trusts only its dedicated group', () => {
  assert.deepEqual(statements('SchedulerRole').flatMap(s => s.Action), ['states:StartExecution', 'sqs:SendMessage']);
  const trust = resources.SchedulerRole.Properties.AssumeRolePolicyDocument.Statement[0];
  assert.deepEqual(trust.Condition.ArnEquals['aws:SourceArn'], { 'Fn::GetAtt': ['SafetyGroup', 'Arn'] });
  assert.deepEqual(trust.Condition.StringEquals['aws:SourceAccount'], { Ref: 'AWS::AccountId' });
  assert.deepEqual(resources.CloserRole.Properties.AssumeRolePolicyDocument.Statement[0].Condition.ArnEquals['aws:SourceArn'], {
    'Fn::Sub': 'arn:${AWS::Partition}:states:${AWS::Region}:${AWS::AccountId}:stateMachine:${AWS::StackName}-close'
  });
});

test('execution and scheduler failures remain observable without sending notifications', () => {
  const q = resources.FailureQueue;
  assert.equal(q.Properties.SqsManagedSseEnabled, true);
  assert.equal(q.Properties.MessageRetentionPeriod, 1209600);
  assert.equal(q.DeletionPolicy, 'Retain');
  for (const name of ['ClosureFailureAlarm', 'SchedulerFailureAlarm', 'FailureQueueAlarm']) {
    assert.equal(resources[name].Type, 'AWS::CloudWatch::Alarm');
    assert.equal(resources[name].Properties.ActionsEnabled, false);
    assert.equal(resources[name].Properties.AlarmActions, undefined);
  }
  assert.deepEqual(resources.DeadlineSchedule.Properties.Target.DeadLetterConfig, { Arn: { 'Fn::GetAtt': ['FailureQueue', 'Arn'] } });
});
