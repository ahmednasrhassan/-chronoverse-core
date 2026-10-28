import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const setup = `import importlib.util,pathlib,json,copy,types,zipfile
root=pathlib.Path(${JSON.stringify(fileURLToPath(new URL('../../../', import.meta.url)))})
def load(name,path):
 spec=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
m=load('inspection',root/'services/newsletter/scripts/inspect-confirmation-template.py')
d=load('deployment',root/'services/newsletter/scripts/cloudshell-confirmation-fix.py')
prior=types.ModuleType('prior_deployment');prior.__file__='<previous-shipped-deployment>'
fixtures=root/'services/newsletter/test/fixtures/confirmation'
exec(compile((fixtures/'legacy-confirmation-launcher.py').read_bytes(),prior.__file__,'exec'),prior.__dict__)
original=json.loads((fixtures/'original-template.json').read_text())
before=json.loads((fixtures/'before-processed.json').read_text())
expected=json.loads((fixtures/'expected-processed.json').read_text())
assert len(before['Resources'])==len(expected['Resources'])==50
old=types.ModuleType('prior_path_only_diagnostic');old.__file__='<prior-read-only-command>'
exec(compile((fixtures/'legacy-template-diff.py').read_text(),old.__file__,'exec'),old.__dict__)
reported=[{'ResourceId':'ApiFunction','ChangedPath':'/Properties/[redacted-key-1]'}, {'ResourceId':'HttpApi','ChangedPath':'/Properties/Body/components'}, {'ResourceId':'HttpApi','ChangedPath':'/Properties/Body/paths/~1register/get/security/0'}, {'ResourceId':'HttpApi','ChangedPath':'/Properties/Body/paths/~1register/post/security/0'}, {'ResourceId':'HttpApi','ChangedPath':'/Properties/Body/paths/~1subscribe/post/security/0'}]
def without_iam(actual):
 body=actual['Resources']['HttpApi']['Properties']['Body'];body.pop('components')
 for path,method in [('/register','get'),('/register','post'),('/subscribe','post')]:body['paths'][path][method]['security']=[]
 return actual
def blocked(after):
 try:d.inspect_templates(before,after,{'Bucket':'bucket','Key':'key','Version':'version'})
 except RuntimeError as error:assert str(error)=='Processed template exceeds reviewed Code/Body changes; no execution permitted';return
 raise AssertionError('security comparison bypassed')
`;
function python(code) {
  const result = spawnSync(process.platform === 'win32' ? 'python' : 'python3', ['-B', '-c', setup + code], { encoding: 'utf8', windowsHide: true });
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

test('the exact five reported paths fit both directions of a Lambda Tags presence difference', () => {
  python(`actual=without_iam(copy.deepcopy(expected));actual['Resources']['ApiFunction']['Properties'].pop('Tags')
assert old.report(expected,actual,original)==reported
report=m.report(expected,actual,original,before);assert report[0]['ChangedPath']=='/Properties/Tags'
assert report[0]['StackBefore']['Present'] and report[0]['ReviewedExpected']['Present'] and not report[0]['PendingProcessed']['Present'];blocked(actual)
before2=copy.deepcopy(before);before2['Resources']['ApiFunction']['Properties'].pop('Tags')
expected2=copy.deepcopy(expected);expected2['Resources']['ApiFunction']['Properties'].pop('Tags')
actual2=without_iam(copy.deepcopy(expected));assert old.report(expected2,actual2,original)==reported
report2=m.report(expected2,actual2,original,before2)
assert not report2[0]['StackBefore']['Present'] and not report2[0]['ReviewedExpected']['Present'] and report2[0]['PendingProcessed']['ExactSamCreatedByTags']
`);
});

test('a different valid Lambda property produces the same masked path and is identified without values', () => {
  python(`actual=without_iam(copy.deepcopy(expected));actual['Resources']['ApiFunction']['Properties']['PackageType']='Zip'
assert old.report(expected,actual,original)==reported
report=m.report(expected,actual,original,before);assert report[0]['ChangedPath']=='/Properties/PackageType'
assert not report[0]['ReviewedExpected']['Present'] and report[0]['PendingProcessed']=={'Present':True,'JsonType':'string'}
assert 'Zip' not in json.dumps(report);blocked(actual)
`);
});

test('all four IAM differences report exact presence, types, list length and known-schema equality flags', () => {
  python(`actual=without_iam(copy.deepcopy(expected));report=m.report(expected,actual,original,before)
assert len(report)==4 and report[0]['ChangedPath']=='/Properties/Body/components'
assert not report[0]['StackBefore']['Present'] and report[0]['ReviewedExpected']['ExactReviewedIamComponents'] and not report[0]['PendingProcessed']['Present']
for entry in report[1:]:
 assert not entry['StackBefore']['Present'] and entry['ReviewedExpected']['ExactReviewedIamRequirement']
 assert not entry['PendingProcessed']['Present'] and entry['PendingProcessed']['SecurityArray']['Length']==0
 assert entry['ReviewedExpected']['SecurityArray']['Length']==1 and entry['ReviewedExpected']['SecurityArray']['ExactReviewedIamArray']
body=actual['Resources']['HttpApi']['Properties']['Body'];body['components']=None;body['paths']['/register']['get']['security']=[None]
report=m.report(expected,actual,original,before);assert report[0]['PendingProcessed']['JsonType']=='null'
entry=next(x for x in report if x['ChangedPath'].endswith('~1register/get/security/0'))
assert entry['PendingProcessed']['Present'] and entry['PendingProcessed']['JsonType']=='null' and not entry['PendingProcessed']['ExactReviewedIamRequirement']
blocked(actual)
`);
});

test('inspection uses the real complete structures and never prints sensitive values or unknown map keys', () => {
  python(`source=d.template_for_patch(original,'bucket','key','version');calls=[]
def get(**args):
 calls.append(args);pending='ChangeSetName' in args
 return {'TemplateBody':copy.deepcopy((source if pending else original) if args['TemplateStage']=='Original' else expected if pending else before)}
result=m.inspect(types.SimpleNamespace(get_template=get));assert result['SemanticDifferences']==[] and result['SemanticComparisonEqual'] and len(calls)==5
actual=copy.deepcopy(expected);actual['Resources']['ApiFunction']['Properties']['Environment']['Variables']['SECRETS_ARN']='PRIVATE_SECRET_VALUE'
actual['Resources']['HttpApi']['Properties']['Body']['PRIVATE_SECRET_KEY']='PRIVATE_BODY_VALUE'
text=json.dumps(m.report(expected,actual,original,before));assert 'PRIVATE_' not in text and 'SECRETS_ARN' in text
d.inspect_templates(before,expected,{'Bucket':'bucket','Key':'key','Version':'version'})
`);
});

test('native botocore OrderedDict decoding reproduces the five false paths and order-sensitive deployment stop', () => {
  python(`from collections import OrderedDict
def native(value):return json.loads(json.dumps(value),object_pairs_hook=OrderedDict)
b=native(before);a=native(expected);source=native(d.template_for_patch(original,'bucket','key','version'))
e=copy.deepcopy(b);e['Resources']['ApiFunction']['Properties']['Code']=copy.deepcopy(expected['Resources']['ApiFunction']['Properties']['Code'])
e['Resources']['HttpApi']['Properties']['Body']=d.private_body(b['Resources']['HttpApi']['Properties']['Body'])
assert old.report(e,a,original)==reported
assert m.shape(a['Resources']['HttpApi']['Properties']['Body']['components'],('Resources','HttpApi','Properties','Body','components'))['ExactReviewedIamComponents']
assert m.report(e,a,original,b)==[] and len(m.report(e,a,original,b,representation=True))>=5
try:prior.inspect_templates(b,a,{'Bucket':'bucket','Key':'key','Version':'version'})
except RuntimeError as error:assert 'Processed template exceeds reviewed Code/Body changes' in str(error)
else:raise AssertionError('expected exact original deployment failure')
d.inspect_templates(b,a,{'Bucket':'bucket','Key':'key','Version':'version'})
def get(**args):
 pending='ChangeSetName' in args
 return {'TemplateBody':native((source if pending else original) if args['TemplateStage']=='Original' else a if pending else b)}
result=m.inspect(types.SimpleNamespace(get_template=get));assert result['SemanticComparisonEqual'] and result['SemanticDifferences']==[] and result['NativeComparisonEqual'] is False
`);
});

test('canonical template validation accepts reordered OrderedDict objects across the complete real templates', () => {
  python(`from collections import OrderedDict
def reordered(value):
 if isinstance(value,dict):return OrderedDict((k,reordered(v)) for k,v in reversed(list(value.items())))
 if isinstance(value,list):return [reordered(v) for v in value]
 return value
b=reordered(before);a=reordered(expected)
d.inspect_templates(b,a,{'Bucket':'bucket','Key':'key','Version':'version'})
assert d.same_json(a,expected) and d.same_json(b,before)
assert not d.same_json(True,1) and not d.same_json(False,0) and not d.same_json('1',1)
assert not d.same_json([1,2],[2,1]) and not d.same_json({'a':1},{'a':1,'b':None})
try:d.canonical_json({'invalid':float('nan')})
except ValueError:pass
else:raise AssertionError('invalid JSON accepted')
`);
});

test('canonical validation rejects real property, IAM, route, integration, code, scalar and array changes', () => {
  python(`from collections import OrderedDict
def native(value):return json.loads(json.dumps(value),object_pairs_hook=OrderedDict)
mutations=[
 lambda x:x['Resources']['ApiFunction']['Properties'].update(UnreviewedProperty=True),
 lambda x:x['Resources']['ApiFunction']['Properties'].pop('Runtime'),
 lambda x:x['Resources']['ApiFunction']['Properties']['Environment']['Variables'].update(DELIVERY_ENABLED='true'),
 lambda x:x['Resources']['ApiFunction']['Properties'].update(Role='other-role'),
 lambda x:x['Resources']['ApiFunction']['Properties']['Code'].update(S3ObjectVersion='other-version'),
 lambda x:x['Resources']['ApiRole']['Properties']['Policies'][0]['PolicyDocument']['Statement'].reverse(),
 lambda x:x['Resources']['ApiRole']['Properties']['Policies'][0]['PolicyDocument']['Statement'][0].update(Action='*'),
 lambda x:x['Resources']['HttpApi']['Properties']['Body']['paths']['/register']['get'].update(security=[]),
 lambda x:x['Resources']['HttpApi']['Properties']['Body']['paths']['/register']['post'].pop('security'),
 lambda x:x['Resources']['HttpApi']['Properties']['Body']['paths']['/subscribe']['post'].update(security=[]),
 lambda x:x['Resources']['HttpApi']['Properties']['Body']['paths']['/confirm']['post'].update(security=[{'AWS_IAM':[]}]),
 lambda x:x['Resources']['HttpApi']['Properties']['Body']['paths']['/confirm']['post']['x-amazon-apigateway-integration'].update(payloadFormatVersion='1.0'),
 lambda x:x['Resources']['HttpApi']['Properties']['Body']['paths']['/confirm']['post']['x-amazon-apigateway-integration'].update(uri='other-function'),
 lambda x:x['Resources']['HttpApi']['Properties']['Body']['components']['securitySchemes']['AWS_IAM'].update(type='oauth2'),
 lambda x:x['Resources'].pop('Ledger'),
 lambda x:x['Resources']['Ledger'].update(DeletionPolicy='Delete')]
for mutate in mutations:
 a=native(expected);mutate(a);blocked(a)
`);
});

test('shape accepts JSON container subclasses and keeps booleans distinct from numbers', () => {
  python(`from collections import OrderedDict
class Object(dict):pass
class Array(list):pass
class String(str):pass
for value,wanted in [(OrderedDict(), 'object'),(Object(),'object'),(Array(),'array'),(String('secret'),'string'),(True,'boolean'),(1,'number'),(None,'null')]:assert m.shape(value,())['JsonType']==wanted
assert list(m.differences(True,1))==[()]
assert list(m.differences(OrderedDict([('a',1),('b',2)]),{'b':2,'a':1}))==[]
assert list(m.differences([1,2],[2,1]))==[(0,),(1,)]
`);
});

test('safe errors report class, stage and script line without exception messages or traceback text', () => {
  python(`try:m.shape(object(),())
except Exception as error:
 report=m.safe_error(error)
 assert report['Error']['Class']=='TypeError' and report['Error']['Stage']=='report/shape' and type(report['Error']['SourceLine']) is int
else:raise AssertionError('unknown JSON type silently accepted')
def get(**kw):raise KeyError('PRIVATE_SDK_MESSAGE_AND_VALUES')
try:m.inspect(types.SimpleNamespace(get_template=get))
except Exception as error:
 report=m.safe_error(error);assert report['Error']['Class']=='KeyError' and report['Error']['Stage']=='get/stack-Original' and type(report['Error']['SourceLine']) is int
 assert 'PRIVATE_' not in json.dumps(report) and set(report['Error'])=={'Class','Stage','SourceLine'}
`);
});

test('the exact copyable command handles native containers and exposes real security drift and safe error locations', () => {
  python(`import io,contextlib,sys
from collections import OrderedDict
text=(fixtures/'template-diagnostic.py').read_text();filename='<read-only-command>'
def native(value):return json.loads(json.dumps(value),object_pairs_hook=OrderedDict)
source=native(d.template_for_patch(original,'bucket','key','version'))
def run(actual,failure=None):
 calls=[]
 def get(**args):
  calls.append(args)
  if failure==len(calls):raise KeyError('PRIVATE_SDK_EXCEPTION_MESSAGE')
  pending='ChangeSetName' in args
  return {'TemplateBody':native((source if pending else original) if args['TemplateStage']=='Original' else actual if pending else before)}
 sys.modules['boto3']=types.SimpleNamespace(client=lambda *a,**kw:types.SimpleNamespace(get_template=get))
 out=io.StringIO()
 with contextlib.redirect_stdout(out):exec(compile(text,filename,'exec'),{'__name__':'__main__','__file__':filename})
 return json.loads(out.getvalue()),calls
result,calls=run(expected);assert len(calls)==4 and result['SemanticDifferences']==[] and result['NativeComparisonEqual'] is False
assert len(result['PresenceAndTypes'])==5 and result['PresenceAndTypes'][0]['Path']=='/Properties/Code'
for row in result['PresenceAndTypes']:
 assert row['SameJson'] and row['Expected']['Present'] and row['Pending']['Present']
 assert row['Expected']['Container']=='dict' and row['Pending']['Container']=='OrderedDict'
changed=copy.deepcopy(expected);changed['Resources']['HttpApi']['Properties']['Body']['paths']['/register']['post']['security']=[]
result,calls=run(changed);assert result['SemanticDifferences']==[{'ResourceId':'HttpApi','Path':'/Properties/Body/paths/~1register/post/security/0'}]
assert any(not r['SameJson'] for r in result['PresenceAndTypes'])
for index,label in [(1,'stack-original'),(2,'stack-processed'),(3,'change-original'),(4,'change-processed')]:
 result,calls=run(expected,index);assert result['Error']['Class']=='KeyError' and result['Error']['Stage']=='get/'+label
 line=result['Error']['SourceLine'];assert type(line) is int and 'get_template' in text.splitlines()[line-1]
 assert 'PRIVATE_' not in json.dumps(result) and set(result['Error'])=={'Class','Stage','SourceLine'}
`);
});
