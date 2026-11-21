import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';

const probePath=new URL('../scripts/fiscal/probe-aws-qa-data-plane.mjs',import.meta.url);
const scriptPath=new URL('../scripts/fiscal/run-isolated-aws-qa-check.sh',import.meta.url);
const probe=readFileSync(probePath);
const runner=readFileSync(scriptPath,'utf8');
// Git object header is 'blob <byteCount>\\0': NO space before the NUL.\nconst blobHash=createHash('sha1').update(Buffer.concat([Buffer.from('blob '+probe.length),Buffer.from([0]),probe])).digest('hex');

test('isolated EC2 runner pins the exact verified probe',()=>{
 assert(runner.includes("REF='37660c9d1fde80a6f21e74a6325301d674c520d7'"));
 assert(runner.includes("BLOB='"+blobHash+"'"));
 assert.match(runner,/git hash-object/);
 assert.match(runner,/sudo cp -a --/);
 assert.match(runner,/sudo -u lourex-staging/);
 assert.match(runner,/sudo chown -R root:lourex-staging/);
 assert.match(runner,/sudo chmod 0750/);
 assert.doesNotMatch(runner,/chmod[^\n]*\/home\/ubuntu|chown[^\n]*\/home\/ubuntu/);
 assert.doesNotMatch(runner,/\bgcloud\b|\bsystemctl\b|\bapt install\b|\bnpm install\b|\baws ec2\b|\baws iam\b/);
});
test('isolated EC2 runner passes bash syntax check',()=>{
 execFileSync('bash',['-n',scriptPath.pathname]);
});
