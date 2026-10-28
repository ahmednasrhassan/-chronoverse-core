import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readCapability, campaignEligible } from "../src/domain.mjs";
import { fixture } from "./fixture.mjs";

function python(code) {
  const result = spawnSync(process.platform === "win32" ? "python" : "python3", ["-B", "-c", code], { encoding: "utf8", windowsHide: true, env: { ...process.env, NEWSLETTER_TEST_MAILBOX: "operator@example.test" } });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}
const setup = `import importlib.util, pathlib
p=pathlib.Path(${JSON.stringify(fileURLToPath(new URL("../scripts/cloudshell-signup-release.py", import.meta.url)))})
s=importlib.util.spec_from_file_location('release',p);m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
`;
test("CloudShell mutation commands refuse to run without explicit approval before any cloud access", () => {
  python(setup + `r=object.__new__(m.Release)
for method,args in [('initialize_audience',(False,)),('prepare',('disabled',False)),('execute',('disabled',False)),('arm',(False,False)),('signup',(False,)),('confirmed',(False,)),('feedback_test',(False,)),('unsubscribe',(False,)),('close',(False,)),('support_optout',(None,None,False)),('prepare_weekly',(None,False)),('execute_weekly',(False,)),('stop_weekly',(False,))]:
 try:getattr(r,method)(*args)
 except RuntimeError:pass
 else:raise AssertionError(method+' allowed an unapproved mutation')
`);
});
test("fresh change-set review rejects resource removal, addition and any replacement", () => {
  python(setup + `for change in [{'Action':'Remove'},{'Action':'Add'},{'Action':'Modify','Replacement':'True'},{'Action':'Modify','Replacement':'Conditional'}]:
 try:m.inspect_changes([{'ResourceChange':change}])
 except RuntimeError:pass
 else:raise AssertionError('unsafe resource change accepted')
m.inspect_changes([{'ResourceChange':{'Action':'Modify','Replacement':'False'}}])
`);
});
test("all CloudShell release phases preserve disabled delivery/scheduling and previous private parameter values", () => {
  python(setup + `t={'Parameters':{k:{} for k in m.FLAGS+['PublicOrigin','WeeklyScheduleEnabled','RuntimeObjectVersion','RegistrationTestRecipient','SecretsArn','PostalAddress']}}
for phase in ['disabled','test','public']:
 p={x['ParameterKey']:x for x in m.public_parameters({'SecretsArn','PostalAddress'},t,'versioned-artifact',phase)}
 assert p['DeliveryEnabled']['ParameterValue']=='false' and p['WeeklyScheduleEnabled']['ParameterValue']=='false'
 assert p['SecretsArn']=={'ParameterKey':'SecretsArn','UsePreviousValue':True}
 assert p['PostalAddress']=={'ParameterKey':'PostalAddress','UsePreviousValue':True}
 assert p['RegistrationTestRecipient']['ParameterValue']==(m.TEST_MAILBOX if phase=='test' else '')
 assert p['RegistrationEnabled']['ParameterValue']==('false' if phase=='disabled' else 'true')
`);
});
test("CloudShell's test unsubscribe token is compatible with the real v2 verifier", () => {
  const key = "synthetic-release-test-key-only-0123456789", id = "f".repeat(64), nonce = "u".repeat(32);
  const cap = python(setup + `print(m.token('${key}','unsubscribe','${id}','${nonce}'))`);
  assert.deepEqual(readCapability(key, cap, "unsubscribe", Date.now()), { purpose: "unsubscribe", id, nonce, exp: null });
  assert.throws(() => readCapability(key, cap, "confirm", Date.now()), /invalid_link/);
});

test("CloudShell and runtime agree on fresh-cohort eligibility and malformed proof denial", () => {
  const f = fixture(), job = f.confirmed(), valid = f.state.documents.get(`SUB#${job.id}`);
  const samples = [valid, { ...valid, confirmedPolicy: undefined }, { ...valid, awsRequestedAt: -1 }, { ...valid, awsRequestedAt: true }, { ...valid, awsRequestedAt: 1.5 }, { ...valid, suppressionReason: "unsubscribe" }, { ...valid, unsubscribeNonce: "bad" }];
  const results = python(setup + `import json
rows=json.loads(${JSON.stringify(JSON.stringify(samples))})
print(json.dumps([m.eligible(r) for r in rows]))`);
  assert.deepEqual(JSON.parse(results), samples.map(campaignEligible));
});

test("CloudShell isolation preserves exact historical evidence and refuses a forged renewal receipt", () => {
  python(setup + `import copy,types
r=object.__new__(m.Release);old={'pk':'SUB#old','id':'old','state':'CONFIRMED','consentText':'original','confirmedAt':'123'}
r.state={'historicalBaseline':{'SUB#old':old},'historicalBaselineSha256':m.sha(m.canonical({'SUB#old':old}).encode())};r.save=lambda:None
rows=copy.deepcopy(r.state['historicalBaseline']);r.subscribers=lambda:rows;r.table=types.SimpleNamespace(get_item=lambda **kw:{})
r.isolation();assert r.state['isolationVerified']
rows['SUB#old']['consentText']='replaced'
try:r.isolation()
except RuntimeError:pass
else:raise AssertionError('changed original consent accepted')
rows['SUB#old']['consentText']='original';rows['SUB#old'].update(confirmedPolicy=m.ENROLLMENT_POLICY,awsConsentVersion=m.CONSENT_VERSION,awsConsentText=m.CONSENT_TEXT,awsRequestedAt=100,confirmedAt=123,confirmedRequestNonce='p'*32,unsubscribeNonce='u'*32)
try:r.isolation()
except RuntimeError:pass
else:raise AssertionError('forged fresh receipt accepted without audits')
`);
});

test("CloudShell baseline refuses an empty or changing historical inventory without writing anything", () => {
  python(setup + `import types
r=object.__new__(m.Release);r.state={};r.paused=lambda:None;r.subscribers=lambda:{};r.table=types.SimpleNamespace(get_item=lambda **kw:{})
r.save=lambda:(_ for _ in ()).throw(AssertionError('baseline unexpectedly written'))
try:r.capture_baseline()
except RuntimeError:pass
else:raise AssertionError('empty historical inventory accepted')
rows=iter([{'SUB#a':{'state':'HOLD'}},{'SUB#a':{'state':'SUPPRESSED'}}]);r.subscribers=lambda:next(rows)
try:r.capture_baseline()
except RuntimeError:pass
else:raise AssertionError('racing snapshot accepted')
`);
});

test("manual support opt-out requires exact existing identity and retains first suppression under IAM operator audit", () => {
  python(setup + `import sys,types
fake=types.ModuleType('botocore.exceptions');fake.ClientError=type('ClientError',(Exception,),{});sys.modules['botocore']=types.ModuleType('botocore');sys.modules['botocore.exceptions']=fake
r=object.__new__(m.Release);email='owner@example.test';identifier=m.sha(email.encode());row={'pk':'SUB#'+identifier,'id':identifier,'email':email,'state':'SUPPRESSED','suppressedAt':123,'suppressionReason':'complaint','consentText':'original'};updates=[];audits=[]
def update(**args):
 assert args['ConditionExpression']=='attribute_exists(pk) AND id=:id AND email=:email'
 assert args['ExpressionAttributeValues'][':id']==identifier and args['ExpressionAttributeValues'][':email']==email
 assert 'if_not_exists(suppressedAt,:now)' in args['UpdateExpression'] and 'if_not_exists(suppressionReason,:reason)' in args['UpdateExpression']
 updates.append(args)
r.table=types.SimpleNamespace(get_item=lambda **kw:{'Item':row},update_item=update,put_item=lambda **kw:audits.append(kw))
r.client=lambda name:types.SimpleNamespace(get_caller_identity=lambda:{'Arn':'synthetic-operator'})
for address,evidence in [('unknown@example.test','a'*64),(email,None),(' OWNER@example.test','a'*64)]:
 try:r.support_optout(address,evidence,True)
 except RuntimeError:pass
 else:raise AssertionError('invalid support request accepted')
assert not updates and not audits
r.support_optout(email,'a'*64,True);assert len(updates)==len(audits)==1
assert row['consentText']=='original' and row['suppressedAt']==123 and row['suppressionReason']=='complaint'
assert audits[0]['Item']['operatorArn']=='synthetic-operator'
`);
});

test("weekly preparation cannot create a change set while the live website lacks its AWS link", () => {
  python(setup + `import types
r=object.__new__(m.Release);r.state={'deployedPhase':'public'};r.meta={'origin':'https://synthetic.execute-api.eu-north-1.amazonaws.com'}
r.schedules_off=lambda:None;r.readiness=lambda *args:None;r.weekly_preflight=lambda:None
class Response:
 status=200
 def __enter__(self):return self
 def __exit__(self,*args):pass
 def read(self,*args):return b'<html>signup paused</html>'
m.urllib.request.urlopen=lambda *args,**kw:Response()
try:r.prepare_weekly('a'*40,True)
except RuntimeError as e:assert 'does not publish' in str(e)
else:raise AssertionError('weekly update accepted broken website')
`);
});

test("weekly rollback closes only the delivery gate without rewriting subscriber consent or enabling anything", () => {
  python(setup + `import types
r=object.__new__(m.Release);r.state={};updates=[];r.table=types.SimpleNamespace(update_item=lambda **kw:updates.append(kw))
r.control=lambda:{'deliveryEnabled':False};r.schedules_off=lambda:None;r.save=lambda:None
r.stop_weekly(True)
assert updates==[{'Key':{'pk':'CONTROL'},'UpdateExpression':'SET deliveryEnabled=:no','ConditionExpression':'attribute_exists(pk)','ExpressionAttributeValues':{':no':False}}]
`);
});
