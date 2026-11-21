import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';

const probe=readFileSync(new URL('../scripts/fiscal/probe-aws-qa-data-plane.mjs',import.meta.url));
const wrapper=readFileSync(new URL('../scripts/fiscal/diagnose-aws-qa-on-ec2.sh',import.meta.url),'utf8');
const sha=createHash('sha1').update(Buffer.concat([Buffer.from('blob '+probe.length+' '),Buffer.from([0]),probe])).digest('hex');

test('EC2 diagnostics pull the exact reviewed probe, not an obsolete revision',()=>{
 assert.match(wrapper,/readonly REF='73feef228578c5cdd062bd730592c73973914815'/);
 assert(wrapper.includes("readonly BLOB='"+sha+"'"));
 assert.match(wrapper,/git hash-object/);
 assert.match(wrapper,/sudo -u lourex-staging/);
 assert.doesNotMatch(wrapper,/(?:gcloud|systemctl|apt install|npm install|aws ec2|aws iam)/);
});

test('diagnostic shell has valid syntax',()=>{
 execFileSync('bash',['-n',new URL('../scripts/fiscal/diagnose-aws-qa-on-ec2.sh',import.meta.url).pathname]);
});
