import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const setup = `import importlib.util,pathlib,types,tempfile,json,copy,hashlib,base64,contextlib,io,os,sys
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('confirmation_fix',pathlib.Path(${JSON.stringify(fileURLToPath(new URL("../scripts/cloudshell-confirmation-fix.py", import.meta.url)))}))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
root=pathlib.Path(m.__file__).resolve().parents[3]
original_spec=importlib.util.spec_from_file_location('pinned_original',root/'services/newsletter/test/fixtures/confirmation/legacy-release-helper.py')
original=importlib.util.module_from_spec(original_spec);original_spec.loader.exec_module(original)
def blocked(fn):
 try:fn()
 except RuntimeError:return
 raise AssertionError('unsafe action accepted')

def closed_fixture():
 control={k:False for k in ['registrationEnabled','confirmationEnabled','deliveryEnabled']}
 control.update(legacyRetired=True,complianceApproved=True)
 schedules=[{'Name':'chronoverse-newsletter-weekly','State':'DISABLED'},{'Name':'chronoverse-newsletter-discovery','State':'DISABLED'}]
 calls=[]
 def pages(**kw):
  assert kw=={'NamePrefix':'chronoverse'};calls.append('schedules-read')
  return [{'Schedules':schedules[:1],'NextToken':'synthetic'},{'Schedules':schedules[1:]}]
 def client(name):
  assert name=='scheduler'
  def paginator(operation):assert operation=='list_schedules';return types.SimpleNamespace(paginate=pages)
  return types.SimpleNamespace(get_paginator=paginator)
 def forbidden(*args,**kw):raise AssertionError('mutation attempted')
 r=original.Release.__new__(original.Release)
 r.control=lambda:control;r.client=client
 r.close=forbidden;r.set_enrollment=forbidden;r.save=forbidden
 return r,control,schedules,calls

def private_fixture(directory):
 r,control,schedules,calls=closed_fixture();scheduler_client=r.client
 baseline={'SUB#old':{'pk':'SUB#old','id':'old','email':'old@example.test','state':'HOLD'},
           'SUB#suppressed':{'pk':'SUB#suppressed','id':'suppressed','state':'SUPPRESSED','suppressedAt':123,'suppressionReason':'original'}}
 rows=copy.deepcopy(baseline);audits={}
 r.state={'historicalBaseline':baseline,'historicalBaselineSha256':original.sha(original.canonical(baseline).encode()),'confirmationClaim':'synthetic-accepted-claim'}
 r.path=pathlib.Path(directory)/'.cloudshell-release-state.json';r.path.write_text(json.dumps(r.state,indent=3)+'  ')
 r.subscribers=lambda:copy.deepcopy(rows)
 def get_item(**kw):assert kw['ConsistentRead'] is True;return {'Item':copy.deepcopy(audits.get(kw['Key']['pk'],{}))}
 r.table=types.SimpleNamespace(get_item=get_item)
 meta={'baseRuntimeSha256':'a'*64,'runtimeSha256':'b'*64,'testRecipient':'synthetic@example.test'}
 r.meta={'origin':'https://synthetic.execute-api.eu-north-1.amazonaws.com'}
 r.resources={name:'synthetic-'+name for name in ['ApiFunction','PlannerFunction','WorkerFunction','FeedbackFunction','ContactSyncFunction']}
 configs={name:{'State':'Active','LastUpdateStatus':'Successful','CodeSha256':base64.b64encode(bytes.fromhex(meta['runtimeSha256'] if name=='ApiFunction' else meta['baseRuntimeSha256'])).decode(),
  'Environment':{'Variables':{'DELIVERY_ENABLED':'false','REGISTRATION_ENABLED':'true','CONFIRMATION_ENABLED':'true','LEGACY_DISPATCH_RETIRED':'true','COMPLIANCE_APPROVED':'true','PUBLIC_ORIGIN':r.meta['origin']}},'Role':'arn:aws:iam::123456789012:role/synthetic'} for name in r.resources}
 def configuration(**kw):
  calls.append('lambda-read');return configs[next(k for k,v in r.resources.items() if v==kw['FunctionName'])]
 statement={'Effect':'Allow','Action':'ses:SendEmail','Condition':{'ForAllValues:StringEquals':{'ses:Recipients':[meta['testRecipient']]}}}
 iam=types.SimpleNamespace(list_attached_role_policies=lambda **kw:{'AttachedPolicies':[]},list_role_policies=lambda **kw:{'PolicyNames':['synthetic']},get_role_policy=lambda **kw:{'PolicyDocument':{'Statement':[statement]}})
 r.client=lambda name:types.SimpleNamespace(get_function_configuration=configuration) if name=='lambda' else iam if name=='iam' else scheduler_client(name)
 r.routes=lambda:[{'RouteKey':key,'AuthorizationType':'AWS_IAM' if key in m.PRIVATE_ROUTES else 'NONE'} for key in m.ROUTES]
 return r,control,schedules,calls,rows,audits,configs,statement,meta
def fixture():
 helper=types.SimpleNamespace(TEST_MAILBOX='synthetic@example.test',sha=m.sha,eligible=lambda row:row.get('state')=='CONFIRMED')
 identifier=m.sha(helper.TEST_MAILBOX.encode());nonce='p'*32;key='MAIL#confirmation#'+identifier+'#'+nonce
 row={'id':identifier,'email':helper.TEST_MAILBOX,'state':'PENDING','confirmationNonce':nonce}
 claim={'state':'ACCEPTED','messageId':'synthetic-provider-id'};calls=[]
 r=types.SimpleNamespace(state={'signupAttempted':True,'signupHttpStatus':202,'confirmationClaim':key,'recoveryConsumed':True,'importedCheckpoint':{'sha256':'a'*64}},subscriber=lambda:row)
 r.table=types.SimpleNamespace(get_item=lambda **kw:{'Item':claim});r.paused=lambda:calls.append('paused')
 r.set_enrollment=lambda value:calls.append(('enrollment',value));r.close=lambda *args:calls.append('closed')
 def confirmed(*args):assert row['state']=='CONFIRMED';r.state['confirmedObserved']=True;calls.append('receipt')
 def unsubscribe(*args):row['state']='SUPPRESSED';r.state['unsubscribeObserved']=True;calls.append('unsubscribe')
 def feedback(*args):r.state.update(feedbackMessageId='synthetic-complaint',bounceFeedbackMessageId='synthetic-bounce');calls.append('feedback')
 def finish():r.state['testPassed']=True;calls.append('finish')
 r.confirmed=confirmed;r.unsubscribe=unsubscribe;r.feedback_test=feedback;r.finish=finish
 return helper,r,row,claim,calls
`;
function python(code) {
  const result = spawnSync(process.platform === "win32" ? "python" : "python3", ["-B", "-c", setup + code], { encoding: "utf8", windowsHide: true });
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

const startupCommand = "python3 -B /home/cloudshell-user/confirmation-launcher-59d8e91cf905/deploy-confirmation-fix.py /home/cloudshell-user/private-signup-repair-20261027-739404fe3d61";

const stagingScript = String.raw`import fcntl, hashlib, json, os
from pathlib import Path, PurePosixPath
os.umask(0o077)
root = Path('/home/cloudshell-user')
old = root / 'confirmation-post-fix-6ee620a8c933'
original = root / 'private-signup-repair-20261027-739404fe3d61'
work = root / 'confirmation-launcher-59d8e91cf905'
upload = root / 'cloudshell-confirmation-fix.py'
launcher_sha = '59d8e91cf905c716160d225443ee04916005ad9d3abdaecf7a0e332dc2af30bc'
old_launcher_sha = '887dfaddfb2ba9a2834c4fafa87b8a90b9a8852f78583d2fd7069d5bef4ec4e6'
manifest_sha = '9168bb09f6dca6d21780ef12cc920106e04103d57c4ff9ad8e6379ce28f87817'
new_manifest_sha = 'f0ce40c8b9b8f72d5fc8881467f7a47dee1a01ec0f31d7423a70b18d9baac7e8'
def require(ok):
    if not ok: raise SystemExit('STOP: delivery verification failed; preserve all files.')
def sha(blob): return hashlib.sha256(blob).hexdigest()
lock = open('/tmp/chronoverse-newsletter-v2-private-release.lock', 'a')
fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
require(not work.exists() and not work.is_symlink())
require(not upload.is_symlink() and not old.is_symlink() and not original.is_symlink())
code = upload.read_bytes()
require(sha(code) == launcher_sha)
manifest = (old / 'SHA256SUMS').read_bytes()
require(sha(manifest) == manifest_sha)
require(sha((original / 'SHA256SUMS').read_bytes()) == 'cc6a955a895e59787039dd6bf24dea6c9c37eb7270aa477f0fa783972d77bd00')
require((original / '.cloudshell-release-state.json').is_file())
payload = {}
for entry in manifest.decode('utf-8').splitlines():
    expected, name = entry.split('  ', 1)
    rel = PurePosixPath(name)
    require(not rel.is_absolute() and '..' not in rel.parts and '\\' not in name)
    source = old / name
    require(not source.is_symlink() and source.resolve().is_relative_to(old.resolve()))
    blob = source.read_bytes()
    require(sha(blob) == expected and name not in payload)
    payload[name] = blob
require(len(payload) == 7 and sha(payload['deploy-confirmation-fix.py']) == old_launcher_sha)
meta = json.loads(payload['patch.json'])
require(meta['patchId'] == old.name)
checkpoint = old / '.confirmation-fix-state.json'
require(not checkpoint.is_symlink() and not (old / '.confirmation-fix-state.tmp').exists())
require(not (old / 'DEPLOYMENT-RECEIPT.json').exists())
saved = checkpoint.read_bytes() if checkpoint.exists() else None
if saved is not None:
    state = json.loads(saved)
    require(state.get('patchId') == meta['patchId'] and state.get('originalDirectory') == str(original))
    require(state.get('executionStarted', False) is False and state.get('deployed', False) is False)
    require(not state.get('preparingChangeSetName') or state.get('changeSetId'))
needle = (old_launcher_sha + '  deploy-confirmation-fix.py').encode()
require(manifest.count(needle) == 1)
new_manifest = manifest.replace(needle, (launcher_sha + '  deploy-confirmation-fix.py').encode())
require(sha(new_manifest) == new_manifest_sha)
payload['deploy-confirmation-fix.py'] = code
payload['SHA256SUMS'] = new_manifest
if saved is not None: payload['.confirmation-fix-state.json'] = saved
work.mkdir(mode=0o700)
for name, blob in payload.items():
    target = work / name
    target.parent.mkdir(parents=True, exist_ok=True)
    with target.open('xb') as stream: stream.write(blob)
print('STAGED ONLY. Originals preserved. Launcher not executed.')
`;

test("single-file staging preserves original files and checkpoint identity in memory and rejects unsafe prior state", () => {
  python(`staging = ${JSON.stringify(stagingScript)}
payload={'deploy-confirmation-fix.py':b'synthetic previous launcher', 'patch.json':b'{"patchId":"confirmation-post-fix-6ee620a8c933"}', 'RUNBOOK.md':b'synthetic runbook', 'runtime.delta':b'synthetic non-package delta', **{'src/'+n:b'synthetic '+n.encode() for n in ['aws.mjs','http.mjs','service.mjs']}}
old_sha=m.sha(payload['deploy-confirmation-fix.py'])
manifest=''.join(m.sha(blob)+'  '+name+chr(10) for name,blob in sorted(payload.items())).encode()
new_manifest=manifest.replace((old_sha+'  deploy-confirmation-fix.py').encode(),(m.sha(pathlib.Path(m.__file__).read_bytes())+'  deploy-confirmation-fix.py').encode())
staging=staging.replace('887dfaddfb2ba9a2834c4fafa87b8a90b9a8852f78583d2fd7069d5bef4ec4e6',old_sha).replace('9168bb09f6dca6d21780ef12cc920106e04103d57c4ff9ad8e6379ce28f87817',m.sha(manifest)).replace('f0ce40c8b9b8f72d5fc8881467f7a47dee1a01ec0f31d7423a70b18d9baac7e8',m.sha(new_manifest))
cloud='/home/cloudshell-user';old=cloud+'/confirmation-post-fix-6ee620a8c933';original_dir=cloud+'/private-signup-repair-20261027-739404fe3d61';work=cloud+'/confirmation-launcher-59d8e91cf905'
seed={old+'/'+name:blob for name,blob in payload.items()};seed[old+'/SHA256SUMS']=manifest
seed[cloud+'/cloudshell-confirmation-fix.py']=pathlib.Path(m.__file__).read_bytes()
seed[original_dir+'/SHA256SUMS']=(root/'services/newsletter/test/fixtures/confirmation/original-manifest.txt').read_bytes()
seed[original_dir+'/.cloudshell-release-state.json']=b'{"synthetic":"preserve original checkpoint"}'
for mode in ['valid','execution-started','deployed','patch-mismatch','directory-mismatch','incomplete-prepare','temporary-checkpoint','receipt','checksum','destination-exists']:
 files=copy.deepcopy(seed);dirs={cloud,old,old+'/src',original_dir};writes=[]
 state={'patchId':'confirmation-post-fix-6ee620a8c933','originalDirectory':original_dir,'changeSetId':'preserved-old-id','historicalChangeSetIds':['preserved-history'],'executionStarted':False,'deployed':False}
 if mode=='execution-started':state['executionStarted']=True
 if mode=='deployed':state['deployed']=True
 if mode=='patch-mismatch':state['patchId']='foreign'
 if mode=='directory-mismatch':state['originalDirectory']='/foreign'
 if mode=='incomplete-prepare':state.pop('changeSetId');state['preparingChangeSetName']='uncertain-old-name'
 saved=json.dumps(state,indent=3).encode()+b'  ';files[old+'/.confirmation-fix-state.json']=saved
 if mode=='temporary-checkpoint':files[old+'/.confirmation-fix-state.tmp']=b'preserve'
 if mode=='receipt':files[old+'/DEPLOYMENT-RECEIPT.json']=b'preserve'
 if mode=='checksum':files[cloud+'/cloudshell-confirmation-fix.py']+=b'corrupt'
 if mode=='destination-exists':dirs.add(work)
 before=copy.deepcopy(files)
 class MemoryPath:
  def __init__(self,value):self.value=pathlib.PurePosixPath(str(value))
  def __str__(self):return str(self.value)
  def __truediv__(self,other):return MemoryPath(self.value/other)
  @property
  def name(self):return self.value.name
  @property
  def parent(self):return MemoryPath(self.value.parent)
  def exists(self):return str(self) in files or str(self) in dirs
  def is_symlink(self):return False
  def is_file(self):return str(self) in files
  def resolve(self):return self
  def is_relative_to(self,other):return self.value.is_relative_to(other.value)
  def read_bytes(self):
   if str(self) not in files:raise FileNotFoundError(str(self))
   return files[str(self)]
  def mkdir(self,mode=0o777,parents=False,exist_ok=False):
   if self.exists() and not exist_ok:raise FileExistsError(str(self))
   assert str(self)==work or str(self).startswith(work+'/')
   if parents:dirs.update(str(p) for p in self.value.parents)
   dirs.add(str(self))
  @contextlib.contextmanager
  def open(self,mode):
   assert mode=='xb' and str(self).startswith(work+'/') and not self.exists()
   stream=io.BytesIO();yield stream
   files[str(self)]=stream.getvalue();writes.append(str(self))
 def lock_open(path,mode):
  assert path=='/tmp/chronoverse-newsletter-v2-private-release.lock' and mode=='a'
  return io.BytesIO()
 fake_fcntl=types.SimpleNamespace(LOCK_EX=1,LOCK_NB=2,flock=lambda *args:None)
 modules={'pathlib':types.SimpleNamespace(Path=MemoryPath,PurePosixPath=pathlib.PurePosixPath),'fcntl':fake_fcntl}
 failed=False
 with patch.dict(sys.modules,modules),patch('builtins.open',side_effect=lock_open),patch.object(m.os,'umask',return_value=0),contextlib.redirect_stdout(io.StringIO()):
  try:exec(compile(staging,'<reviewed-staging>','exec'),{})
  except SystemExit:failed=True
 assert {path:files[path] for path in before}==before
 if mode=='valid':
  assert not failed and len(writes)==9
  assert files[work+'/.confirmation-fix-state.json']==saved
  assert files[work+'/patch.json']==files[old+'/patch.json']
  assert m.sha(files[work+'/SHA256SUMS'])==m.sha(new_manifest)
  assert m.sha(files[work+'/deploy-confirmation-fix.py'])=='59d8e91cf905c716160d225443ee04916005ad9d3abdaecf7a0e332dc2af30bc'
 else:assert failed and not writes
`);
});

const checkpointSetup = `
class ApprovalBoundary(RuntimeError):pass
def copied_checkpoint_case(mode='valid',explicit=True):
 with tempfile.TemporaryDirectory() as directory:
  base=pathlib.Path(directory);original_dir=base/'original release';original_dir.mkdir()
  prior=base/'previous patch';prior.mkdir();work=base/'confirmation-launcher-59d8e91cf905';work.mkdir()
  r,control,schedules,calls,rows,audits,configs,statement,meta=private_fixture(original_dir)
  meta['patchId']='confirmation-post-fix-6ee620a8c933'
  r.resources['HttpApi']='synthetic-api';r.meta.update(region='eu-north-1',account='123456789012',stack='synthetic-stack',bucket='synthetic-bucket')
  r.stack={'StackId':'synthetic-stack','Parameters':[]}
  configs['ApiFunction']['CodeSha256']=base64.b64encode(bytes.fromhex(meta['baseRuntimeSha256'])).decode()
  integration={'IntegrationId':'synthetic','IntegrationType':'AWS_PROXY','IntegrationMethod':'POST','PayloadFormatVersion':'2.0','IntegrationUri':'arn:aws:lambda:eu-north-1:123456789012:function:'+r.resources['ApiFunction']}
  r.routes=lambda:[{'RouteKey':key,'AuthorizationType':'AWS_IAM' if key in m.PRIVATE_ROUTES else 'NONE','Target':'integrations/synthetic'} for key in m.ROUTES]
  original_client=r.client
  r.client=lambda name:types.SimpleNamespace(get_paginator=lambda operation:types.SimpleNamespace(paginate=lambda **kw:[{'Items':[integration]}])) if name=='apigatewayv2' else original_client(name)
  source={'synthetic':'pinned source'};(original_dir/'main-template.json').write_text(json.dumps(source))
  class CF:
   def get_template(self,**kw):return {'TemplateBody':source if kw['TemplateStage']=='Original' else {'synthetic':'processed'}}
   def list_change_sets(self,**kw):
    calls.append('historical-list');return {'Summaries':[{'ChangeSetName':'confirmation-post-fix-historical','ChangeSetId':'listed-old-id','StackId':'synthetic-stack'}]}
   def describe_change_set(self,**kw):
    calls.append(('historical-describe',kw['ChangeSetName']))
    return {'StackId':'synthetic-stack','ChangeSetId':kw['ChangeSetName'],'Status':'CREATE_COMPLETE','ExecutionStatus':'AVAILABLE','Changes':[]}
   def create_change_set(self,**kw):raise AssertionError('PREPARE operation attempted')
   def execute_change_set(self,**kw):raise AssertionError('prior execution replayed')
  r.cf=CF()
  state={'patchId':meta['patchId'],'originalDirectory':str(original_dir.resolve()),'changeSetId':'saved-old-id','preparingChangeSetName':'saved-old-name','historicalChangeSetIds':['preserved-history'],'executionStarted':False,'deployed':False}
  if mode=='patch-mismatch':state['patchId']='foreign-patch'
  if mode=='directory-mismatch':state['originalDirectory']=str(base/'foreign original')
  if mode=='uncertain-execution':state['executionStarted']=True
  prior_path=prior/'.confirmation-fix-state.json';prior_path.write_text(json.dumps(state,indent=3)+'  ')
  copied=work/prior_path.name;copied.write_bytes(prior_path.read_bytes())
  prior_bytes=prior_path.read_bytes();original_bytes=r.path.read_bytes();original_state=copy.deepcopy(r.state);records=copy.deepcopy(rows)
  m.HERE=work
  for name,blob in [('patch.json',json.dumps(meta).encode()),('deploy-confirmation-fix.py',pathlib.Path(m.__file__).read_bytes())]:(work/name).write_bytes(blob)
  (work/'SHA256SUMS').write_text(''.join(m.sha((work/name).read_bytes())+'  '+name+chr(10) for name in ['deploy-confirmation-fix.py','patch.json']))
  chosen=[]
  def original_release(path,metadata):chosen.append(path);return types.SimpleNamespace(),r
  m.original_release=original_release;m.reconstruct=lambda *args:b'synthetic reviewed runtime'
  prompts=[]
  def approval(prompt):prompts.append(prompt);raise ApprovalBoundary('local test stops before approval')
  m.deploy.__wrapped__.__defaults__=(approval,)
  argument=str(original_dir.resolve())
  if mode=='whitespace-argument':argument=' '+argument
  argv=['launcher']+([argument] if explicit else [])
  fake_fcntl=types.SimpleNamespace(LOCK_EX=1,LOCK_NB=2,flock=lambda *args:None)
  failure=None
  with patch.dict(sys.modules,{'fcntl':fake_fcntl}),patch.object(m.os,'open',return_value=100),patch.object(sys,'argv',argv),contextlib.redirect_stdout(io.StringIO()):
   try:m.main()
   except RuntimeError as error:failure=error
   else:raise AssertionError('launcher passed approval boundary')
  assert prior_path.read_bytes()==prior_bytes and r.path.read_bytes()==original_bytes and r.state==original_state and rows==records
  resumed=json.loads(copied.read_bytes())
  assert resumed['patchId']==state['patchId'] and resumed['originalDirectory']==state['originalDirectory'] and resumed['changeSetId']=='saved-old-id'
  assert not (work/'DEPLOYMENT-RECEIPT.json').exists()
  if mode=='valid':
   assert isinstance(failure,ApprovalBoundary) and chosen==[original_dir.resolve()]
   assert len(prompts)==1 and prompts[0].endswith('Type PREPARE CONFIRMATION FIX: ')
   assert set(resumed['historicalChangeSetIds'])=={'preserved-history','listed-old-id'}
   assert ('historical-describe','listed-old-id') in calls and resumed['executionStarted'] is False
  else:
   assert not isinstance(failure,ApprovalBoundary) and not prompts
   assert copied.read_bytes()==prior_bytes and 'historical-list' not in calls
   if mode=='uncertain-execution':assert 'Prior change-set execution is uncertain' in str(failure)
   else:assert 'Patch checkpoint target mismatch' in str(failure)
   if mode=='whitespace-argument':assert chosen[0]!=original_dir.resolve()
`;

test("single-line Bash startup passes exactly one original-directory positional argument", () => {
  assert.equal(startupCommand.includes("\\"), false);
  assert.equal(/[\r\n]/.test(startupCommand), false);
  const bash = process.platform === "win32" ? "C:/Program Files/Git/bin/bash.exe" : "bash";
  const result = spawnSync(bash, ["--noprofile", "--norc", "-c", 'python3() { printf "%s\\0" "$@"; }; ' + startupCommand], { encoding: "utf8", windowsHide: true });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.stdout.split("\0"), ["-B", "/home/cloudshell-user/confirmation-launcher-59d8e91cf905/deploy-confirmation-fix.py", "/home/cloudshell-user/private-signup-repair-20261027-739404fe3d61", ""]);
});

test("copied prior patch checkpoint resumes from the new directory with explicit or checkpoint-derived originalDirectory", () => {
  python(checkpointSetup + "copied_checkpoint_case(explicit=True)\ncopied_checkpoint_case(explicit=False)\n");
});

test("copied checkpoint preserves mismatch and uncertain-execution guards and does not strip positional whitespace", () => {
  python(checkpointSetup + "for mode in ['patch-mismatch','directory-mismatch','uncertain-execution','whitespace-argument']:copied_checkpoint_case(mode)\n");
});

test("confirmation template pins only API CodeUri and existing private route IAM authorization", () => {
  python(`events={name:{'Type':'HttpApi','Properties':{'Method':method,'Path':path}} for name,method,path in [('subscribe','POST','/subscribe'),('registerPage','GET','/register'),('registerAction','POST','/register'),('confirm','POST','/confirm')]}
original={'Parameters':{'RuntimeObjectVersion':{},'ConfirmationEnabled':{}},'Globals':{'Function':{'CodeUri':{'Bucket':'original','Key':'runtime','Version':'original'}}},'Resources':{'HttpApi':{'Properties':{'StageName':'$default'}},'ApiFunction':{'Properties':{'Events':events,'Handler':'src/handlers.api','Environment':{'Variables':{'CONFIRMATION_ENABLED':'true'}}}},'Ledger':{'DeletionPolicy':'Retain'},'WeeklySchedule':{'Properties':{'State':'DISABLED'}}}}
snapshot=copy.deepcopy(original);patched=m.template_for_patch(original,'bucket','new/key','immutable-version')
assert original==snapshot and patched['Resources']['ApiFunction']['Properties']['CodeUri']=={'Bucket':'bucket','Key':'new/key','Version':'immutable-version'}
assert patched['Resources']['HttpApi']['Properties'].pop('Auth')=={'EnableIamAuthorizer':True}
for name in ['subscribe','registerPage','registerAction']:assert patched['Resources']['ApiFunction']['Properties']['Events'][name]['Properties'].pop('Auth')=={'Authorizer':'AWS_IAM'}
del patched['Resources']['ApiFunction']['Properties']['CodeUri'];assert patched==original
`);
});

test("confirmation preflight never restores revoked durable approval or enables delivery", () => {
  python(`for control in [{'deliveryEnabled':True,'legacyRetired':True,'complianceApproved':True},{'deliveryEnabled':False,'legacyRetired':False,'complianceApproved':True},{'deliveryEnabled':False,'legacyRetired':True,'complianceApproved':False}]:
 control={'registrationEnabled':False,'confirmationEnabled':False,**control}
 r=types.SimpleNamespace(schedules_off=lambda:None,control=lambda:control)
 blocked(lambda:m.verify_private(r,{},'unused'))
`);
});

test("existing confirmation claim must be accepted and bound to the same mailbox, nonce and provider receipt", () => {
  python(`for status in ['CLAIMED','UNKNOWN','NOT_SENT','RETRYABLE']:
 helper,r,row,claim,calls=fixture();claim['state']=status;blocked(lambda:m.verify_claim(helper,r));assert not calls
helper,r,row,claim,calls=fixture();assert m.verify_claim(helper,r) is row
row['confirmationNonce']='r'*32;blocked(lambda:m.verify_claim(helper,r));assert not calls
helper,r,row,claim,calls=fixture();r.state['providerMessageId']='different';blocked(lambda:m.verify_claim(helper,r))
helper,r,row,claim,calls=fixture();row['email']='different@example.test';blocked(lambda:m.verify_claim(helper,r))
`);
});

test("deployment completion preserves pending consent, accepted claim and checkpoint without reusing the exposed token", () => {
  python(`with tempfile.TemporaryDirectory() as temp:
 m.HERE=pathlib.Path(temp);helper,r,row,claim,calls=fixture();original=copy.deepcopy(r.state)
 old_row=copy.deepcopy(row);old_claim=copy.deepcopy(claim);m.verify_private=lambda *args:None
 meta={'patchId':'synthetic-patch','runtimeSha256':'b'*64,'originalReleaseId':'synthetic-original'}
 m.hold_for_fresh_consent(helper,r,meta)
 assert calls==['paused'] and r.state==original and row==old_row and claim==old_claim
 receipt=json.loads((m.HERE/'DEPLOYMENT-RECEIPT.json').read_text())
 assert receipt['deployment']=='VERIFIED' and receipt['freshConsent']=='REQUIRED' and receipt['oldTokenReused'] is False and receipt['emailSent'] is False
 assert receipt['confirmationGate']=='CLOSED' and receipt['weeklyDelivery']=='OFF' and receipt['unsubscribeAndFeedback']=='NOT_RUN'
 assert not (m.HERE/'CONFIRMATION-FIX-RECEIPT.json').exists() and not hasattr(m,'resume')
`);
});

test("old confirmation/test flags never attest fresh consent or reopen enrollment", () => {
  python(`with tempfile.TemporaryDirectory() as temp:
 m.HERE=pathlib.Path(temp);m.verify_private=lambda *args:None;helper,r,row,claim,calls=fixture()
 row['state']='CONFIRMED';del row['confirmationNonce'];r.state.update(confirmedObserved=True,testPassed=True)
 original=copy.deepcopy(r.state)
 meta={'patchId':'synthetic-patch','runtimeSha256':'b'*64,'originalReleaseId':'synthetic-original'}
 m.hold_for_fresh_consent(helper,r,meta)
 assert calls==['paused'] and r.state==original and row['state']=='CONFIRMED'
 assert json.loads((m.HERE/'DEPLOYMENT-RECEIPT.json').read_text())['freshConsent']=='REQUIRED'
`);
});

test("wrong original manifest stops before importing executable release code or altering its checkpoint", () => {
  python(`with tempfile.TemporaryDirectory() as temp:
 directory=pathlib.Path(temp);(directory/'SHA256SUMS').write_text('wrong manifest');checkpoint=directory/'.cloudshell-release-state.json';checkpoint.write_text('preserve')
 blocked(lambda:m.original_release(directory,{'originalManifestSha256':'0'*64}));assert checkpoint.read_text()=='preserve'
`);
});

test("closure requires strict false for every CONTROL gate without attempting a closing write", () => {
  python(`for gate in ['registrationEnabled','confirmationEnabled','deliveryEnabled']:
 for value in [None,True,'false','true',0,1,[],{}]:
  r,control,schedules,calls=closed_fixture();control[gate]=value;snapshot=copy.deepcopy(control)
  blocked(lambda:m.verify_closed(r));assert control==snapshot and not calls
 r,control,schedules,calls=closed_fixture();del control[gate]
 blocked(lambda:m.verify_closed(r));assert not calls
for value in [None,False,[],{},'false']:
 r,control,schedules,calls=closed_fixture();r.control=lambda:value
 blocked(lambda:m.verify_closed(r));assert not calls
r,control,schedules,calls=closed_fixture();assert m.verify_closed(r) is control and calls==['schedules-read']
`);
});

test("closure checks every paginated schedule and rejects enabled, malformed or missing schedules", () => {
  python(`for position in [0,1]:
 for value in ['ENABLED',None,False,'disabled']:
  r,control,schedules,calls=closed_fixture();schedules[position]['State']=value
  blocked(lambda:m.verify_closed(r));assert calls==['schedules-read']
r,control,schedules,calls=closed_fixture();schedules.clear();blocked(lambda:m.verify_closed(r))
`);
});

test("private verification runs the original isolation checks without checkpoint or subscriber writes", () => {
  python(`with tempfile.TemporaryDirectory() as directory:
 r,control,schedules,calls,rows,audits,configs,statement,meta=private_fixture(directory)
 checkpoint=r.path.read_bytes();state=copy.deepcopy(r.state);records=copy.deepcopy(rows);active=[True];writes=[]
 def audit(event,args):
  if not active[0]:return
  if event=='open':
   mode,flags=args[1:3]
   if (isinstance(mode,str) and any(c in mode for c in 'wax+')) or (isinstance(flags,int) and flags & (os.O_WRONLY|os.O_RDWR|os.O_CREAT|os.O_TRUNC|os.O_APPEND)):
    writes.append(event);raise AssertionError('file write attempted')
  if event in {'os.rename','os.remove','os.mkdir','os.rmdir','os.chmod','subprocess.Popen','os.system'}:
   writes.append(event);raise AssertionError('mutation attempted')
 sys.addaudithook(audit)
 try:
  with contextlib.redirect_stdout(io.StringIO()):m.verify_private(r,meta,meta['runtimeSha256'])
 finally:active[0]=False
 assert not writes and r.path.read_bytes()==checkpoint and r.state==state and rows==records
 assert 'isolationVerified' not in r.state and calls.count('lambda-read')==5 and calls.count('schedules-read')==2
`);
});

test("read-only isolation still rejects altered baselines, original identities, suppression and missing consent audits", () => {
  python(`for mode in ['checksum','missing-row','identity','suppression-removed','suppression-changed','missing-audits']:
 with tempfile.TemporaryDirectory() as directory:
  r,control,schedules,calls,rows,audits,configs,statement,meta=private_fixture(directory)
  if mode=='checksum':r.state['historicalBaselineSha256']='0'*64
  elif mode=='missing-row':del rows['SUB#old']
  elif mode=='identity':rows['SUB#old']['email']='changed@example.test'
  elif mode=='suppression-removed':del rows['SUB#suppressed']['suppressedAt']
  elif mode=='suppression-changed':rows['SUB#suppressed']['suppressionReason']='changed'
  else:
   rows['SUB#old'].update(state='CONFIRMED',confirmedPolicy=original.ENROLLMENT_POLICY,awsConsentVersion=original.CONSENT_VERSION,awsConsentText=original.CONSENT_TEXT,awsRequestedAt=10,confirmedAt=20,confirmedRequestNonce='n'*32,unsubscribeNonce='u'*32)
   assert original.eligible(rows['SUB#old'])
  before=r.path.read_bytes();state=copy.deepcopy(r.state);records=copy.deepcopy(rows)
  blocked(lambda:m.verify_isolation(r))
  assert r.path.read_bytes()==before and r.state==state and rows==records
`);
});

test("read-only isolation validates both consent audits and rejects unexpected verifier state changes", () => {
  python(`with tempfile.TemporaryDirectory() as directory:
 r,control,schedules,calls,rows,audits,configs,statement,meta=private_fixture(directory)
 row=rows['SUB#old'];row.update(state='CONFIRMED',confirmedPolicy=original.ENROLLMENT_POLICY,awsConsentVersion=original.CONSENT_VERSION,awsConsentText=original.CONSENT_TEXT,awsRequestedAt=10,confirmedAt=20,confirmedRequestNonce='n'*32,unsubscribeNonce='u'*32)
 confirm='AUDIT#old#confirm#'+'n'*32;request='AUDIT#old#request#'+'n'*32
 audits[confirm]={'enrollmentPolicy':original.ENROLLMENT_POLICY,'kind':'confirmed','at':20}
 audits[request]={'enrollmentPolicy':original.ENROLLMENT_POLICY,'at':10,'consentText':original.CONSENT_TEXT}
 before=r.path.read_bytes();state=copy.deepcopy(r.state)
 with contextlib.redirect_stdout(io.StringIO()):m.verify_isolation(r)
 assert r.path.read_bytes()==before and r.state==state
 for key,field in [(confirm,'kind'),(confirm,'at'),(request,'consentText'),(request,'enrollmentPolicy')]:
  saved=copy.deepcopy(audits[key]);audits[key][field]='changed'
  blocked(lambda:m.verify_isolation(r));audits[key]=saved
 class ChangedVerifier(original.Release):
  def isolation(self):
   super().isolation();self.state['unexpected']='private value'
 r.__class__=ChangedVerifier
 with contextlib.redirect_stdout(io.StringIO()):blocked(lambda:m.verify_isolation(r))
 assert r.path.read_bytes()==before and r.state==state
`);
});

test("private verification preserves Lambda, IAM and private-route checks and detects gate changes during verification", () => {
  python(`for mode in ['api-hash','other-hash','update','environment','recipient','broad-ses','private-route','late-gate']:
 with tempfile.TemporaryDirectory() as directory:
  r,control,schedules,calls,rows,audits,configs,statement,meta=private_fixture(directory)
  if mode=='api-hash':configs['ApiFunction']['CodeSha256']='foreign'
  elif mode=='other-hash':configs['WorkerFunction']['CodeSha256']=configs['ApiFunction']['CodeSha256']
  elif mode=='update':configs['ApiFunction']['LastUpdateStatus']='InProgress'
  elif mode=='environment':configs['ApiFunction']['Environment']['Variables']['CONFIRMATION_ENABLED']='false'
  elif mode=='recipient':statement['Condition']['ForAllValues:StringEquals']['ses:Recipients']=['foreign@example.test']
  elif mode=='broad-ses':statement['Action']='ses:*'
  elif mode=='private-route':r.routes=lambda:[{'RouteKey':key,'AuthorizationType':'NONE'} for key in m.ROUTES]
  else:
   read_rows=r.subscribers
   def late():control['registrationEnabled']=True;return read_rows()
   r.subscribers=late
  before=r.path.read_bytes();state=copy.deepcopy(r.state)
  with contextlib.redirect_stdout(io.StringIO()):blocked(lambda:m.verify_private(r,meta,meta['runtimeSha256']))
  assert r.path.read_bytes()==before and r.state==state
`);
});

test("live integrations accept exact bare or wrapped targets and reject foreign functions, aliases and changed authorization", () => {
  python(`arn='arn:aws:lambda:eu-north-1:123456789012:function:synthetic-api'
wrap=lambda target:'arn:aws:apigateway:eu-north-1:lambda:path/2015-03-31/functions/'+target+'/invocations'
integration={'IntegrationId':'synthetic','IntegrationType':'AWS_PROXY','IntegrationMethod':'POST','PayloadFormatVersion':'2.0','IntegrationUri':arn}
routes=[{'RouteKey':key,'AuthorizationType':'AWS_IAM' if key in m.PRIVATE_ROUTES else 'NONE','Target':'integrations/synthetic'} for key in m.ROUTES]
r=types.SimpleNamespace(meta={'region':'eu-north-1','account':'123456789012'},resources={'HttpApi':'synthetic','ApiFunction':'synthetic-api'},routes=lambda:routes,client=lambda _:types.SimpleNamespace(get_paginator=lambda _:types.SimpleNamespace(paginate=lambda **kw:[{'Items':[integration]}])))
for uri in [arn,wrap(arn)]:
 integration['IntegrationUri']=uri;assert len(m.route_configuration(r))==11
for uri in [arn+':alias',wrap(arn+':1'),arn.replace('123456789012','999999999999'),wrap(arn.replace('synthetic-api','foreign'))]:
 integration['IntegrationUri']=uri;blocked(lambda:m.route_configuration(r))
integration['IntegrationUri']=arn
for field,value in [('PayloadFormatVersion','1.0'),('IntegrationMethod','GET'),('CredentialsArn','foreign-role')]:
 saved=copy.deepcopy(integration);integration[field]=value;blocked(lambda:m.route_configuration(r));integration.clear();integration.update(saved)
private=next(row for row in routes if row['RouteKey']=='POST /subscribe');private['AuthorizationType']='NONE';blocked(lambda:m.route_configuration(r))
`);
});

test("full processed-template comparison still rejects unexpected resource, environment, code, security and suppression changes", () => {
  python(`body={'openapi':'3.0.1','paths':{}}
for route in m.ROUTES:
 method,path=route.split(' ');body['paths'].setdefault(path,{})[method.lower()]={'x-amazon-apigateway-integration':copy.deepcopy(m.INTEGRATION),'responses':{}}
before={'Resources':{'ApiFunction':{'Properties':{'Code':{'S3Bucket':'old','S3Key':'base','S3ObjectVersion':'base'},'Environment':{'Variables':{'CONFIRMATION_ENABLED':'true'}}}},'HttpApi':{'Properties':{'Body':body}},'Ledger':{'DeletionPolicy':'Retain'},'SuppressionPolicy':{'Properties':{'Unchanged':True}}}}
code={'Bucket':'bucket','Key':'reviewed','Version':'immutable'};expected=copy.deepcopy(before)
expected['Resources']['ApiFunction']['Properties']['Code']={'S3Bucket':'bucket','S3Key':'reviewed','S3ObjectVersion':'immutable'}
expected['Resources']['HttpApi']['Properties']['Body']=m.private_body(body);m.inspect_templates(before,expected,code)
for change in [lambda x:x['Resources'].pop('Ledger'),lambda x:x['Resources']['Ledger'].update(DeletionPolicy='Delete'),lambda x:x['Resources']['ApiFunction']['Properties']['Code'].update(S3ObjectVersion='foreign'),lambda x:x['Resources']['ApiFunction']['Properties']['Environment']['Variables'].update(CONFIRMATION_ENABLED='false'),lambda x:x['Resources']['HttpApi']['Properties']['Body']['paths']['/register']['post'].update(security=[]),lambda x:x['Resources']['SuppressionPolicy']['Properties'].update(Unchanged=False)]:
 actual=copy.deepcopy(expected);change(actual);blocked(lambda:m.inspect_templates(before,actual,code))
`);
});

test("failure output exposes only stage, exception class and safe source location", () => {
  python(`secret='PRIVATE_SUBSCRIBER_TOKEN_AND_SDK_DETAILS'
for error in [FileNotFoundError(2,secret,'/private/'+secret),RuntimeError(secret),KeyboardInterrupt(secret)]:
 def fail(**kw):raise error
 r=types.SimpleNamespace(meta={'stack':secret},cf=types.SimpleNamespace(get_template=fail))
 m.main=lambda:m.get_template(r,'Original');out=io.StringIO();err=io.StringIO()
 with contextlib.redirect_stdout(out),contextlib.redirect_stderr(err):
  try:m.run()
  except SystemExit as stopped:assert stopped.code==1
  else:raise AssertionError('failure accepted')
 assert secret not in out.getvalue()+err.getvalue() and err.getvalue()==''
 report=json.loads(out.getvalue().splitlines()[0])['Failure']
 assert set(report)=={'Stage','Class','Source','SourceLine'} and report['Stage']=='template-read' and report['Class']==type(error).__name__ and report['Source']=='launcher'
 assert 'r.cf.get_template' in pathlib.Path(m.__file__).read_text().splitlines()[report['SourceLine']-1]
`);
});

test("main entry and failure paths verify closure without CONTROL writes or original checkpoint changes", () => {
  python(`real_main=m.main
for mode in ['success','failure','readback-failure','enabled-entry']:
 with tempfile.TemporaryDirectory() as directory:
  r,control,schedules,calls,rows,audits,configs,statement,meta=private_fixture(directory)
  before=r.path.read_bytes();state=copy.deepcopy(r.state);records=copy.deepcopy(rows)
  m.HERE=pathlib.Path(directory);meta['patchId']='synthetic-patch'
  blob=json.dumps(meta).encode();(m.HERE/'patch.json').write_bytes(blob)
  (m.HERE/'SHA256SUMS').write_text(m.sha(blob)+'  patch.json'+chr(10))
  m.original_release=lambda *args:(types.SimpleNamespace(),r)
  def deploy(*args):
   calls.append('deploy')
   if mode in ['failure','readback-failure']:
    if mode=='readback-failure':schedules[1]['State']='ENABLED'
    raise FileNotFoundError(2,'PRIVATE_ERROR','/private/PRIVATE_SUBSCRIBER')
  m.deploy=m.failure_stage('deployment')(deploy);m.hold_for_fresh_consent=lambda *args:calls.append('hold')
  if mode=='enabled-entry':control['confirmationEnabled']=True
  fake_fcntl=types.SimpleNamespace(LOCK_EX=1,LOCK_NB=2,flock=lambda *args:None)
  out=io.StringIO()
  with patch.dict(sys.modules,{'fcntl':fake_fcntl}),patch.object(m.os,'open',return_value=100),patch.object(sys,'argv',['launcher',directory]),contextlib.redirect_stdout(out):
   m.main=real_main
   if mode=='success':m.run()
   else:
    try:m.run()
    except SystemExit as stopped:assert stopped.code==1
    else:raise AssertionError('failure accepted')
  assert r.path.read_bytes()==before and r.state==state and rows==records
  assert not (m.HERE/'.confirmation-fix-state.json').exists()
  assert 'PRIVATE_' not in out.getvalue()
  if mode=='success':assert 'deploy' in calls and 'hold' in calls
  else:
   assert 'hold' not in calls
   reports=[json.loads(line) for line in out.getvalue().splitlines() if line.startswith('{')]
   failure=next(report['Failure'] for report in reports if 'Failure' in report)
   assert failure['Stage']==('closure.control' if mode=='enabled-entry' else 'deployment')
   if mode=='enabled-entry':assert 'deploy' not in calls
   if mode=='readback-failure':assert any(report.get('FailureReadback',{}).get('Stage')=='closure.schedules' for report in reports)
`);
});
