import copy, hashlib, json, re
from collections import OrderedDict
from numbers import Number

stage = 'startup'
M = object()

def kind(v):
    for cls, name in [(dict,'object'), (list,'array'), (str,'string'), (bool,'boolean'), (Number,'number')]:
        if isinstance(v, cls): return name
    if v is None: return 'null'
    raise TypeError('Unsupported JSON node')

def get(label, template_stage, pending=False):
    global stage
    stage = 'get/' + label
    args = dict(StackName='chronoverse-newsletter-v2', TemplateStage=template_stage)
    if pending: args['ChangeSetName'] = 'confirmation-post-fix-ac0340cdb5f7-d815697a'
    v = cf.get_template(**args)['TemplateBody']
    return json.loads(v, object_pairs_hook=OrderedDict) if isinstance(v, str) else v

def walk(a, b, p=()):
    if kind(a) != kind(b): yield p
    elif isinstance(a, dict):
        for k in sorted(set(a) | set(b)):
            if k not in a or k not in b: yield p+(k,)
            else: yield from walk(a[k], b[k], p+(k,))
    elif isinstance(a, list):
        for i in range(max(len(a),len(b))):
            if i >= len(a) or i >= len(b): yield p+(i,)
            else: yield from walk(a[i],b[i],p+(i,))
    elif a != b: yield p

def at(v,p):
    for k in p:
        if isinstance(v,dict) and k in v: v=v[k]
        elif isinstance(v,list) and isinstance(k,int) and 0 <= k < len(v): v=v[k]
        else: return M
    return v

def shape(v):
    global stage
    stage = 'report/shape'
    if v is M: return {'Present':False}
    r = {'Present':True,'JsonType':kind(v)}
    if isinstance(v,dict): r['Container']='OrderedDict' if isinstance(v,OrderedDict) else 'dict'
    if isinstance(v,list): r['Length']=len(v)
    return r

def keys(v):
    if isinstance(v,dict): return set(v) | set().union(*(keys(x) for x in v.values()))
    if isinstance(v,list): return set().union(*(keys(x) for x in v))
    return set()

def location(p):
    resource = p[1] if len(p)>1 and p[0]=='Resources' and re.fullmatch(r'[A-Za-z][A-Za-z0-9]{0,254}',p[1]) else '$template'
    parts = p[2:] if resource != '$template' else p
    labels = [str(x) if isinstance(x,int) else x if x in allowed else '[redacted-key]' for x in parts]
    return {'ResourceId':resource,'Path':'/'+'/'.join(x.replace('~','~0').replace('/','~1') for x in labels)}

def same(a,b):
    global stage
    stage = 'compare/json-content'
    if a is M or b is M: return a is b
    return json.dumps(a,sort_keys=True) == json.dumps(b,sort_keys=True)

try:
    import boto3
    stage='client-initialization'
    cf=boto3.client('cloudformation',region_name='eu-north-1')
    original=get('stack-original','Original'); before=get('stack-processed','Processed')
    source=get('change-original','Original',True); actual=get('change-processed','Processed',True)
    stage='verify-source'
    assert hashlib.sha256(json.dumps(original,sort_keys=True,separators=(',',':')).encode()).hexdigest() == 'bcafd1815487f63de109a6b47fc2e665f6bbeaba786fde55dbde6ab9274725a9'
    stage='build-expected'
    expected=copy.deepcopy(before); code=source['Resources']['ApiFunction']['Properties']['CodeUri']
    expected['Resources']['ApiFunction']['Properties']['Code']={'S3Bucket':code['Bucket'],'S3Key':code['Key'],'S3ObjectVersion':code['Version']}
    body=expected['Resources']['HttpApi']['Properties']['Body']
    body['components']={'securitySchemes':{'AWS_IAM':{'type':'apiKey','name':'Authorization','in':'header','x-amazon-apigateway-authtype':'awsSigv4'}}}
    probes=[('Resources','HttpApi','Properties','Body','components')]
    for path,method in [('/register','get'),('/register','post'),('/subscribe','post')]:
        body['paths'][path][method]['security']=[{'AWS_IAM':[]}]
        probes.append(('Resources','HttpApi','Properties','Body','paths',path,method,'security',0))
    allowed=keys(original) | set('Code Tags PackageType Body components securitySchemes AWS_IAM type name in x-amazon-apigateway-authtype info title version openapi paths httpMethod uri payloadFormatVersion responses security tags x-amazon-apigateway-integration x-amazon-apigateway-tag-value get post S3Bucket S3Key S3ObjectVersion /register /subscribe /confirm /unsubscribe /api/newsletter/confirm /api/newsletter/unsubscribe'.split())
    stage='compare/structure'
    semantic=[location(p) for p in walk(expected,actual)]
    prefix=('Resources','ApiFunction','Properties')
    for key in sorted(set(at(expected,prefix)) | set(at(actual,prefix))):
        a=at(expected,prefix+(key,)); b=at(actual,prefix+(key,))
        if type(a) is not type(b) or not same(a,b): probes.insert(0,prefix+(key,))
    rows=[]
    for p in probes:
        row=location(p)
        for label,tree in [('StackBefore',before),('Expected',expected),('Pending',actual)]: row[label]=shape(at(tree,p))
        row['SameJson']=same(at(expected,p),at(actual,p)); rows.append(row)
    stage='serialize-result'
    output=json.dumps({'NativeComparisonEqual':expected==actual,'SemanticDifferences':semantic,'PresenceAndTypes':rows},indent=2)
except Exception as error:
    line=None; tb=error.__traceback__
    while tb:
        if tb.tb_frame.f_code.co_filename == __file__: line=tb.tb_lineno
        tb=tb.tb_next
    output=json.dumps({'Error':{'Class':type(error).__name__,'Stage':stage,'SourceLine':line}},indent=2)
print(output)
