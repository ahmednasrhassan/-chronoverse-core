"""Read-only pending-template diff: safe paths, presence/type and fixed-schema equality flags."""
import copy, hashlib, json, re
from collections import OrderedDict
from numbers import Number

STAGE = 'startup'

STACK = 'chronoverse-newsletter-v2'
CHANGE = 'confirmation-post-fix-ac0340cdb5f7-d815697a'
SOURCE_SHA = 'bcafd1815487f63de109a6b47fc2e665f6bbeaba786fde55dbde6ab9274725a9'
GENERATED_KEYS = set('S3Bucket S3Key S3ObjectVersion Body components securitySchemes AWS_IAM type name in x-amazon-apigateway-authtype info title version openapi paths httpMethod uri payloadFormatVersion responses security tags x-amazon-apigateway-integration x-amazon-apigateway-tag-value get post /register /subscribe /confirm /unsubscribe /api/newsletter/confirm /api/newsletter/unsubscribe'.split())
LAMBDA_PROPERTIES = set('Code PackageType DeadLetterConfig Description FunctionName Handler MemorySize Role Runtime Timeout VpcConfig Environment Tags TracingConfig KmsKeyArn Layers ReservedConcurrentExecutions FileSystemConfigs CodeSigningConfigArn ImageConfig Architectures SnapStart EphemeralStorage RuntimeManagementConfig LoggingConfig RecursiveLoop CapacityProviderConfig FunctionScalingConfig PublishToLatestPublished TenancyConfig DurableConfig'.split())
IAM_SCHEME = {'type': 'apiKey', 'name': 'Authorization', 'in': 'header', 'x-amazon-apigateway-authtype': 'awsSigv4'}
MISSING = object()


def kind(value):
    if isinstance(value, dict): return 'object'
    if isinstance(value, list): return 'array'
    if isinstance(value, str): return 'string'
    if isinstance(value, bool): return 'boolean'
    if isinstance(value, Number): return 'number'
    if value is None: return 'null'
    raise TypeError('Unsupported JSON node type')


def safe_error(error):
    line = None; tb = error.__traceback__
    while tb:
        if tb.tb_frame.f_code.co_filename == __file__: line = tb.tb_lineno
        tb = tb.tb_next
    name = type(error).__name__
    return {'Error': {'Class': name if re.fullmatch(r'[A-Za-z][A-Za-z0-9_]{0,79}', name) else 'Exception', 'Stage': STAGE, 'SourceLine': line}}


def keys(value):
    if isinstance(value, dict):
        return set(value) | set().union(*(keys(v) for v in value.values()))
    if isinstance(value, list): return set().union(*(keys(v) for v in value))
    return set()


def differences(a, b, path=(), representation=False):
    global STAGE
    STAGE = 'report/differences'
    if kind(a) != kind(b):
        if not representation: yield path
    elif isinstance(a, dict):
        if representation and (type(a) is not type(b) or (isinstance(a, OrderedDict) and isinstance(b, OrderedDict) and set(a) == set(b) and list(a) != list(b))): yield path
        for key in sorted(set(a) | set(b)):
            if key not in a or key not in b:
                if not representation: yield path + (key,)
            else: yield from differences(a[key], b[key], path + (key,), representation)
    elif isinstance(a, list):
        for index in range(max(len(a), len(b))):
            if index >= len(a) or index >= len(b):
                if not representation: yield path + (index,)
            else: yield from differences(a[index], b[index], path + (index,), representation)
    elif a != b and not representation: yield path


def at(value, path):
    for part in path:
        if isinstance(value, dict) and part in value: value = value[part]
        elif isinstance(value, list) and isinstance(part, int) and 0 <= part < len(value): value = value[part]
        else: return MISSING
    return value


def shape(value, path):
    global STAGE
    STAGE = 'report/shape'
    if value is MISSING: return {'Present': False}
    result = {'Present': True, 'JsonType': kind(value)}
    if isinstance(value, dict): result['Container'] = 'OrderedDict' if isinstance(value, OrderedDict) else 'dict'
    if isinstance(value, list): result['Length'] = len(value)
    if path == ('Resources', 'ApiFunction', 'Properties', 'Tags'):
        result['ExactSamCreatedByTags'] = value == [{'Key': 'lambda:createdBy', 'Value': 'SAM'}]
    if path == ('Resources', 'HttpApi', 'Properties', 'Body', 'components'):
        result['ExactReviewedIamComponents'] = value == {'securitySchemes': {'AWS_IAM': IAM_SCHEME}}
        if isinstance(value, dict):
            schemes = value.get('securitySchemes', {})
            result['AwsIamSchemePresent'] = isinstance(schemes, dict) and 'AWS_IAM' in schemes
            result['UnreviewedComponentKeysPresent'] = bool(set(value) - {'securitySchemes'})
            result['UnreviewedSchemeKeysPresent'] = isinstance(schemes, dict) and bool(set(schemes) - {'AWS_IAM'})
    if len(path) >= 2 and path[-2:] == ('security', 0):
        result['ExactReviewedIamRequirement'] = value == {'AWS_IAM': []}
    return result


def report(expected, actual, original, before=None, representation=False):
    global STAGE
    STAGE = 'report/differences'
    # Only keys from the checksum-pinned public source/schema may enter paths.
    # Unknown map keys get opaque labels, so even secret-bearing keys are hidden.
    allowed = keys(original) | GENERATED_KEYS; unknown = {}; result = []
    for full_path in differences(expected, actual, representation=representation):
        path = full_path
        resource = '$template'
        if len(path) >= 2 and path[0] == 'Resources':
            resource = path[1] if re.fullmatch(r'[A-Za-z][A-Za-z0-9]{0,254}', path[1]) else '[redacted-resource]'
            path = path[2:]
        safe = []
        for part in path:
            if isinstance(part, int): label = str(part)
            elif part in allowed or (full_path[:3] == ('Resources', 'ApiFunction', 'Properties') and len(full_path) == 4 and part in LAMBDA_PROPERTIES): label = part
            else:
                if part not in unknown: unknown[part] = '[redacted-key-' + str(len(unknown) + 1) + ']'
                label = unknown[part]
            safe.append(label.replace('~', '~0').replace('/', '~1'))
        entry = {'ResourceId': resource, 'ChangedPath': '/' + '/'.join(safe)}
        for label, tree in [('StackBefore', before), ('ReviewedExpected', expected), ('PendingProcessed', actual)]:
            entry[label] = shape(at(tree, full_path), full_path)
            if len(full_path) >= 2 and full_path[-2:] == ('security', 0):
                parent = at(tree, full_path[:-1])
                entry[label]['SecurityArray'] = shape(parent, full_path[:-1])
                entry[label]['SecurityArray']['ExactReviewedIamArray'] = parent == [{'AWS_IAM': []}]
        result.append(entry)
    return result


def inspect(cf):
    global STAGE
    def get(stage, pending=False):
        global STAGE
        STAGE = 'get/' + ('change-' if pending else 'stack-') + stage
        args = {'StackName': STACK, 'TemplateStage': stage}
        if pending: args['ChangeSetName'] = CHANGE
        value = cf.get_template(**args)['TemplateBody']
        return json.loads(value) if isinstance(value, str) else value
    original = get('Original')
    STAGE = 'source-checksum'
    canonical = json.dumps(original, sort_keys=True, separators=(',', ':')).encode()
    if hashlib.sha256(canonical).hexdigest() != SOURCE_SHA:
        return [{'ResourceId': '$template', 'ChangedPath': '/OriginalSourceNotPinned'}]
    before = get('Processed'); source = get('Original', True); actual = get('Processed', True)
    if any(differences(get('Processed'), before)):
        return [{'ResourceId': '$template', 'ChangedPath': '/StackChangedDuringRead'}]
    # This is exactly inspect_templates()'s expected structure in the shipped ZIP.
    STAGE = 'build-expected'
    code = source['Resources']['ApiFunction']['Properties']['CodeUri']
    assert set(code) == {'Bucket', 'Key', 'Version'}
    expected = copy.deepcopy(before)
    expected['Resources']['ApiFunction']['Properties']['Code'] = {'S3Bucket': code['Bucket'], 'S3Key': code['Key'], 'S3ObjectVersion': code['Version']}
    body = expected['Resources']['HttpApi']['Properties']['Body']
    body['components'] = {'securitySchemes': {'AWS_IAM': IAM_SCHEME}}
    for path, method in [('/register', 'get'), ('/register', 'post'), ('/subscribe', 'post')]:
        body['paths'][path][method]['security'] = [{'AWS_IAM': []}]
    semantic = report(expected, actual, original, before)
    representation = report(expected, actual, original, before, representation=True)
    STAGE = 'comparison-result'
    return {'NativeComparisonEqual': expected == actual, 'SemanticComparisonEqual': not semantic,
        'SemanticDifferences': semantic, 'RepresentationDifferences': representation}


if __name__ == '__main__':
    try:
        STAGE = 'client-initialization'
        import boto3
        result = inspect(boto3.client('cloudformation', region_name='eu-north-1'))
        STAGE = 'serialize-result'
        output = json.dumps(result, indent=2)
    except Exception as error:
        output = json.dumps(safe_error(error), indent=2)
    print(output)
