"""Read-only exact pending-template diff. Prints IDs/paths only; never values."""
import copy, hashlib, json, re

STACK = 'chronoverse-newsletter-v2'
CHANGE = 'confirmation-post-fix-ac0340cdb5f7-d815697a'
SOURCE_SHA = 'bcafd1815487f63de109a6b47fc2e665f6bbeaba786fde55dbde6ab9274725a9'
GENERATED_KEYS = set('S3Bucket S3Key S3ObjectVersion Body components securitySchemes AWS_IAM type name in x-amazon-apigateway-authtype info title version openapi paths httpMethod uri payloadFormatVersion responses security tags x-amazon-apigateway-integration x-amazon-apigateway-tag-value get post /register /subscribe /confirm /unsubscribe /api/newsletter/confirm /api/newsletter/unsubscribe'.split())


def keys(value):
    if isinstance(value, dict):
        return set(value) | set().union(*(keys(v) for v in value.values()))
    if isinstance(value, list): return set().union(*(keys(v) for v in value))
    return set()


def differences(a, b, path=()):
    if type(a) is not type(b): yield path
    elif isinstance(a, dict):
        for key in sorted(set(a) | set(b)):
            if key not in a or key not in b: yield path + (key,)
            else: yield from differences(a[key], b[key], path + (key,))
    elif isinstance(a, list):
        for index in range(max(len(a), len(b))):
            if index >= len(a) or index >= len(b): yield path + (index,)
            else: yield from differences(a[index], b[index], path + (index,))
    elif a != b: yield path


def report(expected, actual, original):
    # Only keys from the checksum-pinned public source/schema may enter paths.
    # Unknown map keys get opaque labels, so even secret-bearing keys are hidden.
    allowed = keys(original) | GENERATED_KEYS; unknown = {}; result = []
    for path in differences(expected, actual):
        resource = '$template'
        if len(path) >= 2 and path[0] == 'Resources':
            resource = path[1] if re.fullmatch(r'[A-Za-z][A-Za-z0-9]{0,254}', path[1]) else '[redacted-resource]'
            path = path[2:]
        safe = []
        for part in path:
            if isinstance(part, int): label = str(part)
            elif part in allowed: label = part
            else:
                if part not in unknown: unknown[part] = '[redacted-key-' + str(len(unknown) + 1) + ']'
                label = unknown[part]
            safe.append(label.replace('~', '~0').replace('/', '~1'))
        result.append({'ResourceId': resource, 'ChangedPath': '/' + '/'.join(safe)})
    return result


def inspect(cf):
    def get(stage, pending=False):
        args = {'StackName': STACK, 'TemplateStage': stage}
        if pending: args['ChangeSetName'] = CHANGE
        value = cf.get_template(**args)['TemplateBody']
        return json.loads(value) if isinstance(value, str) else value
    original = get('Original')
    canonical = json.dumps(original, sort_keys=True, separators=(',', ':')).encode()
    if hashlib.sha256(canonical).hexdigest() != SOURCE_SHA:
        return [{'ResourceId': '$template', 'ChangedPath': '/OriginalSourceNotPinned'}]
    before = get('Processed'); source = get('Original', True); actual = get('Processed', True)
    if get('Processed') != before:
        return [{'ResourceId': '$template', 'ChangedPath': '/StackChangedDuringRead'}]
    # This is exactly inspect_templates()'s expected structure in the shipped ZIP.
    code = source['Resources']['ApiFunction']['Properties']['CodeUri']
    assert set(code) == {'Bucket', 'Key', 'Version'}
    expected = copy.deepcopy(before)
    expected['Resources']['ApiFunction']['Properties']['Code'] = {'S3Bucket': code['Bucket'], 'S3Key': code['Key'], 'S3ObjectVersion': code['Version']}
    body = expected['Resources']['HttpApi']['Properties']['Body']
    body['components'] = {'securitySchemes': {'AWS_IAM': {'type': 'apiKey', 'name': 'Authorization', 'in': 'header', 'x-amazon-apigateway-authtype': 'awsSigv4'}}}
    for path, method in [('/register', 'get'), ('/register', 'post'), ('/subscribe', 'post')]:
        body['paths'][path][method]['security'] = [{'AWS_IAM': []}]
    return report(expected, actual, original)


if __name__ == '__main__':
    try:
        import boto3
        result = inspect(boto3.client('cloudformation', region_name='eu-north-1'))
    except Exception:
        result = [{'ResourceId': '$inspection', 'ChangedPath': '/ReadOnlyInspectionUnavailable'}]
    print(json.dumps(result, indent=2))
