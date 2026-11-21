import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const script=fileURLToPath(new URL('../scripts/fiscal/install-aws-fiscal-units.sh',import.meta.url));
const source=readFileSync(script,'utf8');

test('fiscal installer is shell-valid and fetches only a pinned main head',()=>{
 const result=spawnSync('bash',['-n',script],{encoding:'utf8',timeout:10000});
 assert.equal(result.status,0,result.stderr);
 assert.match(source,/origin refs\/heads\/main/);
 assert.doesNotMatch(source,/origin refs\/heads\/feat\/fiscal-batch2-remaining-settlements/);
 assert.match(source,/rev-parse FETCH_HEAD/);
 assert.match(source,/BRANCH_CHANGED_ABORT/);
});
test('inactive release upgrade requires the exact old commit and preserves rollback bytes',()=>{
 assert.match(source,/--replace-inactive=/);
 assert.match(source,/EXPLICIT_REVIEWED_INACTIVE_UPGRADE_REQUIRED/);
 assert.match(source,/FISCAL_RELEASE_CHANGED_DURING_STAGING/);
 assert.match(source,/inactive-release-\$EXISTING/);
 assert.match(source,/mv -T -- "\$CURRENT" "\$ARCHIVE"/);
 assert.match(source,/mv -T -- "\$ARCHIVE" "\$CURRENT"/);
 assert.match(source,/FISCAL_RELEASE_PROMOTION_FAILED_PREVIOUS_RESTORED/);
 assert.match(source,/systemctl is-active/);
 assert.match(source,/systemctl is-enabled/);
});
test('installation remains code-only; no service activation, billing or ZATCA commands',()=>{
 assert.match(source,/ZATCA ENROLLMENT UNIT: INSTALLED, NOT STARTED/);
 assert.match(source,/ZATCA DISPATCH WORKER UNIT: INSTALLED, NOT STARTED/);
 assert.doesNotMatch(source,/systemctl\s+(?:start|enable)\b/);
 assert.doesNotMatch(source,/LOUREX_AWS_DISPATCH_APPROVED=true/);
});
