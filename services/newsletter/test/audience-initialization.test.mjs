import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { fixture } from "./fixture.mjs";
import { audienceInitializationReady, ENROLLMENT_POLICY, FORWARD_ONLY_STATUS, subscriberId, campaignEligible } from "../src/domain.mjs";

const approval = { migrationComplete: false, forwardOnlyReady: true, forwardOnlyPolicy: ENROLLMENT_POLICY, historicalRecoveryStatus: FORWARD_ONLY_STATUS, forwardOnlyReceipt: "a".repeat(64) };
test("owner-approved forward-only initialization admits new consent without falsifying migration completion", async () => {
  const f = fixture(); Object.assign(f.state.documents.get("CONTROL"), approval);
  const address = "new-forward@example.test", id = subscriberId(address);
  assert.equal((await f.subscribe(address)).statusCode, 202);
  const row = f.state.documents.get(`SUB#${id}`);
  assert.equal(campaignEligible(row), false); assert.equal(f.state.sends.length, 1);
  assert.equal((await f.api("/confirm", { token: f.token(id, "confirm", row.confirmationNonce, f.state.time + 60000) })).statusCode, 200);
  assert.equal(campaignEligible(row), true); assert.equal(f.state.documents.get("CONTROL").migrationComplete, false);
  assert.equal((await f.api("/unsubscribe", { token: f.token(id, "unsubscribe", row.unsubscribeNonce) })).statusCode, 200);
  assert.equal(campaignEligible(f.state.documents.get(row.pk)), false);
  await f.subscribe(address); assert.equal(f.state.sends.length, 1);
});
for (const field of ["forwardOnlyReady", "forwardOnlyPolicy", "historicalRecoveryStatus", "forwardOnlyReceipt"]) test(`forward-only consent fails closed when ${field} is missing or malformed`, async () => {
  for (const value of [undefined, false, "true", "", "f".repeat(63), "wrong-policy"]) {
    const f = fixture(); Object.assign(f.state.documents.get("CONTROL"), approval, { [field]: value });
    assert.equal(audienceInitializationReady(f.state.documents.get("CONTROL")), false);
    assert.equal((await f.subscribe("new-forward@example.test")).statusCode, 503); assert.equal(f.state.sends.length, 0);
  }
});

const setup = `import importlib.util, pathlib, types, json, copy, decimal
p=pathlib.Path(${JSON.stringify(fileURLToPath(new URL("../scripts/cloudshell-signup-release.py", import.meta.url)))})
s=importlib.util.spec_from_file_location('release',p);m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
r=object.__new__(m.Release);r.meta={'account':'957261948953','region':'eu-north-1'};r.resources={'Ledger':'synthetic-ledger'}
docs={'CONTROL':{'pk':'CONTROL','migrationComplete':False,'deliveryEnabled':False,'registrationEnabled':False,'confirmationEnabled':False,'contentStartAt':123,'contentSourceApproved':True}}
calls=[]
def put(**args):
 assert args['Item']['pk'] not in docs
 docs[args['Item']['pk']]=copy.deepcopy(args['Item']);calls.append(args)
r.table=types.SimpleNamespace(get_item=lambda **kw:{'Item':copy.deepcopy(docs.get(kw['Key']['pk']))} if kw['Key']['pk'] in docs else {},put_item=put)
r.control=lambda:copy.deepcopy(docs['CONTROL']);r.schedules_off=lambda:None;r.subscribers=lambda:copy.deepcopy({k:v for k,v in docs.items() if k.startswith('SUB#')})
def unwire(value):
 if 'S' in value:return value['S']
 if 'BOOL' in value:return value['BOOL']
 if 'N' in value:return int(value['N'])
 raise AssertionError('unexpected attribute type')
def transaction(**args):
 assert len(args['TransactItems'])==2
 p,u=[list(x.values())[0] for x in args['TransactItems']]
 assert p['ConditionExpression']=='attribute_not_exists(pk)' and unwire(p['Item']['pk']) not in docs
 assert u['Key']=={'pk':{'S':'CONTROL'}} and 'migrationComplete' not in u['UpdateExpression']
 assert 'attribute_exists(pk)' in u['ConditionExpression'] and all(docs['CONTROL'][k] is False for k in ['deliveryEnabled','registrationEnabled','confirmationEnabled'])
 assert all(k not in docs['CONTROL'] for k in ['forwardOnlyReady','forwardOnlyReceipt','forwardOnlyPolicy','historicalRecoveryStatus'])
 values={k:unwire(v) for k,v in u['ExpressionAttributeValues'].items()}
 docs[unwire(p['Item']['pk'])]={k:unwire(v) for k,v in p['Item'].items()}
 for assignment in u['UpdateExpression'][4:].split(', '):
  key,value=assignment.split('=');docs['CONTROL'][key]=values[value]
 calls.append(args)
r.client=lambda name:types.SimpleNamespace(transact_write_items=transaction)
`;
function python(code) {
  const result = spawnSync(process.platform === "win32" ? "python" : "python3", ["-B", "-c", setup + code], { encoding: "utf8", windowsHide: true });
  assert.equal(result.status, 0, result.stderr || result.stdout);
}
test("empty AWS Ledger can initialize once, with unresolved history explicitly retained and CONTROL preserved", () => {
  python(`before=copy.deepcopy(docs['CONTROL'])
row=r.initialize_audience(True);assert m.audience.ready(r.control())
assert all(docs['CONTROL'][k]==v for k,v in before.items())
body=json.loads(row['body']);assert body['historicalRecoveryComplete'] is False and body['existingAwsSubscriberCount']==0 and body['initialFreshConfirmedCount']==0
count=len(calls);r.initialize_audience(True);assert len(calls)==count
r.state={};r.save=lambda:None;r.capture_baseline();assert r.state['historicalBaseline']=={} and r.state['historicalCount']==0
`);
});
test("initialization preserves AWS subscribers, first suppressions, exact numeric consent history and later opt-outs", () => {
  python(`docs.update({'SUB#held':{'pk':'SUB#held','id':'held','state':'HOLD','consentAt':decimal.Decimal('123.50')},'SUB#suppressed':{'pk':'SUB#suppressed','id':'suppressed','state':'SUPPRESSED','suppressedAt':0,'suppressionReason':'unsubscribe','consentText':'original'}})
before=r.subscribers();r.initialize_audience(True);assert r.subscribers()==before
docs['SUB#held']['state']='SUPPRESSED';docs['SUB#held']['suppressionReason']='complaint'
count=len(calls);r.initialize_audience(True);assert len(calls)==count and docs['SUB#held']['state']=='SUPPRESSED'
assert not any(x.get('Item',{}).get('pk','').startswith('SUB#') for x in calls)
`);
});
test("corrupt receipt or lost baseline cannot be used as initialization evidence", () => {
  python(`r.initialize_audience(True)
row=docs[m.audience.KEY];row['body']=row['body']+' '
try:m.audience.verify(r)
except RuntimeError:pass
else:raise AssertionError('corrupt receipt accepted')
row['body']=row['body'][:-1];key=json.loads(row['body'])['baselineKeys'][0];del docs[key]
try:m.audience.verify(r)
except RuntimeError:pass
else:raise AssertionError('missing provenance accepted')
`);
});
test("an incomplete initialization cannot arm enrollment, and a mismatched prior receipt is never replaced", () => {
  python(`original=transaction
def fail(**args):raise RuntimeError('synthetic interrupted transaction')
r.client=lambda name:types.SimpleNamespace(transact_write_items=fail)
try:r.initialize_audience(True)
except RuntimeError:pass
else:raise AssertionError('interruption ignored')
assert not m.audience.ready(r.control()) and m.audience.KEY not in docs
r.client=lambda name:types.SimpleNamespace(transact_write_items=original);r.initialize_audience(True)
docs['CONTROL']['forwardOnlyReceipt']='b'*64
count=len(calls)
try:r.initialize_audience(True)
except RuntimeError:pass
else:raise AssertionError('receipt replaced')
assert len(calls)==count
`);
});
