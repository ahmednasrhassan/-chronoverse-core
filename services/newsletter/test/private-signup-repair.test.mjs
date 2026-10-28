import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { fixture } from "./fixture.mjs";
import { CONSENT_TEXT, CONSENT_VERSION, subscriberId } from "../src/domain.mjs";
import { publicRequestBody } from "../src/http.mjs";
import { emitNewsletterDiagnostic } from "../src/aws.mjs";
import { createHandlers } from "../src/handlers.mjs";

function event(f, path = "/register", body = "email=new%40example.test&consent=yes") {
  return { version: "2.0", routeKey: `POST ${path}`, rawPath: path, rawQueryString: "", isBase64Encoded: true,
    requestContext: { http: { method: "POST", sourceIp: "192.0.2.10" } },
    headers: { origin: f.env.PUBLIC_ORIGIN, "content-type": "application/x-www-form-urlencoded" }, body: Buffer.from(body).toString("base64") };
}
test("API Gateway base64 forms retain double opt-in, purpose binding and permanent unsubscribe", async () => {
  const f = fixture();
  assert.equal((await f.service.api(event(f))).statusCode, 202);
  const id = subscriberId("new@example.test"), row = f.state.documents.get(`SUB#${id}`);
  assert.equal(row.state, "PENDING"); assert.equal(f.state.sends.length, 1);
  const confirm = event(f, "/confirm", "action=confirm");
  confirm.rawQueryString = "token=" + f.token(id, "confirm", row.confirmationNonce, f.state.time + 60000);
  assert.equal((await f.service.api(confirm)).statusCode, 200);
  assert.equal((await f.service.api(confirm)).statusCode, 400);
  const unsubscribe = event(f, "/unsubscribe", "List-Unsubscribe=One-Click");
  unsubscribe.rawQueryString = "token=" + f.token(id, "unsubscribe", f.state.documents.get(`SUB#${id}`).unsubscribeNonce);
  delete unsubscribe.headers.origin;
  assert.equal((await f.service.api(unsubscribe)).statusCode, 200);
  assert.equal((await f.service.api(unsubscribe)).statusCode, 200);
  assert.equal((await f.service.api(event(f))).statusCode, 202);
  assert.equal(f.state.documents.get(`SUB#${id}`).state, "SUPPRESSED"); assert.equal(f.state.sends.length, 1);
});
test("bounded base64 decoding rejects malformed encoding, invalid UTF8 and decoded overflow", () => {
  assert.equal(publicRequestBody({ body: Buffer.from("x".repeat(4096)).toString("base64"), isBase64Encoded: true }).length, 4096);
  for (const body of ["YQ", "YQ==\n", "YR==", "____", Buffer.from([0xff]).toString("base64"), Buffer.from("x".repeat(4097)).toString("base64")]) {
    assert.throws(() => publicRequestBody({ body, isBase64Encoded: true }), /invalid_input/);
  }
  assert.throws(() => publicRequestBody({ body: "é".repeat(2049) }), /invalid_input/);
});
test("encoded forms cannot bypass origin, consent, CONTROL or trusted source-IP checks", async () => {
  for (const mutation of [e => { e.headers.origin = "https://hostile.example.test"; }, e => { e.body = Buffer.from("email=new%40example.test&consent=no").toString("base64"); }, e => { delete e.requestContext.http.sourceIp; }]) {
    const f = fixture(), e = event(f); mutation(e);
    assert.ok([400, 403].includes((await f.service.api(e)).statusCode)); assert.equal(f.state.sends.length, 0);
  }
  const f = fixture(); f.state.documents.get("CONTROL").registrationEnabled = false;
  assert.equal((await f.service.api(event(f))).statusCode, 503); assert.equal(f.state.sends.length, 0);
});
test("handler diagnostics identify failing dependency phase without SDK messages or subscriber data", async () => {
  for (const [phase, target, key] of [["subscriber_read", "store", "get"], ["rate_email", "store", "rateLimit"], ["provider_suppression", "mail", "accountSuppressed"], ["contact_read", "mail", "contact"], ["pending_write", "store", "pending"], ["claim_write", "store", "claim"], ["send", "mail", "send"], ["send_ack", "store", "deliveryResult"]]) {
    const f = fixture(), diagnostics = [], original = f.deps[target][key];
    f.deps.diagnostic = x => emitNewsletterDiagnostic(x, line => diagnostics.push(JSON.parse(line)));
    f.deps[target][key] = async (...args) => {
      if (key === "get" && args[0] === "CONTROL") return original(...args);
      if (key === "deliveryResult" && args[1] !== "ACCEPTED") return original(...args);
      throw Object.assign(new Error("secret email@example.test v2.private-token"), { name: "AccessDeniedException" });
    };
    const result = await createHandlers(f.service, f.env).api(event(f), { awsRequestId: "12345678-1234-1234-1234-123456789abc" });
    assert.equal(result.statusCode, 503);
    assert.equal(result.headers["x-newsletter-result"], "permission_denied");
    assert.ok(diagnostics.some(x => x.phase === phase && x.reason === "permission_denied" && x.requestId));
    assert.doesNotMatch(JSON.stringify(diagnostics), /secret|email@|v2\.|new@|capability|token/i);
  }
});
test("diagnostics preserve distinct HTTP statuses but reject arbitrary diagnostic fields", () => {
  for (const status of [400, 401, 403, 415, 429, 500, 503]) {
    let output;
    emitNewsletterDiagnostic({ status, phase: "email@example.test", reason: "v2.secret", requestId: "bad-email@example.test", body: "secret", encoded: true }, line => { output = JSON.parse(line); });
    assert.deepEqual(output, { event: "newsletter_http", status, phase: "internal", reason: "internal_failure", encoded: true });
  }
  const template = JSON.parse(readFileSync(new URL("../template.json", import.meta.url)));
  const logs = template.Resources.HttpApi.Properties.AccessLogSettings;
  assert.deepEqual(logs.DestinationArn, { "Fn::GetAtt": ["ApiLogs", "Arn"] });
  assert.doesNotMatch(logs.Format, /error|path|query|authoriz|identity|sourceIp|header|body/i);
  assert.match(logs.Format, /integrationStatus/);
});

function python(code) {
  const result = spawnSync(process.platform === "win32" ? "python" : "python3", ["-B", "-c", code], { encoding: "utf8", windowsHide: true, env: { ...process.env, NEWSLETTER_TEST_MAILBOX: "operator@example.test" } });
  assert.equal(result.status, 0, result.stderr || result.stdout); return result.stdout;
}
const setup = `import importlib.util, pathlib, types, copy, json, sys
def load(name,path):
 s=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
q=load('recovery',pathlib.Path(${JSON.stringify(fileURLToPath(new URL("../scripts/recover-private-signup.py", import.meta.url)))}))
m=load('release',pathlib.Path(${JSON.stringify(fileURLToPath(new URL("../scripts/cloudshell-signup-release.py", import.meta.url)))}))
class Missing(Exception):response={'Error':{'Code':'NotFoundException'}}
def missing(**kw):raise Missing()
def must_fail(fn):
 try:fn()
 except RuntimeError:return
 raise AssertionError('unsafe operation allowed')
def fixture():
 r=types.SimpleNamespace(state={'signupAttempted':True,'importedCheckpoint':{'sha256':'f'*64}},meta={'releaseId':'repair','runtimeSha256':'e'*64},resources={'ApiFunction':'api','Ledger':'ledger'})
 r.rows=[];r.guard=None;r.saves=[];r.writes=[];r.gates=False
 r.save=lambda:r.saves.append(copy.deepcopy(r.state));r.schedules_off=lambda:None
 r.control=lambda:{'deliveryEnabled':False,'registrationEnabled':r.gates,'confirmationEnabled':r.gates}
 r.routes=lambda:[{'RouteKey':k,'AuthorizationType':'AWS_IAM'} for k in ['GET /register','POST /register','POST /subscribe']]
 r.configuration=lambda:{'CONTACT_LIST':'contacts'}
 r.table=types.SimpleNamespace(scan=lambda **kw:{'Items':r.rows},get_item=lambda **kw:{'Item':r.guard} if r.guard else {})
 def transaction(**kw):
  items=kw['TransactItems'];r.writes.append(items)
  assert len(items)==4 and all('ConditionCheck' in x for x in items[:3])
  assert items[0]['ConditionCheck']['ExpressionAttributeValues'][':no']==False
  assert items[0]['ConditionCheck']['ExpressionAttributeValues'][':gate']==r.gates
  assert [x['ConditionCheck']['Key']['pk'] for x in items[1:3]]==['SUB#'+q.IDENTIFIER,'RENEW#'+q.IDENTIFIER]
  if 'Put' in items[3]:
   if r.guard:raise RuntimeError('duplicate authorization')
   r.guard=copy.deepcopy(items[3]['Put']['Item'])
  else:
   if not r.guard or r.guard['state']!='AUTHORIZED':raise RuntimeError('already consumed')
   assert items[3]['Update']['ExpressionAttributeValues'][':runtime']==r.meta['runtimeSha256']
   r.guard['state']='CONSUMED'
 def client(name):
  if name=='lambda':return types.SimpleNamespace(get_function_configuration=lambda **kw:{'CodeSha256':q.base64.b64encode(bytes.fromhex(r.meta['runtimeSha256'])).decode(),'State':'Active','LastUpdateStatus':'Successful','Timeout':1,'Environment':{'Variables':{'DELIVERY_ENABLED':'false'}}})
  if name=='sesv2':return types.SimpleNamespace(get_contact=missing,get_suppressed_destination=missing)
  if name=='dynamodb':return types.SimpleNamespace(transact_write_items=transaction)
  raise AssertionError(name)
 r.client=client
 return r
fake=types.ModuleType('boto3.dynamodb.types');fake.TypeSerializer=lambda:types.SimpleNamespace(serialize=lambda value:value)
sys.modules['boto3']=types.ModuleType('boto3');sys.modules['boto3.dynamodb']=types.ModuleType('boto3.dynamodb');sys.modules['boto3.dynamodb.types']=fake
`;
test("recovery blocks every confirmation claim state and all attributable durable side effects", () => {
  python(setup + `for prefix in ['SUB#','RENEW#','AUDIT#','EVENT#','RATE#EMAIL#','MIGRATION#']:
 r=fixture();r.rows=[{'pk':prefix+q.IDENTIFIER}];must_fail(lambda:q.authorize(r,True,lambda _: 'APPROVE ONE RECOVERY',lambda _:None));assert not r.writes and r.state['signupAttempted'] is True
for state in ['CLAIMED','ACCEPTED','UNKNOWN','NOT_SENT','RETRYABLE','SUPPRESSED']:
 r=fixture();r.rows=[{'pk':'MAIL#confirmation#'+q.IDENTIFIER+'#nonce','state':state}];must_fail(lambda:q.no_effects(r))
r=fixture();r.rows=[{'pk':'EVENT#unrelated','subscriberId':q.IDENTIFIER}];must_fail(lambda:q.no_effects(r))
r=fixture();r.rows=[{'pk':'provider-contact','email':q.MAILBOX}];must_fail(lambda:q.no_effects(r))
`);
});
test("recovery requires explicit proof approval and drains before reads; one authorization is consumed once", () => {
  python(setup + `r=fixture();must_fail(lambda:q.authorize(r,False));assert not r.writes
waits=[];must_fail(lambda:q.authorize(r,True,lambda _: 'NO',waits.append));assert sum(waits)==11 and not r.writes
q.authorize(r,True,lambda _: 'APPROVE ONE RECOVERY',lambda _:None)
assert r.state['signupAttempted'] is True and r.guard['state']=='AUTHORIZED' and len(r.writes)==1
must_fail(lambda:q.authorize(r,True,lambda _: 'APPROVE ONE RECOVERY',lambda _:None))
r.gates=True;q.consume(r);assert r.guard['state']=='CONSUMED' and r.state['signupAttempted'] is True and r.state['recoveryConsumed'] is True and r.state['recoveryAuthorized'] is False
must_fail(lambda:q.consume(r));assert len(r.writes)==2
`);
});
test("recovery fails closed on pagination, SES evidence errors, contact, route or runtime mismatch", () => {
  python(setup + `r=fixture();calls=[]
def scan(**kw):
 calls.append(kw)
 return {'Items':[],'LastEvaluatedKey':{'pk':'next'}} if len(calls)==1 else {'Items':[{'pk':'AUDIT#'+q.IDENTIFIER+'#request#nonce'}]}
r.table.scan=scan;must_fail(lambda:q.no_effects(r));assert len(calls)==2 and calls[1]['ConsistentRead'] is True
r=fixture();r.table.scan=lambda **kw:{'Items':[],'LastEvaluatedKey':{'pk':'loop'}};must_fail(lambda:q.no_effects(r))
r=fixture();r.table.scan=lambda **kw:{};must_fail(lambda:q.no_effects(r))
for ses in [types.SimpleNamespace(get_contact=lambda **kw:{}),types.SimpleNamespace(get_contact=lambda **kw:(_ for _ in ()).throw(Exception('private-sdk-error')))]:
 r=fixture();original=r.client;r.client=lambda name:ses if name=='sesv2' else original(name);must_fail(lambda:q.no_effects(r));assert not r.writes
r=fixture();r.routes=lambda:[];must_fail(lambda:q.authorize(r,True,lambda _: 'APPROVE ONE RECOVERY',lambda _:None));assert not r.writes
r=fixture();r.gates=True;must_fail(lambda:q.authorize(r,True,lambda _: 'APPROVE ONE RECOVERY',lambda _:None))
r=fixture();original=r.client;r.client=lambda name:types.SimpleNamespace(get_function_configuration=lambda **kw:{'CodeSha256':'wrong'}) if name=='lambda' else original(name);must_fail(lambda:q.authorize(r,True,lambda _: 'APPROVE ONE RECOVERY',lambda _:None))
`);
});
test("side effect arriving after approval or arm blocks consume; lost acknowledgements never permit resend", () => {
  python(setup + `r=fixture()
def approve(_):r.rows=[{'pk':'MAIL#confirmation#'+q.IDENTIFIER+'#n'}];return 'APPROVE ONE RECOVERY'
must_fail(lambda:q.authorize(r,True,approve,lambda _:None));assert not r.writes
r=fixture();q.authorize(r,True,lambda _: 'APPROVE ONE RECOVERY',lambda _:None);r.gates=True;r.rows=[{'pk':'SUB#'+q.IDENTIFIER}];must_fail(lambda:q.consume(r));assert r.guard['state']=='AUTHORIZED'
r.rows=[];original=r.client
def lost(**kw):original('dynamodb').transact_write_items(**kw);raise RuntimeError('ack lost')
r.client=lambda name:types.SimpleNamespace(transact_write_items=lost) if name=='dynamodb' else original(name)
must_fail(lambda:q.consume(r));assert r.guard['state']=='CONSUMED'
must_fail(lambda:q.consume(r));assert r.state['signupAttempted'] is True
`);
});
test("launcher reports actual failed POST status and preserves uncertain-attempt checkpoint", () => {
  const output = python(setup + `r=object.__new__(m.Release);r.meta={};r.state={'deployedPhase':'test'};r.save=lambda:None;r.subscriber=lambda:None
statuses=iter([403,200,415]);r.http=lambda *args,**kw:next(statuses)
try:r.signup(True)
except RuntimeError as error:assert 'HTTP 415' in str(error);print(str(error))
else:raise AssertionError('failed POST accepted')
assert r.state['signupAttempted'] is True and r.state['signupHttpStatus']==415
must_fail(lambda:r.signup(True))
`);
  assert.match(output, /HTTP 415/);
});
test("HTTP probe refuses redirects, records status only and never reads/logs response bodies", () => {
  const output = python(setup + `r=object.__new__(m.Release);r.meta={'origin':'https://api.example.test','region':'eu-north-1'};r.state={};r.save=lambda:None
class Opener:
 def open(self,request,timeout):
  assert request.data==b'email=private%40example.test&consent=yes'
  assert request.get_header('Origin')=='https://api.example.test'
  assert request.get_header('Content-type')=='application/x-www-form-urlencoded'
  raise m.urllib.error.HTTPError(request.full_url,403,'private-body',{'x-newsletter-result':'v2.secret-link','apigw-requestid':'request-id-123'},None)
def opener(handler):
 assert handler.redirect_request(None,None,302,'',{},'https://hostile.example.test') is None
 return Opener()
m.urllib.request.build_opener=opener
assert r.http('POST','/register',{'email':'private@example.test','consent':'yes'})==403
assert r.state['lastHttp']['status']==403 and r.state['lastHttp']['result']=='unspecified' and r.state['lastHttp']['gatewayRequestId']=='request-id-123'
print(json.dumps(r.state))
`);
  assert.doesNotMatch(output, /private@|private-body|secret-link|hostile/); assert.match(output, /status=403/);
});
test("private repair profile prohibits public activation and schedule mutation before separate verified approval", () => {
  python(setup + `r=object.__new__(m.Release);r.meta={'privateSignupRepair':True}
must_fail(lambda:r.prepare('public',True));must_fail(lambda:r.arm(True,True));must_fail(lambda:r.prepare_weekly('f'*40,True));must_fail(lambda:r.execute_weekly(True))
`);
});

test("plain and base64 JSON registration preserve the exact consent contract", async () => {
  for (const encoded of [false, true]) {
    const f = fixture(), e = event(f);
    const body = JSON.stringify({ email: "new@example.test", consent: true, consentVersion: CONSENT_VERSION, consentText: CONSENT_TEXT });
    e.headers["content-type"] = "application/json"; e.isBase64Encoded = encoded;
    e.body = encoded ? Buffer.from(body).toString("base64") : body;
    assert.equal((await f.service.api(e)).statusCode, 202); assert.equal(f.state.sends.length, 1);
    assert.equal(f.state.documents.get(`SUB#${subscriberId("new@example.test")}`).state, "PENDING");
  }
});

test("lost send acknowledgement exposes only an uncertain-outcome category and never resends", async () => {
  const f = fixture(); f.state.lostAck = true;
  // The deployed adapter reports this fixed error when an acceptance result cannot be committed.
  const save = f.deps.store.deliveryResult;
  f.deps.store.deliveryResult = (...args) => args[1] === "ACCEPTED" ? false : save(...args);
  const response = await f.service.api(event(f));
  assert.equal(response.statusCode, 503); assert.equal(response.headers["x-newsletter-result"], "outcome_uncertain");
  assert.doesNotMatch(response.body, /new@|v2\.|acknowledgement|Check your inbox/);
  await f.service.api(event(f)); assert.equal(f.state.sends.length, 1);
});

test("CloudShell signs exactly the same form bytes, origin and URL that it transmits", () => {
  python(setup + `r=object.__new__(m.Release);r.meta={'origin':'https://api.example.test','region':'eu-north-1'};r.state={};r.save=lambda:None
credentials=object();r.session=types.SimpleNamespace(get_credentials=lambda:types.SimpleNamespace(get_frozen_credentials=lambda:credentials));signed=[]
class Request:
 def __init__(self,**kw):self.__dict__.update(kw)
class Auth:
 def __init__(self,creds,service,region):assert creds is credentials and service=='execute-api' and region=='eu-north-1'
 def add_auth(self,request):signed.append(request);request.headers['Authorization']='synthetic-signature'
auth=types.ModuleType('botocore.auth');auth.SigV4Auth=Auth
awsrequest=types.ModuleType('botocore.awsrequest');awsrequest.AWSRequest=Request
sys.modules['botocore']=types.ModuleType('botocore');sys.modules['botocore.auth']=auth;sys.modules['botocore.awsrequest']=awsrequest
class Response:
 status=202;headers={}
 def __enter__(self):return self
 def __exit__(self,*args):pass
 def read(self,*args):raise AssertionError('response body must never be read')
class Opener:
 def open(self,request,timeout):
  original=signed[0];assert original.method==request.method=='POST' and original.url==request.full_url
  assert original.data==request.data==b'email=private%2Btest%40example.test&consent=yes'
  assert request.get_header('Authorization')=='synthetic-signature'
  assert request.get_header('Origin')==original.headers['Origin']==r.meta['origin']
  assert request.get_header('Content-type')==original.headers['Content-Type']=='application/x-www-form-urlencoded'
  return Response()
m.urllib.request.build_opener=lambda *args:Opener()
assert r.http('POST','/register',{'email':'private+test@example.test','consent':'yes'},signed=True)==202
`);
});

test("private tests alone cannot authorize activation; the approval is bound to the verified runtime", () => {
  python(setup + `r=object.__new__(m.Release);r.meta={'privateSignupRepair':True,'runtimeSha256':'a'*64};r.state={}
assert not r.activation_allowed()
r.state.update(testPassed=True,unsubscribeObserved=True,feedbackMessageId='synthetic',bounceFeedbackMessageId='synthetic-bounce');assert not r.activation_allowed()
r.state['activationApprovedRuntime']='b'*64;assert not r.activation_allowed()
r.state['activationApprovedRuntime']='a'*64;assert r.activation_allowed()
for key in ['testPassed','unsubscribeObserved','feedbackMessageId','bounceFeedbackMessageId']:
 original=r.state[key];r.state[key]=False;assert not r.activation_allowed();r.state[key]=original
`);
});

test("managed complaint and permanent bounce probes preserve suppression and do not send email or republish saved probes", () => {
  python(setup + `r=object.__new__(m.Release);r.state={'confirmedObserved':True,'unsubscribeObserved':True,'providerMessageId':'synthetic-send'};r.save=lambda:None
r.subscriber=lambda:{'state':'SUPPRESSED','suppressionReason':'unsubscribe','suppressedAt':123};r.configuration=lambda:{'FEEDBACK_TOPIC_ARN':'synthetic-topic'};events=[]
def publish(**kw):
 event=json.loads(kw['Message']);events.append(event);assert event['releaseTest'].startswith('SYNTHETIC')
 return {'MessageId':'synthetic-'+event['eventType']}
r.client=lambda name:types.SimpleNamespace(publish=publish) if name=='sns' else (_ for _ in ()).throw(AssertionError('unexpected cloud API'))
r.feedback_test(True);r.feedback_test(True)
assert [e['eventType'] for e in events]==['Complaint','Bounce'] and events[1]['bounce']['bounceType']=='Permanent'
assert r.subscriber()['suppressionReason']=='unsubscribe' and r.state['bounceFeedbackMessageId']=='synthetic-Bounce'
`);
});

test("activation entry point stops before opening signup without private proof or operator approval", () => {
  python(setup + `a=load('activation',pathlib.Path(${JSON.stringify(fileURLToPath(new URL("../scripts/run-verified-activation.py", import.meta.url)))}))
r=types.SimpleNamespace(state={},meta={});helper=types.SimpleNamespace(Release=lambda:r)
must_fail(lambda:a.activate_public(helper,lambda _: 'OPEN VERIFIED PUBLIC SIGNUP'))
calls=[];r.state={'testPassed':True};r.meta={'runtimeSha256':'a'*64}
r.close=lambda *args:calls.append('close');r.readiness=lambda *args:calls.append('readiness');r.finish=lambda:calls.append('durable-proof');r.save=lambda:calls.append('save')
must_fail(lambda:a.activate_public(helper,lambda _: 'NO'));assert calls==['close','readiness','durable-proof'] and 'activationApprovedRuntime' not in r.state
r.activation_allowed=lambda:False
must_fail(lambda:a.activate_weekly(helper,'a'*40,lambda _: 'ENABLE VERIFIED WEEKLY'))
`);
});

test("weekly activation requires the exact live release marker before changing schedules", () => {
  python(setup + `a=load('activation',pathlib.Path(${JSON.stringify(fileURLToPath(new URL("../scripts/run-verified-activation.py", import.meta.url)))}))
r=types.SimpleNamespace(meta={'releaseId':'synthetic','sourceHead':'a'*40,'runtimeSha256':'b'*64,'origin':'https://api.example.test'},control=lambda:{'forwardOnlyReceipt':'c'*64})
class Response:
 status=200
 def __init__(self,body):self.body=body
 def __enter__(self):return self
 def __exit__(self,*args):pass
 def read(self,*args):return self.body
a.urllib.request.urlopen=lambda *args,**kw:Response(b'{}')
must_fail(lambda:a.verify_website(r,'a'*40))
a.urllib.request.urlopen=lambda url,**kw:Response(json.dumps(a.marker(r)).encode() if 'newsletter-release.json' in url else b'<html>paused</html>')
must_fail(lambda:a.verify_website(r,'a'*40))
a.urllib.request.urlopen=lambda url,**kw:Response(json.dumps(a.marker(r)).encode() if 'newsletter-release.json' in url else b'<a href="https://api.example.test/register">Subscribe</a>')
a.verify_website(r,'a'*40)
`);
});

test("approved public activation rechecks durable proof before opening enrollment and produces the website marker", () => {
  python(setup + `import tempfile
a=load('activation',pathlib.Path(${JSON.stringify(fileURLToPath(new URL("../scripts/run-verified-activation.py", import.meta.url)))}))
with tempfile.TemporaryDirectory() as temp:
 a.HERE=pathlib.Path(temp);calls=[]
 r=types.SimpleNamespace(state={'testPassed':True,'deployedPhase':'test'},meta={'releaseId':'synthetic','sourceHead':'a'*40,'runtimeSha256':'b'*64})
 r.close=lambda *args:calls.append('close');r.readiness=lambda *args:calls.append('readiness');r.finish=lambda:calls.append('durable-proof');r.save=lambda:calls.append('save')
 def prepare(phase,approved):
  assert calls[:3]==['close','readiness','durable-proof'] and r.state['activationApprovedRuntime']==r.meta['runtimeSha256']
  assert phase=='public' and approved is True
  (a.HERE/'change-set-review.json').write_text(json.dumps({'ChangeSetName':'synthetic-public'}));calls.append('prepare')
 def execute(phase,approved):r.state['deployedPhase']=phase;calls.append('execute')
 r.prepare=prepare;r.execute=execute;r.arm=lambda *args:calls.append('open');r.http=lambda *args:200
 r.isolation=lambda:calls.append('isolation');r.schedules_off=lambda:calls.append('weekly-off');r.control=lambda:{'forwardOnlyReceipt':'c'*64}
 answers=iter(['OPEN VERIFIED PUBLIC SIGNUP','EXECUTE synthetic-public'])
 a.activate_public(types.SimpleNamespace(Release=lambda:r),lambda _:next(answers))
 assert calls.index('durable-proof')<calls.index('prepare')<calls.index('execute')<calls.index('open')
 assert json.loads((a.HERE/'newsletter-release.json').read_text())==a.marker(r) and calls[-1]=='weekly-off'
`);
});

test("finish requires both managed feedback events and their suppression audits plus actual SES delivery", () => {
  python(setup + `r=object.__new__(m.Release);r.meta={'privateSignupRepair':True};identifier='f'*64
r.state={'unsubscribeObserved':True,'feedbackMessageId':'synthetic-complaint','providerMessageId':'synthetic-send'}
r.subscriber=lambda:{'id':identifier,'state':'SUPPRESSED','suppressionReason':'unsubscribe'};r.save=lambda:None;r.isolation=lambda:None;r.schedules_off=lambda:None
complaint='EVENT#'+m.sha(b'synthetic-complaint:Complaint');bounce='EVENT#'+m.sha(b'synthetic-bounce:Bounce')
audit=lambda pk:'AUDIT#'+identifier+'#suppress#'+m.sha(pk.removeprefix('EVENT#').encode())
rows={complaint:{'pk':complaint},audit(complaint):{'reason':'complaint'}}
r.table=types.SimpleNamespace(get_item=lambda **kw:{'Item':rows[kw['Key']['pk']]} if kw['Key']['pk'] in rows else {},scan=lambda **kw:{'Items':[]})
r.client=lambda name:types.SimpleNamespace(get_contact=lambda **kw:{'UnsubscribeAll':True});r.configuration=lambda:{'CONTACT_LIST':'synthetic'}
must_fail(r.finish);assert not r.state.get('testPassed')
r.state['bounceFeedbackMessageId']='synthetic-bounce';must_fail(r.finish)
rows[bounce]={'pk':bounce};must_fail(r.finish);rows[audit(bounce)]={'reason':'hard-bounce'}
class Condition:
 def __init__(self,*args):pass
 def eq(self,*args):return self
 def __and__(self,*args):return self
conditions=types.ModuleType('boto3.dynamodb.conditions');conditions.Attr=Condition;sys.modules['boto3.dynamodb.conditions']=conditions
must_fail(r.finish);assert not r.state.get('testPassed')
r.table.scan=lambda **kw:{'Items':[{'pk':'synthetic-delivery'}]};r.finish()
assert r.state['testPassed'] is True and r.subscriber()['suppressionReason']=='unsubscribe'
`);
});
test("original failed checkpoint is verified and adopted without clearing intent or altering its source", () => {
  python(setup + `import tempfile
with tempfile.TemporaryDirectory() as temp:
 old=pathlib.Path(temp)/'old';old.mkdir();new=pathlib.Path(temp)/'new';new.mkdir()
 blob=b'synthetic-pinned-runtime';q.PREVIOUS_RUNTIME=q.digest(blob)
 meta={'releaseId':q.PREVIOUS_ID,'runtimeSha256':q.PREVIOUS_RUNTIME,'account':'957261948953','region':'eu-north-1','stack':'chronoverse-newsletter-v2','origin':'https://api.example.test'}
 baseline={'SUB#unrelated':{'pk':'SUB#unrelated','state':'SUPPRESSED','suppressionReason':'original'}}
 state={'releaseId':q.PREVIOUS_ID,'deployedPhase':'test','readiness':True,'signupAttempted':True,'historicalBaseline':baseline,'historicalBaselineSha256':q.digest(q.canonical(baseline).encode()),'prepared':{'id':'old-change'},'rollback':{'old':'retain-in-original'}}
 (old/'newsletter-runtime.zip').write_bytes(blob);(old/'release.json').write_text(json.dumps(meta));(old/'SHA256SUMS').write_text(''.join(q.digest((old/name).read_bytes())+'  '+name+'\\n' for name in ['release.json','newsletter-runtime.zip']))
 raw=json.dumps(state).encode();(old/'.cloudshell-release-state.json').write_bytes(raw)
 def receiver():
  r=fixture();r.path=new/'.cloudshell-release-state.json';r.state={};r.meta={**meta,'releaseId':'new-repair'};return r
 r=receiver();q.import_checkpoint(r,str(old));assert r.state['signupAttempted'] is True and r.state['importedCheckpoint']['sha256']==q.digest(raw) and r.state['historicalBaseline']==baseline
 assert not any(k in r.state for k in ['deployedPhase','prepared','rollback']) and (old/'.cloudshell-release-state.json').read_bytes()==raw
 must_fail(lambda:q.import_checkpoint(r,str(old)))
 for mutation in [lambda s:s.update(readiness=False),lambda s:s.update(confirmationClaim='MAIL#confirmation#id#nonce'),lambda s:s.update(historicalBaselineSha256='wrong'),lambda s:s.update(signupAttempted=False),lambda s:s.update(weeklyActivated=True)]:
  candidate=copy.deepcopy(state);mutation(candidate);(old/'.cloudshell-release-state.json').write_text(json.dumps(candidate));r=receiver();must_fail(lambda:q.import_checkpoint(r,str(old)));assert not r.saves
 (old/'.cloudshell-release-state.json').write_bytes(raw);(old/'newsletter-runtime.zip').write_bytes(b'tampered');r=receiver();must_fail(lambda:q.import_checkpoint(r,str(old)));assert not r.saves
`);
});
