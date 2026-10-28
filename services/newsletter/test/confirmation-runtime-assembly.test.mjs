import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const setup = `import importlib.util,pathlib,types,tempfile,json,copy,io,zipfile
from unittest.mock import patch
def load(name,path):
 spec=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
m=load('deploy',pathlib.Path(${JSON.stringify(fileURLToPath(new URL("../scripts/cloudshell-confirmation-fix.py", import.meta.url)))}))
p=load('package_fix',pathlib.Path(${JSON.stringify(fileURLToPath(new URL("../scripts/package-confirmation-fix.py", import.meta.url)))}))
def blocked(fn,expected=None):
 try:fn()
 except RuntimeError as error:
  if expected:assert expected in str(error)
  return
 raise AssertionError('integrity failure accepted')
def archive(files):
 out=io.BytesIO()
 with zipfile.ZipFile(out,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as z:
  for name,data in sorted(files.items()):
   info=zipfile.ZipInfo(name,(2026,10,27,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;info.external_attr=0o100644<<16;z.writestr(info,data,compresslevel=9)
 return out.getvalue()
def fixture(temp):
 root=pathlib.Path(temp);original=root/'original';original.mkdir();release=root/'patch';release.mkdir();m.HERE=release
 files={name:('original:'+name).encode() for name in m.MODULES};files['node_modules/fixture/index.js']=b'unchanged dependency'*80;files['package.json']=b'{"private":true}'
 replacements={name:('already-reviewed confirmation fix:'+name).encode() for name in m.MODULES}
 base=archive(files);reviewed=archive({**files,**replacements});(original/'newsletter-runtime.zip').write_bytes(base)
 for name,data in replacements.items():
  path=release/name;path.parent.mkdir(exist_ok=True);path.write_bytes(data)
 delta,assembly=p.runtime_delta(base,reviewed);(release/'runtime.delta').write_bytes(delta)
 meta={'baseRuntimeSha256':m.sha(base),'runtimeSha256':m.sha(reviewed),'runtimeAssembly':assembly,'patches':{name:{'before':m.sha(files[name]),'after':m.sha(replacements[name])} for name in m.MODULES}}
 return original,release,meta,base,reviewed,files,replacements
`;
function python(code) {
  const result = spawnSync(process.platform === "win32" ? "python" : "python3", ["-B", "-c", setup + code], { encoding: "utf8", windowsHide: true });
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

test("CloudShell reconstruction returns exact reviewed ZIP bytes without invoking any ZIP writer or compressor", () => {
  python(`with tempfile.TemporaryDirectory() as temp:
 original,release,meta,base,reviewed,files,replacements=fixture(temp)
 delta2,plan2=p.runtime_delta(base,reviewed);assert plan2==meta['runtimeAssembly'] and delta2==(release/'runtime.delta').read_bytes()
 assert any(part['source']=='base' for part in plan2['parts']) and any(part['source']=='delta' for part in plan2['parts'])
 with patch.object(zipfile,'_get_compressor',side_effect=AssertionError('host-dependent compression invoked')),patch.object(zipfile.ZipFile,'writestr',side_effect=AssertionError('ZIP serialization invoked')):
  assert m.reconstruct(original,meta)==reviewed
`);
});

test("byte-copy reconstruction retains full runtime, base, delta, source and range integrity checks", () => {
  python(`with tempfile.TemporaryDirectory() as temp:
 original,release,meta,base,reviewed,files,replacements=fixture(temp)
 bad=copy.deepcopy(meta);bad['runtimeSha256']='0'*64
 blocked(lambda:m.reconstruct(original,bad),'Reconstructed runtime differs from reviewed patch')
 delta=(release/'runtime.delta').read_bytes();(release/'runtime.delta').write_bytes(bytes([delta[0]^1])+delta[1:]);blocked(lambda:m.reconstruct(original,meta),'delta checksum');(release/'runtime.delta').write_bytes(delta)
 for mutation in [lambda x:x['parts'][0].update(offset=-1),lambda x:x['parts'][0].update(length=10**9),lambda x:x['parts'][0].update(offset=True),lambda x:x['parts'][0].update(source='file'),lambda x:x.update(runtimeBytes=x['runtimeBytes']+1),lambda x:x.update(format='recompress')]:
  bad=copy.deepcopy(meta);mutation(bad['runtimeAssembly']);blocked(lambda:m.reconstruct(original,bad))
 source=release/'src/http.mjs';saved=source.read_bytes();source.write_bytes(saved+b' unexpected');blocked(lambda:m.reconstruct(original,meta),'module checksum');source.write_bytes(saved)
 (original/'newsletter-runtime.zip').write_bytes(base+b' corruption');blocked(lambda:m.reconstruct(original,meta),'Original runtime differs')
`);
});

test("even a matching archive SHA cannot authorize changed dependency content or missing confirmation modules", () => {
  python(`with tempfile.TemporaryDirectory() as temp:
 original,release,meta,base,reviewed,files,replacements=fixture(temp)
 unauthorized=archive({**files,**replacements,'node_modules/fixture/index.js':b'unauthorized dependency change'})
 delta,assembly=p.runtime_delta(base,unauthorized);(release/'runtime.delta').write_bytes(delta)
 bad=copy.deepcopy(meta);bad['runtimeAssembly']=assembly;bad['runtimeSha256']=m.sha(unauthorized)
 blocked(lambda:m.reconstruct(original,bad),'patch scope')
 bad=copy.deepcopy(meta);del bad['patches']['src/http.mjs'];blocked(lambda:m.reconstruct(original,bad),'Patch scope')
`);
});
