import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const setup = `import importlib.util,pathlib,types,json,copy,base64,tempfile
spec=importlib.util.spec_from_file_location('fix',pathlib.Path(${JSON.stringify(fileURLToPath(new URL('../scripts/cloudshell-confirmation-fix.py', import.meta.url)))}))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
def blocked(fn):
 try:fn()
 except RuntimeError:return
 raise AssertionError('unsafe change accepted')
resources={'ApiFunction':'synthetic-stack-api','HttpApi':'synthetic-api'}
def changes(private=False):
 result={'Status':'CREATE_COMPLETE','ExecutionStatus':'AVAILABLE','Changes':[],'StackId':'synthetic-stack','ChangeSetId':'synthetic-id'}
 for logical,kind,prop,source,evaluation,cause in [('ApiFunction','AWS::Lambda::Function','Code','DirectModification','Static',None),('HttpApi','AWS::ApiGatewayV2::Api','Body','ResourceAttribute','Dynamic','ApiFunction.Arn')]:
  detail={'Target':{'Attribute':'Properties','Name':prop,'RequiresRecreation':'Never'},'Evaluation':evaluation,'ChangeSource':source}
  if cause:detail['CausingEntity']=cause
  result['Changes'].append({'Type':'Resource','ResourceChange':{'LogicalResourceId':logical,'ResourceType':kind,'PhysicalResourceId':resources[logical],'Action':'Modify','Replacement':'False','Scope':['Properties'],'Details':[detail]}})
 if private:result['Changes'][1]['ResourceChange']['Details'].append({'Target':{'Attribute':'Properties','Name':'Body','RequiresRecreation':'Never'},'Evaluation':'Static','ChangeSource':'DirectModification'})
 return result
def templates():
 body={'openapi':'3.0.1','info':{'title':{'Ref':'AWS::StackName'},'version':'1.0'},'paths':{}}
 for route in ['GET /register','POST /register','POST /subscribe','GET /confirm','POST /confirm','GET /unsubscribe','POST /unsubscribe','GET /api/newsletter/confirm','POST /api/newsletter/confirm','GET /api/newsletter/unsubscribe','POST /api/newsletter/unsubscribe']:
  method,path=route.split(' ');body['paths'].setdefault(path,{})[method.lower()]={'responses':{},'x-amazon-apigateway-integration':{'httpMethod':'POST','type':'aws_proxy','payloadFormatVersion':'2.0','uri':{'Fn::Sub':'arn:DOLLAR{AWS::Partition}:apigateway:DOLLAR{AWS::Region}:lambda:path/2015-03-31/functions/DOLLAR{ApiFunction.Arn}/invocations'.replace('DOLLAR',chr(36))}}}
 before={'Parameters':{'SigningSecret':{'NoEcho':True}},'Resources':{'ApiFunction':{'Type':'AWS::Lambda::Function','Properties':{'Code':{'S3Bucket':'bucket','S3Key':'base','S3ObjectVersion':'base-version'},'Environment':{'Variables':{'DELIVERY_ENABLED':'false'}},'Role':{'Fn::GetAtt':['ApiRole','Arn']}}},'HttpApi':{'Type':'AWS::ApiGatewayV2::Api','Properties':{'Body':body}},'ApiRole':{'Properties':{'Policies':['unchanged']}},'Ledger':{'DeletionPolicy':'Retain'},'HttpApiApiGatewayDefaultStage':{'Properties':{'AutoDeploy':True,'DefaultRouteSettings':{'ThrottlingRateLimit':2}}}}}
 code={'Bucket':'bucket','Key':'fix','Version':'immutable-version'};after=copy.deepcopy(before)
 after['Resources']['ApiFunction']['Properties']['Code']={'S3Bucket':code['Bucket'],'S3Key':code['Key'],'S3ObjectVersion':code['Version']}
 return before,after,code
`;
function python(code) {
  const result = spawnSync(process.platform === 'win32' ? 'python' : 'python3', ['-B', '-c', setup + code], { encoding: 'utf8', windowsHide: true });
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

test('accepts the reviewed HttpApi.Body dependency shape when actually present in the new set', () => {
  python(`m.inspect_changes(changes(),resources,dependency_only=True)
m.inspect_changes(changes(True),resources)
blocked(lambda:m.inspect_changes(changes(True),resources,dependency_only=True))
`);
});

test('rejects missing, duplicate, extra, replacing, wrong identity/type/scope or incomplete resource changes', () => {
  python(`for mutate in [lambda x:x.update(Changes=[]),lambda x:x['Changes'].pop(),lambda x:x['Changes'].append(copy.deepcopy(x['Changes'][0])),lambda x:x['Changes'].__setitem__(1,copy.deepcopy(x['Changes'][0])),lambda x:x.update(NextToken='next'),lambda x:x.update(Status='CREATE_IN_PROGRESS'),lambda x:x.update(ExecutionStatus='EXECUTE_COMPLETE')]:
 x=changes();mutate(x);blocked(lambda:m.inspect_changes(x,resources))
for index in [0,1]:
 for key,value in [('Action','Add'),('Action','Remove'),('Replacement','Conditional'),('Replacement','True'),('PhysicalResourceId','different'),('ResourceType','AWS::DynamoDB::Table'),('Scope',['Properties','Tags']),('Details',[])]:
  x=changes();x['Changes'][index]['ResourceChange'][key]=value;blocked(lambda:m.inspect_changes(x,resources))
`);
});

test('rejects every unreviewed property, recreation, path, source, evaluation and causing entity', () => {
  python(`for index in [0,1]:
 for key,value in [('Attribute','Metadata'),('Name','Environment'),('RequiresRecreation','Conditionally'),('RequiresRecreation','Always'),('Path','/Properties/Role')]:
  x=changes();x['Changes'][index]['ResourceChange']['Details'][0]['Target'][key]=value;blocked(lambda:m.inspect_changes(x,resources))
 for key,value in [('ChangeSource','ParameterReference'),('ChangeSource','Automatic'),('Evaluation','unexpected'),('CausingEntity','OtherFunction.Arn')]:
  x=changes();x['Changes'][index]['ResourceChange']['Details'][0][key]=value;blocked(lambda:m.inspect_changes(x,resources))
`);
});

test('processed comparison permits only exact immutable code and three existing private IAM restrictions', () => {
  python(`before,after,code=templates();m.inspect_templates(before,after,code,dependency_only=True)
after['Resources']['HttpApi']['Properties']['Body']=m.private_body(before['Resources']['HttpApi']['Properties']['Body'])
m.inspect_templates(before,after,code)
assert before['Resources']['HttpApi']['Properties']['Body'].get('components') is None
for mutate in [lambda x:x['Resources']['ApiFunction']['Properties']['Environment']['Variables'].update(DELIVERY_ENABLED='true'),lambda x:x['Resources']['ApiRole']['Properties'].update(Policies=['broader']),lambda x:x['Resources']['Ledger'].update(DeletionPolicy='Delete'),lambda x:x['Parameters']['SigningSecret'].update(NoEcho=False),lambda x:x['Resources']['HttpApiApiGatewayDefaultStage']['Properties'].update(AutoDeploy=False),lambda x:x['Resources']['ApiFunction']['Properties']['Code'].update(S3ObjectVersion='different')]:
 bad=copy.deepcopy(after);mutate(bad);blocked(lambda:m.inspect_templates(before,bad,code))
`);
});

test('rejects public registration, protected confirmation, changed integration, CORS, extra routes or authorizers', () => {
  python(`before,after,code=templates();after['Resources']['HttpApi']['Properties']['Body']=m.private_body(before['Resources']['HttpApi']['Properties']['Body'])
for mutate in [lambda b:b['paths']['/register']['post'].pop('security'),lambda b:b['paths']['/confirm']['post'].update(security=[{'AWS_IAM':[]}]),lambda b:b['paths']['/confirm']['post']['x-amazon-apigateway-integration'].update(uri='different'),lambda b:b['paths']['/confirm']['post']['x-amazon-apigateway-integration'].update(payloadFormatVersion='1.0'),lambda b:b.update({'x-amazon-apigateway-cors':{'allowOrigins':['*']}}),lambda b:b['paths'].update({'/{proxy+}':{'x-amazon-apigateway-any-method':{}}}),lambda b:b['components']['securitySchemes'].update(Evil={'type':'oauth2'})]:
 bad=copy.deepcopy(after);mutate(bad['Resources']['HttpApi']['Properties']['Body']);blocked(lambda:m.inspect_templates(before,bad,code))
`);
});

test('historical inventory reads all list pages and retains unknown, absent or unavailable old sets without approving them', () => {
  python(`calls=[];result=changes();result['Changes'].append({'ResourceChange':{'LogicalResourceId':'UnknownOldResource','Action':'Remove'}})
summary={'StackId':'synthetic-stack','ChangeSetName':'confirmation-post-fix-historical','ChangeSetId':'synthetic-id'}
def listed(**args):
 calls.append(('list',args));return {'Summaries':[summary]} if args.get('NextToken')=='second-list-page' else {'Summaries':[],'NextToken':'second-list-page'}
def describe(**args):calls.append(('describe',args));return result
r=types.SimpleNamespace(meta={'stack':'synthetic-stack'},stack={'StackId':'synthetic-stack'},resources=resources,cf=types.SimpleNamespace(list_change_sets=listed,describe_change_set=describe))
state={'checkpoint':'preserve'};m.historical_sets(r,state,lambda:calls.append(('save',{})))
assert state=={'checkpoint':'preserve','historicalChangeSetIds':['synthetic-id']}
assert len([x for x in calls if x[0]=='list'])==2 and next(v for k,v in calls if k=='describe')['IncludePropertyValues'] is True
assert {k for k,v in calls}=={'list','describe','save'}
r.cf.list_change_sets=lambda **kw:{'Summaries':[]};m.historical_sets(r,state,lambda:None);assert state['historicalChangeSetIds']==['synthetic-id']
r.cf.list_change_sets=lambda **kw:{'Summaries':[summary]};r.cf.describe_change_set=lambda **kw:(_ for _ in ()).throw(RuntimeError('private SDK message'))
m.historical_sets(r,state,lambda:None);assert state['checkpoint']=='preserve'
`);
});

test('describe aggregates every property-value page before strict validation and rejects unknown later-page resources', () => {
  python(`calls=[];full=changes(True)
def describe(**args):
 assert args['IncludePropertyValues'] is True;calls.append(args);page=copy.deepcopy(full)
 if not args.get('NextToken'):page.update(Changes=full['Changes'][:1],NextToken='second-page')
 else:assert args['NextToken']=='second-page';page.update(Changes=full['Changes'][1:])
 return page
r=types.SimpleNamespace(meta={'stack':'synthetic-stack'},stack={'StackId':'synthetic-stack'},cf=types.SimpleNamespace(describe_change_set=describe))
result=m.describe(r,'synthetic-id');m.inspect_changes(result,resources);assert len(calls)==2 and not result.get('NextToken')
full['Changes'].append({'ResourceChange':{'LogicalResourceId':'UnknownLaterPage','Action':'Modify'}})
result=m.describe(r,'synthetic-id');assert len(result['Changes'])==3;blocked(lambda:m.inspect_changes(result,resources))
`);
});

test('pagination rejects repeated tokens, changed identities/status and incomplete results without exposing tokens', () => {
  python(`calls=[]
def repeated(**args):calls.append(args);return {**changes(),'NextToken':'private-pagination-token'}
r=types.SimpleNamespace(meta={'stack':'synthetic-stack'},stack={'StackId':'synthetic-stack'},cf=types.SimpleNamespace(describe_change_set=repeated))
blocked(lambda:m.describe(r,'synthetic-id'));assert len(calls)==2
for field,value in [('ChangeSetId','other-id'),('StackId','other-stack'),('ExecutionStatus','EXECUTE_IN_PROGRESS'),('Status','DELETE_COMPLETE')]:
 def changed(**args):
  result=changes()
  if args.get('NextToken'):result[field]=value
  else:result['NextToken']='second-page'
  return result
 r.cf.describe_change_set=changed;blocked(lambda:m.describe(r,'synthetic-id'))
listed=types.SimpleNamespace(list_change_sets=lambda **kw:{'Summaries':[],'NextToken':'private-pagination-token'})
r.cf=listed;blocked(lambda:m.historical_sets(r,{},lambda:None))
`);
});

test('diagnostics allow only resource identities/actions/replacement and safe property/dependency fields', () => {
  python(`import io,contextlib
result=changes();result.update(Parameters=[{'ParameterValue':'PRIVATE_PARAMETER'}],NextToken='PRIVATE_TOKEN',StatusReason='PRIVATE_REASON',Description='PRIVATE_DESCRIPTION')
for entry in result['Changes']:
 change=entry['ResourceChange'];change.update(BeforeContext='PRIVATE_BEFORE_CONTEXT',AfterContext='PRIVATE_AFTER_CONTEXT')
 for detail in change['Details']:
  detail['Target'].update(BeforeValue='PRIVATE_BEFORE_VALUE',AfterValue='PRIVATE_AFTER_VALUE',Path='/PRIVATE_QUERY_TOKEN')
result['Changes'][0]['ResourceChange']['Details'][0]['CausingEntity']='PRIVATE_DIRECT_VALUE'
out=io.StringIO()
with contextlib.redirect_stdout(out):m.change_diagnostics(result)
assert 'PRIVATE_' not in out.getvalue();parsed=json.loads(out.getvalue());assert set(parsed)=={'ChangeSetId','Changes'}
for entry in parsed['Changes']:
 assert set(entry)=={'LogicalResourceId','PhysicalResourceId','Action','Replacement','Details'}
 for detail in entry['Details']:assert set(detail)=={'Target','Evaluation','ChangeSource','CausingEntity'} and set(detail['Target'])=={'Attribute','Name','RequiresRecreation'}
assert parsed['Changes'][1]['Details'][0]['CausingEntity']=='ApiFunction.Arn'
`);
});

test('live route checks reject authorization or integration drift while ignoring generated IDs', () => {
  python(`routes=[{'RouteKey':key,'RouteId':str(i),'Target':'integrations/id','AuthorizationType':'AWS_IAM' if key in m.PRIVATE_ROUTES else 'NONE'} for i,key in enumerate(sorted(m.ROUTES))]
integration={'IntegrationId':'id','IntegrationType':'AWS_PROXY','IntegrationMethod':'POST','PayloadFormatVersion':'2.0','IntegrationUri':'arn:aws:lambda:eu-north-1:123456789012:function:synthetic-stack-api'}
pager=types.SimpleNamespace(paginate=lambda **kw:[{'Items':[integration]}]);client=types.SimpleNamespace(get_paginator=lambda name:pager)
r=types.SimpleNamespace(meta={'region':'eu-north-1','account':'123456789012'},resources=resources,routes=lambda:routes,client=lambda _:client)
snapshot=m.route_configuration(r);routes[0]['RouteId']='changed';assert snapshot==m.route_configuration(r)
for key,value in [('IntegrationUri','foreign'),('CredentialsArn','broader-role'),('PayloadFormatVersion','1.0')]:
 saved=copy.deepcopy(integration);integration[key]=value;blocked(lambda:m.route_configuration(r));integration.clear();integration.update(saved)
registration=next(x for x in routes if x['RouteKey']=='POST /register');registration['AuthorizationType']='NONE';blocked(lambda:m.route_configuration(r))
`);
});

test('deployment validates before approval and execution, executes only the new ID, then reads back configuration', () => {
  python(`before,pending,code=templates();events={name:{'Type':'HttpApi','Properties':{'Method':method,'Path':path}} for name,method,path in [('subscribe','POST','/subscribe'),('registerPage','GET','/register'),('registerAction','POST','/register')]}
original={'Resources':{'ApiFunction':{'Properties':{'Events':events}},'HttpApi':{'Properties':{}}}};old_source=copy.deepcopy(original);old_source['Resources']['ApiFunction']['Properties']['CodeUri']=code
class CF:
 def __init__(self):self.executed=False;self.prepared=None;self.calls=[];self.tamper=False;self.extra=False;self.wait_failure=False;self.ordered=False
 def list_change_sets(self,**kw):
  self.calls.append(('list',kw));return {'Summaries':[{'ChangeSetName':'confirmation-post-fix-historical','ChangeSetId':'old-id','StackId':'synthetic-stack'}]}
 def get_template(self,**kw):
  self.calls.append(('get',kw));change=kw.get('ChangeSetName');stage=kw['TemplateStage']
  if change=='old-id':body=old_source if stage=='Original' else pending
  elif change=='new-id' or self.executed:
   body=copy.deepcopy(self.prepared) if stage=='Original' else self.processed()
  else:body=original if stage=='Original' else before
  if self.ordered:
   from collections import OrderedDict
   def reorder(x):
    if isinstance(x,dict):return OrderedDict((k,reorder(v)) for k,v in reversed(list(x.items())))
    if isinstance(x,list):return [reorder(v) for v in x]
    return x
   body=reorder(body)
  return {'TemplateBody':body}
 def processed(self):
  value=copy.deepcopy(pending);value['Resources']['HttpApi']['Properties']['Body']=m.private_body(before['Resources']['HttpApi']['Properties']['Body']);value['Resources']['ApiFunction']['Properties']['Code']={'S3Bucket':'bucket','S3Key':self.prepared['Resources']['ApiFunction']['Properties']['CodeUri']['Key'],'S3ObjectVersion':'new-version'}
  if self.tamper:value['Resources']['ApiRole']['Properties']['Policies']=['unreviewed']
  return value
 def describe_change_set(self,**kw):
  assert kw['IncludePropertyValues'] is True;self.calls.append(('describe',kw));value=changes(kw['ChangeSetName']=='new-id');value['ChangeSetId']=kw['ChangeSetName']
  if kw['ChangeSetName']=='old-id':value['Changes']=[{'ResourceChange':{'LogicalResourceId':'UnknownHistoricalResource','Action':'Remove'}}];return value
  if self.extra:value['Changes'].append({'ResourceChange':{'LogicalResourceId':'UnknownNewResource','Action':'Modify'}})
  if not kw.get('NextToken'):value.update(Changes=value['Changes'][:1],NextToken='next-new-page')
  else:assert kw['NextToken']=='next-new-page';value['Changes']=value['Changes'][1:]
  return value
 def create_change_set(self,**kw):
  assert all(p.get('UsePreviousValue') is True and 'ParameterValue' not in p for p in kw['Parameters']);self.calls.append(('create',kw));self.prepared=json.loads(kw['TemplateBody']);return {'Id':'new-id'}
 def get_waiter(self,name):
  def wait(**kw):
   self.calls.append(('wait',name))
   if self.wait_failure:raise RuntimeError('PRIVATE_WAITER_MESSAGE')
  return types.SimpleNamespace(wait=wait)
 def execute_change_set(self,**kw):assert kw['ChangeSetName']=='new-id';self.calls.append(('execute',kw));self.executed=True
with tempfile.TemporaryDirectory() as temp:
 directory=pathlib.Path(temp);(directory/'main-template.json').write_text(json.dumps(original));m.reconstruct=lambda *args:b'reviewed runtime';private_calls=[];route_calls=[]
 m.verify_private=lambda *args:private_calls.append(args[-1]);m.route_configuration=lambda r:route_calls.append('read') or {'same':'private configuration'}
 cf=CF();meta={'baseRuntimeSha256':'a'*64,'runtimeSha256':'b'*64,'patchId':'synthetic-patch'}
 lam=types.SimpleNamespace(get_function_configuration=lambda **kw:{'CodeSha256':base64.b64encode(bytes.fromhex(meta['runtimeSha256'] if cf.executed else meta['baseRuntimeSha256'])).decode()})
 s3=types.SimpleNamespace(get_bucket_versioning=lambda **kw:{'Status':'Enabled'},put_object=lambda **kw:{'VersionId':'new-version'})
 r=types.SimpleNamespace(meta={'stack':'synthetic-stack','bucket':'bucket'},resources=resources,stack={'StackId':'synthetic-stack','Parameters':[{'ParameterKey':'KeepPrevious'}]},cf=cf,client=lambda name:{'lambda':lam,'s3':s3}[name],paused=lambda:None)
 answers=[]
 def approve(prompt):
  answers.append(prompt)
  return 'PREPARE CONFIRMATION FIX' if len(answers)==1 else 'EXECUTE '+next(args['ChangeSetName'] for name,args in cf.calls if name=='create')
 state={};saved=[];m.deploy(r,directory,meta,state,lambda:saved.append(copy.deepcopy(state)),approve)
 assert cf.executed and state['deployed'] and state['historicalChangeSetIds']==['old-id'] and len(answers)==2
 assert [args['ChangeSetName'] for name,args in cf.calls if name=='execute']==['new-id']
 assert saved[-2]['executionStarted'] is True and not saved[-2].get('deployed') and private_calls==['a'*64,'a'*64,'b'*64] and len(route_calls)==3
 cf=CF();r.cf=cf;cf.ordered=True;answers.clear();state={};m.deploy(r,directory,meta,state,lambda:None,approve);assert cf.executed and state['deployed'] and len(answers)==2
 cf=CF();r.cf=cf;cf.tamper=True;answers.clear();state={};blocked(lambda:m.deploy(r,directory,meta,state,lambda:None,approve));assert not cf.executed and len(answers)==1 and not state.get('executionStarted')
 cf=CF();r.cf=cf;cf.extra=True;answers.clear();state={};blocked(lambda:m.deploy(r,directory,meta,state,lambda:None,approve));assert not cf.executed and len(answers)==1 and not state.get('executionStarted')
 import io,contextlib
 cf=CF();r.cf=cf;cf.wait_failure=True;answers.clear();state={};out=io.StringIO()
 with contextlib.redirect_stdout(out):
  try:m.deploy(r,directory,meta,state,lambda:None,approve)
  except RuntimeError as error:assert 'did not complete creation' in str(error);print('GATES_CLOSED_AFTER_DIAGNOSTICS')
 assert not cf.executed and len(answers)==1 and state['changeSetId']=='new-id' and not state.get('executionStarted')
 assert 'PRIVATE_WAITER_MESSAGE' not in out.getvalue() and out.getvalue().index('"LogicalResourceId": "ApiFunction"')<out.getvalue().index('GATES_CLOSED_AFTER_DIAGNOSTICS')
`);
});
