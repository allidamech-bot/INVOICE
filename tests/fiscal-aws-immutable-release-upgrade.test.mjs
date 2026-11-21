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

test('systemd static enrollment is allowed but enabling either service is rejected',()=>{
  const marker='check_fiscal_unit_mode(){';
  const start=source.indexOf(marker),end=source.indexOf('\n}',start);
  assert(start>=0&&end>start,'unit-state guard must be present');
  const guard=source.slice(start,end+2);
  const harness=`fail(){ printf 'DENIED:%s\\n' "$1"; return 77; }
sudo(){ if [[ "$1" == systemctl && "$2" == is-enabled ]]; then printf '%s\\n' "$MOCK_STATE"; return "$MOCK_RC"; fi; return 127; }
${guard}
check_fiscal_unit_mode "$1"
`;
  function run(name,state,rc=0){
    return spawnSync('bash',['-c',harness,'fiscal-unit-test',name],{
      encoding:'utf8',timeout:10000,
      env:{...process.env,MOCK_STATE:state,MOCK_RC:String(rc)}
    });
  }
  assert.equal(run('lourex-aws-enrollment','static').status,0);
  assert.equal(run('lourex-aws-staging','disabled',1).status,0);
  for(const state of ['enabled','enabled-runtime','linked','static','masked','indirect','generated','not-found','']){
    if(state!=='static')assert.equal(run('lourex-aws-enrollment',state).status,77,'enrollment '+state);
    if(state!=='disabled')assert.equal(run('lourex-aws-staging',state).status,77,'dispatch '+state);
  }
  assert.equal(run('random-unit','static').status,77);
  assert(source.includes('check_fiscal_unit_mode "$name"'));
  assert.doesNotMatch(source,/systemctl is-enabled --quiet/);
});
