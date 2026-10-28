import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { capability } from "../src/domain.mjs";

const path = fileURLToPath(new URL("../scripts/complete-unsubscribe-acceptance.py", import.meta.url));
const setup = `import importlib.util, copy, io, json, zipfile, types, contextlib, sys
s=importlib.util.spec_from_file_location('completion',${JSON.stringify(path)});m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
`;
function python(code) {
  const result = spawnSync(process.platform === "win32" ? "python" : "python3", ["-B", "-c", setup + code], { encoding: "utf8", windowsHide: true });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

test("one-file runtime correction preserves every other archive member and rejects uncertain input", () => {
  python(`old=b'prefix; if (action === "confirm") page.headers["referrer-policy"] = "strict-origin"; suffix'
new=old.replace(b'if (action === "confirm") ',b'')
output=io.BytesIO()
with zipfile.ZipFile(output,'w',compression=zipfile.ZIP_DEFLATED) as z:
 z.writestr('src/http.mjs',old);z.writestr('src/service.mjs',b'unchanged');z.writestr('node_modules/private/package.json',b'unchanged dependency')
blob=output.getvalue();m.BASE=m.sha(blob);m.OLD_HTTP=m.sha(old);m.NEW_HTTP=m.sha(new)
result=m.corrected_archive(blob)
with zipfile.ZipFile(io.BytesIO(result)) as z:
 assert z.read('src/http.mjs')==new and z.read('src/service.mjs')==b'unchanged'
 assert z.read('node_modules/private/package.json')==b'unchanged dependency'
for bad in [blob+b'extra',b'not a zip']:
 try:m.corrected_archive(bad)
 except m.SafetyStop:pass
 else:raise AssertionError('unknown archive accepted')
m.OLD_HTTP='0'*64
try:m.corrected_archive(blob)
except m.SafetyStop:pass
else:raise AssertionError('unexpected source accepted')
`);
});

test("CloudFormation review rejects foreign integrations, IAM changes, replacement and extra resources", () => {
  python(`current={'Resources':{'ApiFunction':{'Properties':{'Code':{'S3Key':'old'},'Handler':'src/handlers.api'}},'HttpApi':{'Properties':{'Body':{'target':'unqualified'}}}}}
processed=copy.deepcopy(current);processed['Resources']['ApiFunction']['Properties']['Code']={'S3Key':'new'}
change={'Status':'CREATE_COMPLETE','ExecutionStatus':'AVAILABLE','Changes':[{'ResourceChange':{'LogicalResourceId':'ApiFunction','ResourceType':'AWS::Lambda::Function','Action':'Modify','Replacement':'False','Scope':['Properties'],'Details':[{'Target':{'Attribute':'Properties','Name':'Code','RequiresRecreation':'Never'}}]}}]}
m.validate_change_set(change,current,processed)
cases=[]
x=copy.deepcopy(change);x['Changes']*=2;cases.append((x,processed))
x=copy.deepcopy(change);x['Changes'][0]['ResourceChange']['Replacement']='True';cases.append((x,processed))
x=copy.deepcopy(change);x['Changes'][0]['ResourceChange']['Details'][0]['Target']['Name']='Role';cases.append((x,processed))
x=copy.deepcopy(change);x['ExecutionStatus']='EXECUTE_IN_PROGRESS';cases.append((x,processed))
x=copy.deepcopy(processed);x['Resources']['HttpApi']['Properties']['Body']['target']='foreign';cases.append((change,x))
x=copy.deepcopy(processed);x['Resources']['ApiFunction']['Properties']['Handler']='other';cases.append((change,x))
for c,p in cases:
 try:m.validate_change_set(c,current,p)
 except m.SafetyStop:pass
 else:raise AssertionError('uncertain change set accepted')
`);
});

test("deadline-independent completion rejects malformed or enabled gates and enabled schedules", () => {
  python(`op=object.__new__(m.Operation)
closed={k:{'BOOL':False} for k in ['registrationEnabled','confirmationEnabled','deliveryEnabled']}
control=copy.deepcopy(closed);state=['DISABLED'];op.row=lambda pk:control
op.clients={'scheduler':types.SimpleNamespace(get_schedule=lambda **kw:{'State':state[0]})}
op.closed()
for value in [{},{'BOOL':True},{'BOOL':0},{'BOOL':'false'},{'S':'false'},{'NULL':True}]:
 for name in closed:
  control=copy.deepcopy(closed);control[name]=value
  try:op.closed()
  except m.SafetyStop:pass
  else:raise AssertionError('gate uncertainty accepted')
control=copy.deepcopy(closed);state[0]='ENABLED'
try:op.closed()
except m.SafetyStop:pass
else:raise AssertionError('enabled schedule accepted')
`);
});

test("Python operation uses exactly the existing secure purpose-bound signer format", () => {
  const key = "synthetic-offline-capability-key-at-least-32-bytes";
  const identity = "a".repeat(64), nonce = "b".repeat(32);
  const actual = python(`print(m.capability(${JSON.stringify(key)},${JSON.stringify(identity)},${JSON.stringify(nonce)}))`);
  assert.equal(actual, capability(key, "unsubscribe", identity, nonce));
});

const acceptanceSetup = `op=object.__new__(m.Operation)
op.identity='a'*64;op.recipient='reader@example.test';op.secret_arn='synthetic';op.table='synthetic';op.contact_list='synthetic'
before={'pk':{'S':'SUB#'+op.identity},'id':{'S':op.identity},'email':{'S':op.recipient},'state':{'S':'CONFIRMED'},'unsubscribeNonce':{'S':'b'*32},'audienceKey':{'S':'AUDIENCE#10'},'confirmedAt':{'N':'1'}}
row=copy.deepcopy(before);audit={'pk':{'S':'synthetic-audit'},'at':{'N':'2'}};history={'historical':'unchanged','claim':'unchanged'}
op.row=lambda pk:copy.deepcopy(row if pk.startswith('SUB#') else audit)
op.history=copy.deepcopy(history);op.histories=lambda:copy.deepcopy(history);op.closed=lambda:None
calls=[]
def request(method,path,token,body=None):
 calls.append((method,path,copy.deepcopy(body)))
 if method=='GET':
  assert row==before
  return 200,'strict-origin'
 row['state']={'S':'SUPPRESSED'};row.pop('audienceKey',None)
 row.setdefault('suppressedAt',{'N':'2'});row.setdefault('suppressionReason',{'S':'unsubscribe'})
 return 200,'no-referrer'
m.http=request
op.clients={'secretsmanager':types.SimpleNamespace(get_secret_value=lambda **kw:{'SecretString':json.dumps({'capabilityKey':'synthetic-offline-signing-key-long-enough'})}),
'sesv2':types.SimpleNamespace(get_contact=lambda **kw:{'UnsubscribeAll':True,'TopicPreferences':[{'TopicName':'weekly-research','SubscriptionStatus':'OPT_OUT'}]}),
'dynamodb':types.SimpleNamespace(query=lambda **kw:{'Items':[]})}
`;

test("targeted acceptance proves review/cancel, suppression, SES opt-out and stable repeated/one-click calls", () => {
  python(acceptanceSetup + `op.acceptance()
assert [c[0] for c in calls]==['GET','POST','POST','POST']
assert all(c[1]=='/unsubscribe' for c in calls)
assert calls[-1][2]['List-Unsubscribe']=='One-Click' and row['state']=={'S':'SUPPRESSED'}
assert history==op.history and 'audienceKey' not in row
`);
});

test("acceptance rejects non-confirmed identities before capability use or writes", () => {
  python(acceptanceSetup + `for state in ['PENDING','HOLD','SUPPRESSED']:
 row['state']={'S':state}
 try:op.acceptance()
 except m.SafetyStop:pass
 else:raise AssertionError('ineligible identity accepted')
assert calls==[]
`);
});

test("an uncertain unsubscribe stops without retries or false finalization", () => {
  python(acceptanceSetup + `def uncertain(method,path,token,body=None):
 calls.append(method)
 if method=='GET':return 200,'strict-origin'
 raise TimeoutError('PRIVATE_TOKEN_AND_URL')
m.http=uncertain
try:op.acceptance()
except TimeoutError:pass
else:raise AssertionError('uncertain outcome finalized')
assert calls==['GET','POST'] and row==before and op.stage=='targeted_unsubscribe_no_retry'
`);
});

test("incomplete SES synchronization or a truncated audience query cannot claim completion", () => {
  python(acceptanceSetup + `m.time.sleep=lambda _:None
for truncated in [True,False]:
 row=copy.deepcopy(before);calls.clear()
 op.clients['dynamodb'].query=lambda **kw:({'Items':[],'LastEvaluatedKey':{'pk':{'S':'more'}}} if truncated else {'Items':[]})
 op.clients['sesv2'].get_contact=lambda **kw:{'UnsubscribeAll':truncated,'TopicPreferences':[{'TopicName':'weekly-research','SubscriptionStatus':'OPT_OUT' if truncated else 'OPT_IN'}]}
 try:op.acceptance()
 except m.SafetyStop:pass
 else:raise AssertionError('unproven exclusion or synchronization accepted')
 assert [c[0] for c in calls]==['GET','POST']
`);
});

test("operation failures expose only sanitized stage/check metadata", () => {
  python(`sys.modules['boto3']=types.SimpleNamespace(Session=lambda **kw:object())
class Broken:
 def __init__(self,*args):self.stage='execute_code_only_change_set_no_retry';self.change_set='safe-change-set-id'
 def run(self):raise TimeoutError('PRIVATE_URL_TOKEN_SUBSCRIBER_KEY')
m.Operation=Broken;sys.argv=['completion','--recipient','reader@example.test','--preserve','historical@example.test']
out=io.StringIO()
with contextlib.redirect_stdout(out):assert m.main()==1
result=json.loads(out.getvalue());assert result['stage']=='execute_code_only_change_set_no_retry' and result['automaticReplay'] is False
assert 'PRIVATE' not in out.getvalue() and 'reader@' not in out.getvalue()
`);
});

test("uncertain CloudFormation execution is attempted once and leaves its exact identity for reconciliation", () => {
  python(`output=io.BytesIO()
with zipfile.ZipFile(output,'w') as z:z.writestr('src/http.mjs',b'if (action === "confirm") page.headers["referrer-policy"] = "strict-origin";')
blob=output.getvalue();m.BASE=m.sha(blob);m.OLD_HTTP=m.sha(b'if (action === "confirm") page.headers["referrer-policy"] = "strict-origin";');m.NEW_HTTP=m.sha(b'page.headers["referrer-policy"] = "strict-origin";')
op=object.__new__(m.Operation);op.stage='preflight';op.change_set=None
original={'Resources':{'ApiFunction':{'Properties':{'CodeUri':{'Bucket':m.BUCKET,'Key':'original','Version':'immutable'}}}}}
processed={'Resources':{'ApiFunction':{'Properties':{'Code':{'S3Key':'original'}}}}}
reviewed=copy.deepcopy(processed);reviewed['Resources']['ApiFunction']['Properties']['Code']={'S3Key':'new'}
op.read_template=lambda **kw: reviewed if kw.get('ChangeSetName') else (original if kw['TemplateStage']=='Original' else processed)
op.stack=lambda:{'StackStatus':'UPDATE_COMPLETE','LastUpdatedTime':'same','Parameters':[],'Capabilities':[]}
op.history={};op.histories=lambda:{};op.route_snapshot={};op.routes=lambda:{};op.closed=lambda:None
op.function_hashes=lambda:{'api':m.base64.b64encode(m.hashlib.sha256(blob).digest()).decode(),'worker':m.base64.b64encode(bytes.fromhex(m.OTHER_BASE)).decode()}
change={'Status':'CREATE_COMPLETE','ExecutionStatus':'AVAILABLE','Changes':[{'ResourceChange':{'LogicalResourceId':'ApiFunction','ResourceType':'AWS::Lambda::Function','Action':'Modify','Replacement':'False','Scope':['Properties'],'Details':[{'Target':{'Attribute':'Properties','Name':'Code','RequiresRecreation':'Never'}}]}}]}
executions=[]
def execute(**kw):
 executions.append(kw)
 raise TimeoutError('PRIVATE_PROVIDER_RESPONSE')
op.clients={'lambda':object(),'s3':types.SimpleNamespace(get_object=lambda **kw:{'Body':io.BytesIO(blob)},get_bucket_versioning=lambda **kw:{'Status':'Enabled'},put_object=lambda **kw:{'VersionId':'new-immutable-version'}),
'cloudformation':types.SimpleNamespace(create_change_set=lambda **kw:{'Id':'exact-approved-change-set'},describe_change_set=lambda **kw:change,execute_change_set=execute)}
try:op.deploy()
except TimeoutError:pass
else:raise AssertionError('uncertain execution finalized')
assert len(executions)==1 and op.change_set=='exact-approved-change-set' and op.stage=='execute_code_only_change_set_no_retry'
`);
});

test("public sending proposal is unapplied and limited to two existing roles, exact sender, region and resources", () => {
  const proposal = JSON.parse(readFileSync(new URL("../deployments/public-sending-permission-proposal.json", import.meta.url), "utf8"));
  assert.equal(proposal.deploymentAuthorized, false); assert.equal(proposal.applied, false);
  assert.deepEqual(proposal.roles, ["chronoverse-newsletter-v2-ApiRole-iVVuu5uGbHpU", "chronoverse-newsletter-v2-WorkerRole-RMlreqzArmtX"]);
  const [grant] = proposal.policy.Statement;
  assert.equal(proposal.policy.Statement.length, 1); assert.equal(grant.Action, "ses:SendEmail");
  assert.deepEqual(grant.Resource, ["arn:aws:ses:eu-north-1:957261948953:identity/chronoversecapital.com", "arn:aws:ses:eu-north-1:957261948953:configuration-set/chronoverse-newsletter-v2-events"]);
  assert.deepEqual(grant.Condition, { StringEquals: { "ses:FromAddress": "info@chronoversecapital.com", "aws:RequestedRegion": "eu-north-1" }, Null: { "ses:Recipients": "false" } });
  assert.match(proposal.recipientScope, /requires explicit owner approval/);
});
