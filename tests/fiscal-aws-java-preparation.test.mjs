import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const script='scripts/fiscal/prepare-aws-fiscal-java.sh';
const source=readFileSync(script,'utf8');
test('Java helper staging script is valid Bash and never starts or enables units',()=>{
 const r=spawnSync('bash',['-n',script],{encoding:'utf8'});
 assert.equal(r.status,0,r.stderr);
 assert.match(source,/COMMIT_MISMATCH/);
 assert.match(source,/SERVICE_ACTIVE/);
 assert.doesNotMatch(source,/systemctl (?:start|enable|restart)/);
 assert.doesNotMatch(source,/(?:curl|wget|npm|git clone|apt-get)/);
});
test('only reviewed fiscal Java classes compile atomically and restricted identity smoke tests',()=>{
 for(const n of ['CanonicalInvoice','ClearanceContent','StampInspector']){
  assert.match(source,new RegExp(n+'\\.java'));
  assert.match(source,new RegExp(n+'\\.class'));
 }
 assert.match(source,/sha256sum CanonicalInvoice.java ClearanceContent.java StampInspector.java/);
 assert.match(source,/javac -encoding UTF-8 -d/);
 assert.match(source,/runuser -u lourex-staging/);
 assert.match(source,/mv -T/);
 assert.match(source,/JAVA_CLASS_PATH=/);
});
