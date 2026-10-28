import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

const path = fileURLToPath(new URL("../scripts/resume-existing-unsubscribe.py", import.meta.url));
const fixture = fileURLToPath(new URL("./fixtures/api-gateway-integrations-2026-10-29.json", import.meta.url));
const setup = `import importlib.util, copy, io, json, zipfile, types, contextlib, sys, ast, builtins
s=importlib.util.spec_from_file_location('resume',${JSON.stringify(path)});m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
def rejected(call, check=None):
 try:call()
 except m.SafetyStop as error:
  if check:assert str(error)==check, str(error)
 else:raise AssertionError('unsafe state accepted')
def templates(original=False):
 key='CodeUri' if original else 'Code'
 current={'Resources':{'ApiFunction':{'Type':'AWS::Serverless::Function' if original else 'AWS::Lambda::Function','Properties':{key:m.code_location(False,original),'Handler':'src/handlers.api'}},'HttpApi':{'Properties':{'Body':{'target':'unchanged'}}}},'Parameters':{'Configuration':{'Type':'String'}},'Outputs':{'Api':{'Value':'unchanged'}}}
 candidate=copy.deepcopy(current);candidate['Resources']['ApiFunction']['Properties'][key]=m.code_location(True,original)
 return current,candidate
def change():
 details=[]
 for name,before,after in [('S3Key',m.BASE_KEY,m.PACKAGE_KEY),('S3ObjectVersion',m.BASE_VERSION,m.PACKAGE_VERSION)]:
  details.append({'Target':{'Attribute':'Properties','Name':'Code','RequiresRecreation':'Never','Path':'/Properties/Code/'+name,'BeforeValue':before,'AfterValue':after,'AttributeChangeType':'Modify'},'Evaluation':'Static','ChangeSource':'DirectModification'})
 return {'ChangeSetId':m.CHANGE_SET,'StackId':m.STACK_ID,'StackName':m.STACK,'ChangeSetName':'unsubscribe-'+m.PACKAGE_SHA[:20],'Status':'CREATE_COMPLETE','ExecutionStatus':'AVAILABLE','IncludeNestedStacks':False,'Changes':[{'Type':'Resource','ResourceChange':{'LogicalResourceId':'ApiFunction','PhysicalResourceId':m.STACK+'-api','ResourceType':'AWS::Lambda::Function','Action':'Modify','Replacement':'False','Scope':['Properties'],'Details':details}}]}
def operation():
 op=object.__new__(m.Operation);op.execution_attempted=False;op.started=False;op.stage='preflight';op.change_set=m.CHANGE_SET
 op.processed,op.candidate_processed=templates();op.original,op.candidate_original=templates(True)
 op.baseline_stack={'StackId':m.STACK_ID,'StackName':m.STACK,'StackStatus':'UPDATE_COMPLETE','ChangeSetId':m.PREVIOUS_CHANGE_SET,'LastUpdatedTime':'same','Parameters':[]}
 op.history={'historical':'preserved'};op.route_snapshot={'routes':'preserved'};op.subscriber_before={'state':{'S':'CONFIRMED'}}
 op.closed=lambda:None;op.histories=lambda:copy.deepcopy(op.history);op.routes=lambda:copy.deepcopy(op.route_snapshot);op.row=lambda pk:copy.deepcopy(op.subscriber_before)
 op.stack=lambda:copy.deepcopy(op.baseline_stack)
 op.identity='a'*64;op.arn='arn:aws:lambda:'+m.REGION+':'+m.ACCOUNT+':function:'+m.STACK+'-api'
 op.baseline_configs={name:{'FunctionArn':op.arn if name=='api' else name,'CodeSha256':m.base64.b64encode(bytes.fromhex(m.BASE if name=='api' else m.OTHER_BASE)).decode(),'Environment':{'Variables':{'PRIVATE':'NEVER_PRINT'}},'RevisionId':'unchanged'} for name in m.FUNCTIONS}
 op.configurations=lambda:copy.deepcopy(op.baseline_configs)
 op.describe_existing=lambda:change()
 def read_template(**kw):
  return copy.deepcopy((op.candidate_original if kw['TemplateStage']=='Original' else op.candidate_processed) if kw.get('ChangeSetName') else (op.original if kw['TemplateStage']=='Original' else op.processed))
 op.read_template=read_template
 return op
`;
function python(code) {
  const result = spawnSync(process.platform === "win32" ? "python" : "python3", ["-B", "-c", setup + code], { encoding: "utf8", windowsHide: true });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

test("release constants pin the exact existing identities and archive hashes", () => {
  python(`assert m.PACKAGE_SHA=='0c7a8f2124d9fd65008688ab57c07eaa529d3547f742e82faeee54df873680e1'
assert m.PACKAGE_VERSION=='sgeS4R8EBiIYVysPcqLYdg7_nccfMru9'
assert m.CHANGE_SET=='arn:aws:cloudformation:eu-north-1:957261948953:changeSet/unsubscribe-0c7a8f2124d9fd650086/f6f261fb-01bd-412f-bf85-d68c94bc3d7b'
assert m.RECIPIENT=='on9026901@gmail.com' and m.HISTORICAL_ID=='7ccc191e452b3e57369cec3fb97ed105322a492099267128c67ae12f390e2e7e'
assert m.BASE=='638f813fa3682caf7ccdbac556e557b65928c036836ce5221337b65bdacca150'
assert m.OTHER_BASE=='89636d5a22d004e9274a0a6190a46de1904a2c7516cfa70624f62845a3f258c8'
`);
});

test("enriched actual Code shape passes; compact dynamic HttpApi indication cannot be silently discarded", () => {
  python(`current,candidate=templates();c=change();m.validate_change_set(c,current,candidate)
compact=copy.deepcopy(c);compact['Changes'].append({'Type':'Resource','ResourceChange':{'LogicalResourceId':'HttpApi','ResourceType':'AWS::ApiGatewayV2::Api','Action':'Modify','Replacement':'False','Scope':['Properties'],'Details':[{'Target':{'Attribute':'Properties','Name':'Body','RequiresRecreation':'Never'},'Evaluation':'Dynamic','ChangeSource':'ResourceAttribute','CausingEntity':'ApiFunction.Arn'}]}})
rejected(lambda:m.validate_change_set(compact,current,candidate),'effective_change_set_count')
before={'Properties':{'Code':m.code_location(False),'Environment':{'Variables':{'Masked':'****'}}}}
after=copy.deepcopy(before);after['Properties']['Code']=m.code_location(True)
r=c['Changes'][0]['ResourceChange'];r['BeforeContext']=json.dumps(before);r['AfterContext']=json.dumps(after)
m.validate_change_set(c,current,candidate)
after['Properties']['Environment']['Variables']['Masked']='different';r['AfterContext']=json.dumps(after)
rejected(lambda:m.validate_change_set(c,current,candidate),'context_isolation')
`);
});

test("complete DescribeChangeSet pagination always requests property values and detects unsafe later pages", () => {
  python(`op=operation();requests=[];c=change()
def describe(**kw):
 requests.append(kw);assert kw['IncludePropertyValues'] is True and kw['ChangeSetName']==m.CHANGE_SET and kw['StackName']==m.STACK_ID
 p=copy.deepcopy(c)
 if 'NextToken' not in kw:p['Changes']=[];p['NextToken']='page2'
 else:assert kw['NextToken']=='page2'
 return p
op.clients={'cloudformation':types.SimpleNamespace(describe_change_set=describe)}
result=m.Operation.describe_existing(op);m.validate_change_set(result,op.processed,op.candidate_processed);assert len(requests)==2 and 'NextToken' not in result
def extra(**kw):
 p=describe(**kw)
 if 'NextToken' in kw:p['Changes']*=2
 return p
op.clients['cloudformation'].describe_change_set=extra
rejected(lambda:m.validate_change_set(m.Operation.describe_existing(op),op.processed,op.candidate_processed),'effective_change_set_count')
def inconsistent(**kw):
 p=describe(**kw)
 if 'NextToken' in kw:p['StackId']='foreign'
 return p
op.clients['cloudformation'].describe_change_set=inconsistent
rejected(lambda:m.Operation.describe_existing(op),'change_set_page_consistency')
op.clients['cloudformation'].describe_change_set=lambda **kw:{**c,'Changes':[],'NextToken':'loop'}
rejected(lambda:m.Operation.describe_existing(op),'change_set_pagination')
`);
});

test("change-set identity, state, replacement, static exact paths and values remain mandatory", () => {
  python(`current,candidate=templates()
for key,value in [('ChangeSetId','foreign'),('StackId','foreign'),('ExecutionStatus','EXECUTE_COMPLETE'),('Status','FAILED'),('IncludeNestedStacks',True),('ParentChangeSetId','nested')]:
 c=change();c[key]=value;rejected(lambda:m.validate_change_set(c,current,candidate))
for key,value in [('LogicalResourceId','Other'),('ResourceType','AWS::IAM::Role'),('PhysicalResourceId','foreign'),('Action','Add'),('Replacement','True'),('Scope',['Properties','Tags'])]:
 c=change();c['Changes'][0]['ResourceChange'][key]=value;rejected(lambda:m.validate_change_set(c,current,candidate))
for key,value in [('Path','/Properties/Environment'),('BeforeValue','wrong'),('AfterValue','wrong'),('Name','Role'),('RequiresRecreation','Conditionally'),('AttributeChangeType','Add')]:
 c=change();c['Changes'][0]['ResourceChange']['Details'][0]['Target'][key]=value;rejected(lambda:m.validate_change_set(c,current,candidate))
for key,value in [('Evaluation','Dynamic'),('ChangeSource','ResourceAttribute'),('CausingEntity','foreign')]:
 c=change();c['Changes'][0]['ResourceChange']['Details'][0][key]=value;rejected(lambda:m.validate_change_set(c,current,candidate))
c=change();c['Changes'][0]['ResourceChange']['Details']*=2;rejected(lambda:m.validate_change_set(c,current,candidate))
`);
});

test("both whole templates reject API, environment, IAM, schedule, parameter and output drift", () => {
  python(`for original in [True,False]:
 current,candidate=templates(original);m.validate_templates(current,candidate,original)
 for path in [('Resources','HttpApi','Properties','Body','target'),('Resources','ApiFunction','Properties','Handler'),('Outputs','Api','Value'),('Parameters','Configuration','Type')]:
  x=copy.deepcopy(candidate);v=x
  for p in path[:-1]:v=v[p]
  v[path[-1]]='foreign';rejected(lambda:m.validate_templates(current,x,original))
 for name,resource in [('Role',{'Type':'AWS::IAM::Role'}),('Schedule',{'Type':'AWS::Scheduler::Schedule'})]:
  x=copy.deepcopy(candidate);x['Resources'][name]=resource;rejected(lambda:m.validate_templates(current,x,original))
 x=copy.deepcopy(candidate);x['Resources']['ApiFunction']['Properties']['Environment']={'Variables':{'registrationEnabled':True}};rejected(lambda:m.validate_templates(current,x,original))
 x=copy.deepcopy(candidate);key='CodeUri' if original else 'Code';x['Resources']['ApiFunction']['Properties'][key]['Version' if original else 'S3ObjectVersion']='different';rejected(lambda:m.validate_templates(current,x,original))
`);
});

const archiveSetup = `old=b'prefix; if (action === "confirm") page.headers["referrer-policy"] = "strict-origin"; suffix'
new=old.replace(b'if (action === "confirm") ',b'')
def archive(http,other=b'unchanged',extra=False):
 out=io.BytesIO()
 with zipfile.ZipFile(out,'w',compression=zipfile.ZIP_DEFLATED) as z:
  z.writestr('src/http.mjs',http);z.writestr('src/service.mjs',other)
  if extra:z.writestr('unexpected',b'foreign')
 return out.getvalue()
baseline=archive(old);package=archive(new);m.BASE=m.sha(baseline);m.PACKAGE_SHA=m.sha(package);m.OLD_HTTP=m.sha(old);m.NEW_HTTP=m.sha(new)
`;

test("existing archive bytes are independently hashed and every member compared without recompression", () => {
  python(archiveSetup + `m.validate_archive(baseline,package)
rejected(lambda:m.validate_archive(baseline,package+b'changed'),'independent_archive_sha256')
rejected(lambda:m.validate_archive(baseline+b'changed',package),'independent_archive_sha256')
for bad in [archive(new,b'foreign'),archive(new,extra=True),archive(new+b'foreign')]:
 m.PACKAGE_SHA=m.sha(bad);rejected(lambda:m.validate_archive(baseline,bad))
`);
});

test("malformed, duplicate and CRC-damaged archives fail even with matching outer SHA", () => {
  python(archiveSetup + `for mode in ['invalid','duplicate','crc']:
 if mode=='invalid':bad=b'not a zip'
 else:
  out=io.BytesIO()
  with zipfile.ZipFile(out,'w',compression=zipfile.ZIP_STORED) as z:
   z.writestr('src/http.mjs',new);z.writestr('src/service.mjs',b'unchanged')
   if mode=='duplicate':z.writestr('src/service.mjs',b'duplicate')
  bad=out.getvalue()
  if mode=='crc':bad=bad.replace(b'unchanged',b'corrupted',1)
 m.PACKAGE_SHA=m.sha(bad)
 try:m.validate_archive(baseline,bad)
 except (m.SafetyStop,zipfile.BadZipFile):pass
 else:raise AssertionError('bad archive accepted')
`);
});

test("S3 exact version and actual hash are required regardless of supplied metadata", () => {
  python(`op=operation();blob=b'actual archived bytes';calls=[];loc=m.code_location(True,True)
def get(**kw):
 calls.append(kw);return {'VersionId':m.PACKAGE_VERSION,'ServerSideEncryption':'AES256','ContentLength':len(blob),'Metadata':{'sha256':'a'*64},'Body':io.BytesIO(blob)}
op.clients={'s3':types.SimpleNamespace(get_object=get)}
assert op.download(loc,m.sha(blob))==blob and calls==[{'Bucket':m.BUCKET,'Key':m.PACKAGE_KEY,'VersionId':m.PACKAGE_VERSION}]
rejected(lambda:op.download(loc,'a'*64),'downloaded_bytes_sha256')
for field,value in [('VersionId','different'),('ContentLength',len(blob)+1),('ServerSideEncryption','different')]:
 def bad(**kw):
  r=get(**kw);r[field]=value;return r
 op.clients['s3'].get_object=bad;rejected(lambda:op.download(loc,m.sha(blob)))
`);
});

test("fresh execution guards reject changed records, routes, Lambda configs, templates and stack state before any write", () => {
  python(`for field,value in [('histories',lambda:{'changed':True}),('row',lambda pk:{}),('routes',lambda:{}),('configurations',lambda:{}),('stack',lambda:{'StackId':m.STACK_ID,'StackStatus':'UPDATE_IN_PROGRESS'}),('read_template',lambda **kw:{})]:
 op=operation();setattr(op,field,value);calls=[]
 op.clients={'cloudformation':types.SimpleNamespace(execute_change_set=lambda **kw:calls.append(kw))}
 rejected(lambda:op.execute_existing());assert not calls and not op.execution_attempted
op=operation();op.baseline_stack['Parameters']=[{'ParameterKey':'Sender','ParameterValue':'expected'}]
rejected(lambda:op.check_change(change()),'parameters_unchanged')
op=operation();op.baseline_stack['RoleARN']='expected';op.check_change(change())
op.stack=lambda:{**op.baseline_stack,'RoleARN':'foreign'};rejected(lambda:op.fresh_guard(),'stack_not_advanced')
`);
});

const preflightSetup = `op=operation();op.identity=m.sha(m.RECIPIENT.encode());op.historical=m.HISTORICAL_ID;op.recipient=m.RECIPIENT
op.baseline_configs['api']['Environment']={'Variables':{'TABLE_NAME':'chronoverse-newsletter-v2-Ledger-E1NO71WDMT6H','CONTACT_LIST':'chronoverse-newsletter-v2-weekly','SECRETS_ARN':'arn:aws:secretsmanager:eu-north-1:957261948953:secret:chronoverse/newsletter-v2-L90Yt8'}}
op.history={'historical':{'state':{'S':'PENDING'}},'historicalClaim':{'state':{'S':'ACCEPTED'}}}
op.subscriber_before={'id':{'S':op.identity},'email':{'S':m.RECIPIENT},'state':{'S':'CONFIRMED'}}
op.clients={'sts':types.SimpleNamespace(get_caller_identity=lambda:{'Account':m.ACCOUNT}),
'sesv2':types.SimpleNamespace(get_contact=lambda **kw:{'UnsubscribeAll':False,'TopicPreferences':[{'TopicName':'weekly-research','SubscriptionStatus':'OPT_IN'}]}),
's3':types.SimpleNamespace(get_bucket_versioning=lambda **kw:{'Status':'Enabled'})}
downloads=[];validated=[]
op.download=lambda location,digest:downloads.append((location,digest)) or digest.encode()
m.validate_archive=lambda baseline,package:validated.append((baseline,package))
`;

test("complete preflight binds existing stack, dedicated identity, historical state, both templates and exact downloads", () => {
  python(preflightSetup + `op.preflight()
assert downloads==[(m.code_location(False,True),m.BASE),(m.code_location(True,True),m.PACKAGE_SHA)]
assert validated==[(m.BASE.encode(),m.PACKAGE_SHA.encode())] and op.stage=='final_read_only_guards'
assert 'secretsmanager' not in op.clients
`);
});

test("preflight account, stack, baseline, identity, historical and SES mismatches stop before execution", () => {
  python(`for mode in ['account','stack','apiHash','otherHash','historical','target','ses','versioning']:
` + preflightSetup.split("\n").filter(Boolean).map((line) => " " + line).join("\n") + `
 if mode=='account':op.clients['sts'].get_caller_identity=lambda:{'Account':'foreign'}
 if mode=='stack':op.baseline_stack['ChangeSetId']='foreign'
 if mode=='apiHash':op.baseline_configs['api']['CodeSha256']='foreign'
 if mode=='otherHash':op.baseline_configs['worker']['CodeSha256']='foreign'
 if mode=='historical':op.history['historical']['state']={'S':'SUPPRESSED'}
 if mode=='target':op.subscriber_before['state']={'S':'PENDING'}
 if mode=='ses':op.clients['sesv2'].get_contact=lambda **kw:{'UnsubscribeAll':True,'TopicPreferences':[]}
 if mode=='versioning':op.clients['s3'].get_bucket_versioning=lambda **kw:{'Status':'Suspended'}
 rejected(lambda:op.preflight());assert not op.execution_attempted
`);
});

test("live Lambda configurations reject qualifiers, foreign identity, inactive or unsuccessful updates", () => {
  python(`op=operation();configs={name:{'FunctionArn':'arn:aws:lambda:'+m.REGION+':'+m.ACCOUNT+':function:'+m.STACK+'-'+name,'Version':'$LATEST','State':'Active','LastUpdateStatus':'Successful','ResponseMetadata':{'RequestId':'volatile'}} for name in m.FUNCTIONS}
op.clients={'lambda':types.SimpleNamespace(get_function_configuration=lambda **kw:copy.deepcopy(configs[kw['FunctionName'].removeprefix(m.STACK+'-')]))}
assert all('ResponseMetadata' not in c for c in m.Operation.configurations(op).values())
for field,value in [('FunctionArn','foreign'),('Version','7'),('State','Pending'),('LastUpdateStatus','Failed')]:
 before=copy.deepcopy(configs);configs['api'][field]=value
 rejected(lambda:m.Operation.configurations(op),'lambda_identity_and_readiness');configs=before
`);
});

test("all strict-false CONTROL values and both disabled schedules remain fail-closed", () => {
  python(`op=operation();closed={k:{'BOOL':False} for k in ['registrationEnabled','confirmationEnabled','deliveryEnabled']};control=copy.deepcopy(closed);states=['DISABLED','DISABLED']
op.row=lambda pk:control;op.clients={'scheduler':types.SimpleNamespace(get_schedule=lambda **kw:{'State':states[0 if kw['Name'].endswith('-weekly') else 1]})}
m.Operation.closed(op)
for name in closed:
 for value in [None,{'BOOL':True},{'BOOL':0},{'S':'false'},{'BOOL':False,'S':'false'}]:
  control=copy.deepcopy(closed);control[name]=value;rejected(lambda:m.Operation.closed(op),'control_closed')
control=copy.deepcopy(closed)
for states in [['ENABLED','DISABLED'],['DISABLED','ENABLED']]:rejected(lambda:m.Operation.closed(op),'schedules_disabled')
`);
});

test("actual wrapped API integrations remain exact and snapshots cover all fields", () => {
  python(`with open(${JSON.stringify(fixture)},encoding='utf-8') as f:fixture=json.load(f)
op=operation();op.arn=fixture['lambdaArn'];routes=copy.deepcopy(fixture['routes']);integrations=copy.deepcopy(fixture['integrations'])
op.clients={'apigatewayv2':types.SimpleNamespace(get_routes=lambda **kw:{'Items':routes},get_integrations=lambda **kw:{'Items':integrations})}
snapshot=m.Operation.routes(op);assert len(snapshot)==11
integrations[0]['TimeoutInMillis']=1234;assert m.Operation.routes(op)!=snapshot
for field,value in [('IntegrationUri',op.arn+':foreign'),('IntegrationType','HTTP_PROXY'),('IntegrationMethod','GET'),('PayloadFormatVersion','1.0'),('CredentialsArn','unapproved')]:
 integrations=copy.deepcopy(fixture['integrations']);integrations[0][field]=value;rejected(lambda:m.Operation.routes(op),'unqualified_proxy_target')
integrations=copy.deepcopy(fixture['integrations']);routes[0]['AuthorizationType']='NONE';rejected(lambda:m.Operation.routes(op),'route_authorization')
`);
});

test("uncertain execute is attempted once; no automatic acceptance, retries or second invocation", () => {
  python(`op=operation();calls=[];op.fresh_guard=lambda:None
def execute(**kw):calls.append(kw);raise TimeoutError('PRIVATE_PROVIDER_CONTENT')
op.clients={'cloudformation':types.SimpleNamespace(execute_change_set=execute)}
try:op.execute_existing()
except TimeoutError:pass
else:raise AssertionError('uncertain execute finalized')
assert len(calls)==1 and calls[0]['ChangeSetName']==m.CHANGE_SET and calls[0]['StackName']==m.STACK_ID
assert op.stage=='execute_existing_once_no_retry' and not getattr(op,'deployment_verified',False)
rejected(lambda:op.execute_existing(),'execution_already_attempted');assert len(calls)==1
op=operation();op.preflight=lambda:None;op.execute_existing=lambda:(_ for _ in ()).throw(TimeoutError('PRIVATE'));accepted=[];op.acceptance=lambda:accepted.append(True)
try:op.run(True)
except TimeoutError:pass
assert accepted==[]
rejected(lambda:op.run(True),'invocation_already_started')
`);
});

const deployedSetup = `op=operation();op.fresh_guard=lambda:None;executions=[];op.clients={'cloudformation':types.SimpleNamespace(execute_change_set=lambda **kw:executions.append(kw))}
op.stack=lambda:{'StackStatus':'UPDATE_COMPLETE','ChangeSetId':m.CHANGE_SET}
c=change();c['ExecutionStatus']='EXECUTE_COMPLETE';op.describe_existing=lambda:c
op.read_template=lambda **kw:copy.deepcopy(op.candidate_original if kw['TemplateStage']=='Original' else op.candidate_processed)
now=copy.deepcopy(op.baseline_configs);now['api']['CodeSha256']=m.base64.b64encode(bytes.fromhex(m.PACKAGE_SHA)).decode();now['api']['RevisionId']='new'
op.configurations=lambda:copy.deepcopy(now)
`;

test("deployment is proven only by exact execution ID, templates, hashes and preserved configuration", () => {
  python(deployedSetup + `op.execute_existing();assert op.deployment_verified is True and len(executions)==1
`);
});

test("wrong deployment ID, failed update, unexpected API settings or another Lambda change prohibit unsubscribe", () => {
  python(`m.time.sleep=lambda _:None
for mode in ['stack','timeout','apiHash','apiEnvironment','otherLambda','template','history','routes','changeStatus']:
` + deployedSetup.split("\n").filter(Boolean).map((line) => " " + line).join("\n") + `
 if mode=='stack':op.stack=lambda:{'StackStatus':'UPDATE_ROLLBACK_COMPLETE','ChangeSetId':m.CHANGE_SET}
 if mode=='timeout':op.stack=lambda:{'StackStatus':'UPDATE_COMPLETE','ChangeSetId':m.PREVIOUS_CHANGE_SET}
 if mode=='apiHash':now['api']['CodeSha256']='foreign'
 if mode=='apiEnvironment':now['api']['Environment']={'Variables':{'PRIVATE':'changed'}}
 if mode=='otherLambda':now['worker']['RevisionId']='changed'
 if mode=='template':op.read_template=lambda **kw:{}
 if mode=='history':op.histories=lambda:{}
 if mode=='routes':op.routes=lambda:{}
 if mode=='changeStatus':c['ExecutionStatus']='AVAILABLE'
 rejected(lambda:op.execute_existing());assert len(executions)==1 and not getattr(op,'deployment_verified',False)
`);
});

test("preview creates no secret client, capability or write; operator cancellation happens before session creation", () => {
  python(`op=operation();op.preflight=lambda:None;op.execute_existing=lambda:(_ for _ in ()).throw(AssertionError('write'));op.acceptance=op.execute_existing
out=io.StringIO()
with contextlib.redirect_stdout(out):op.run(False)
assert json.loads(out.getvalue())['awsWrites']==0
calls=[];sys.modules['boto3']=types.SimpleNamespace(Session=lambda **kw:calls.append(kw));sys.argv=['resume','--execute-existing'];builtins.input=lambda _: 'CANCEL'
with contextlib.redirect_stdout(out):assert m.main()==1
assert calls==[] and 'PRIVATE' not in out.getvalue()
`);
});

test("failures and cancellations sanitize provider text, keys, identities and capabilities", () => {
  python(`class Broken:
 def __init__(self,*args):self.stage='execute_existing_once_no_retry'
 def run(self,*args):raise TimeoutError('PRIVATE_TOKEN_URL_KEY_EMAIL')
m.Operation=Broken;sys.modules['boto3']=types.SimpleNamespace(Session=lambda **kw:object());sys.argv=['resume'];out=io.StringIO()
with contextlib.redirect_stdout(out):assert m.main()==1
r=json.loads(out.getvalue());assert r['automaticReplay'] is False and r['stage']=='execute_existing_once_no_retry' and r['changeSetId']==m.CHANGE_SET and 'PRIVATE' not in out.getvalue()
`);
});

const acceptanceSetup = `op=operation();op.deployment_verified=True;op.recipient='reader@example.test';op.secret_arn='synthetic';op.table='synthetic';op.contact_list='synthetic'
before={'pk':{'S':'SUB#'+op.identity},'id':{'S':op.identity},'email':{'S':op.recipient},'state':{'S':'CONFIRMED'},'unsubscribeNonce':{'S':'b'*32},'audienceKey':{'S':'AUDIENCE#10'},'confirmedAt':{'N':'1'}}
row=copy.deepcopy(before);audit={'pk':{'S':'synthetic-audit'},'at':{'N':'2'}};calls=[]
op.row=lambda pk:copy.deepcopy(row if pk.startswith('SUB#') else audit)
def request(method,path,token,body=None):
 calls.append((method,path))
 if method=='GET':return 200,'strict-origin'
 row['state']={'S':'SUPPRESSED'};row.pop('audienceKey',None);row.setdefault('suppressedAt',{'N':'2'});row.setdefault('suppressionReason',{'S':'unsubscribe'})
 return 200,'no-referrer'
m.http=request
op.clients={'secretsmanager':types.SimpleNamespace(get_secret_value=lambda **kw:{'SecretString':json.dumps({'capabilityKey':'synthetic-offline-signing-key-long-enough'})}),
'sesv2':types.SimpleNamespace(get_contact=lambda **kw:{'UnsubscribeAll':True,'TopicPreferences':[{'TopicName':'weekly-research','SubscriptionStatus':'OPT_OUT'}]}),
'dynamodb':types.SimpleNamespace(query=lambda **kw:{'Items':[]})}
`;

test("genuine unsubscribe preserves cancel semantics and verifies suppression, SES, audience and stable idempotency", () => {
  python(acceptanceSetup + `op.acceptance();assert calls==[('GET','/unsubscribe'),('POST','/unsubscribe'),('POST','/unsubscribe'),('POST','/unsubscribe')]
assert row['state']=={'S':'SUPPRESSED'} and 'audienceKey' not in row
`);
});

test("no capability before verified deployment; uncertain unsubscribe gets no retry or idempotency calls", () => {
  python(acceptanceSetup + `op.deployment_verified=False;rejected(lambda:op.acceptance(),'deployment_before_capability');assert not calls
op.deployment_verified=True
def uncertain(method,path,token,body=None):
 calls.append((method,path))
 if method=='GET':return 200,'strict-origin'
 raise TimeoutError('PRIVATE_CAPABILITY')
m.http=uncertain
try:op.acceptance()
except TimeoutError:pass
else:raise AssertionError('uncertain unsubscribe finalized')
assert calls==[('GET','/unsubscribe'),('POST','/unsubscribe')] and row==before
`);
});

test("final readback rejects incomplete opt-out, audience pagination, historical mutation and non-idempotent audit", () => {
  python(`m.time.sleep=lambda _:None
for mode in ['ses','audience','history','audit']:
` + acceptanceSetup.split("\n").filter(Boolean).map((line) => " " + line).join("\n") + `
 if mode=='ses':op.clients['sesv2'].get_contact=lambda **kw:{'UnsubscribeAll':False,'TopicPreferences':[]}
 if mode=='audience':op.clients['dynamodb'].query=lambda **kw:{'Items':[],'LastEvaluatedKey':{'pk':{'S':'more'}}}
 if mode=='history':
  original=m.http
  def changed(method,path,token,body=None):
   result=original(method,path,token,body)
   if method=='POST':op.histories=lambda:{}
   return result
  m.http=changed
 if mode=='audit':
  original=m.http
  def changed(method,path,token,body=None):
   result=original(method,path,token,body)
   if len(calls)>2:audit['at']={'N':'changed'}
   return result
  m.http=changed
 rejected(lambda:op.acceptance())
`);
});

test("AST forbids new change sets, artifact uploads, direct subscriber/gate/IAM/schedule writes or mail", () => {
  python(`with open(${JSON.stringify(path)},encoding='utf-8') as f:tree=ast.parse(f.read())
for n in ast.walk(tree):
 if isinstance(n,ast.Call) and isinstance(n.func,ast.Attribute):
  name=n.func.attr
  assert name not in {'create_change_set','put_object','update_item','put_item','delete_item','update_schedule','create_schedule','delete_schedule','send_email','invoke','update_function_code','put_role_policy','execute_statement','rollback_stack','cancel_update_stack'},name
  if name=='execute_change_set':assert next(k.value.id for k in n.keywords if k.arg=='ChangeSetName')=='CHANGE_SET'
assert not any(isinstance(n,ast.Call) and isinstance(n.func,ast.Attribute) and n.func.attr in {'writestr','write_bytes','write_text','mkdir'} for n in ast.walk(tree))
`);
  const source = readFileSync(path, "utf8");
  assert.doesNotMatch(source, /corrected_archive|create_change_set|put_object/);
  assert.match(source, /total_max_attempts.*1/);
});
