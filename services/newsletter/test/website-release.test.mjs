import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const setup = `import importlib.util, pathlib, types, tempfile, json
p=pathlib.Path(${JSON.stringify(fileURLToPath(new URL("../scripts/publish-verified-website.py", import.meta.url)))})
s=importlib.util.spec_from_file_location('website',p);w=importlib.util.module_from_spec(s);s.loader.exec_module(w)
`;
function python(code) {
  const result = spawnSync(process.platform === "win32" ? "python" : "python3", ["-B", "-c", setup + code], { encoding: "utf8", windowsHide: true });
  assert.equal(result.status, 0, result.stderr || result.stdout);
}
test("website publishing refuses to edit, clone or push before all controlled production tests pass", () => {
  python(`w.command=lambda *args:(_ for _ in ()).throw(AssertionError('Git accessed before tests'))
for state in [{},{'testPassed':True},{'testPassed':True,'unsubscribeObserved':True}]:
 r=types.SimpleNamespace(state=state)
 try:w.publish(r,pathlib.Path('unused'))
 except RuntimeError:pass
 else:raise AssertionError('website published without actual controlled tests')
`);
});
test("website push resumes a prepared candidate without resending mail or force-pushing, and verifies the production marker", () => {
  python(`with tempfile.TemporaryDirectory() as temp:
 here=pathlib.Path(temp);checkout=here/'website-checkout';(checkout/'.git').mkdir(parents=True)
 state={'testPassed':True,'unsubscribeObserved':True,'feedbackMessageId':'synthetic','deployedPhase':'public','websiteCandidateSha':'b'*40};calls=[];remote=['a'*40]
 meta={'releaseId':'synthetic','sourceHead':'a'*40,'runtimeSha256':'c'*64,'origin':'https://synthetic.execute-api.eu-north-1.amazonaws.com'}
 r=types.SimpleNamespace(state=state,meta=meta,http=lambda *args:200,isolation=lambda:None,control=lambda:{'forwardOnlyReceipt':'d'*64},save=lambda:None)
 def git(args,directory):
  calls.append(args)
  if args[:4]==['git','remote','get-url','origin']:return w.REMOTE
  if args[:3]==['git','rev-parse','HEAD']:return 'b'*40
  if args[:3]==['git','status','--porcelain']:return ''
  if args[:3]==['git','ls-remote','origin']:return remote[0]+' refs/heads/master'
  if args[:2]==['git','push']:remote[0]='b'*40;return ''
  raise AssertionError('unexpected Git action')
 w.command=git
 class Response:
  def __init__(self,body):self.body=body
  def __enter__(self):return self
  def __exit__(self,*args):pass
  def read(self,*args):return self.body
 marker={'releaseId':'synthetic','sourceCommit':'a'*40,'runtimeSha256':'c'*64,'audienceReceiptSha256':'d'*64,'controlledTestPassed':True}
 w.urllib.request.urlopen=lambda url,**kw:Response(json.dumps(marker).encode() if 'newsletter-release.json' in url else b'<a href="https://synthetic.execute-api.eu-north-1.amazonaws.com/register">Subscribe</a>')
 assert w.publish(r,here)=='b'*40 and state['websiteProductionVerified'] is True
 assert [c for c in calls if c[:2]==['git','push']]==[['git','push','origin','HEAD:master']]
 calls.clear();w.publish(r,here);assert not any(c[:2]==['git','push'] for c in calls)
`);
});
