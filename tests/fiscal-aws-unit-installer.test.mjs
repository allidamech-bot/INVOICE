import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const install=new URL('../scripts/fiscal/install-aws-fiscal-units.sh',import.meta.url);
const code=readFileSync(install,'utf8');
const e=readFileSync(new URL('../deploy/fiscal/lourex-aws-enrollment.service',import.meta.url),'utf8');
const w=readFileSync(new URL('../deploy/fiscal/lourex-aws-staging.service',import.meta.url),'utf8');
const audit=readFileSync(new URL('../scripts/fiscal/audit-aws-worker-local.mjs',import.meta.url),'utf8');

test('installer is syntax valid and pinned to the existing instance + fiscal branch',()=>{
 execFileSync('bash',['-n',install.pathname]);
 assert.match(code,/i-05530aee6c25c984e/);
 assert.match(code,/refs\/heads\/feat\/fiscal-batch2-remaining-settlements/);
 assert.match(code,/rev-parse FETCH_HEAD/);
 assert.match(code,/BRANCH_CHANGED_ABORT/);
 assert.match(code,/git sparse-checkout set api\/_fiscal api\/_accounting scripts\/fiscal deploy\/fiscal src\/lib/);
 assert.match(code,/--depth 1 --filter=blob:none/);
 assert.match(code,/RUN_AS_UBUNTU_ON_EXISTING_EC2/);
 assert.match(code,/EXISTING_FISCAL_RELEASE_DIFFERS/);
});
test('root release is independent of website Node, does not enable or start services',()=>{
 for(const unit of [e,w]){
  assert.match(unit,/ExecStart=\/opt\/lourex-fiscal\/bin\/node /);
  assert.match(unit,/ProtectHome=true/);
  assert.match(unit,/User=lourex-staging/);
 }
 assert.match(audit,/execFileSync\('\/opt\/lourex-fiscal\/bin\/node'/);
 assert.match(code,/FISCAL_STATE_MACHINE_COMPILE_FAILED/);
 for(const name of ['fiscal-issuer','fiscal-routing','fiscal-tax','money','fiscal-issuance'])
  assert(code.includes('"$GIT_REPO/src/lib/'+name+'.ts"'));
 assert.match(code,/FISCAL_FINANCIAL_MODULE_MISSING/);
 for(const name of ['defaults','backup','period-close','operations','invoice-stock','governance','commercial-controls','document-lifecycle','payments','sales-returns','inventory-evidence','fiscal-advance-commercial','inventory-cost-cutover-audit','inventory-valuation-evidence','finance-source-bound-stock-gl-preview'])
  assert(code.includes('"$GIT_REPO/src/lib/'+name+'.ts"'));
 assert.match(code,/cd "\$LOUREX_FISCAL_STAGE"/);
 assert.match(code,/INSTALLED_RUNTIME_IMPORT_FAILED/);
 assert.match(code,/FISCAL_RUNTIME_IMPORT_FAILED/);
 assert.match(code,/sudo systemctl daemon-reload/);
 assert.doesNotMatch(code,/sudo systemctl (?:start|enable|restart|try-restart|preset|reenable|unmask|stop)\b/);
 assert.doesNotMatch(code,/\/home\/ubuntu\/INVOICE|invoice-three-puce|vercel deploy/);
 assert.doesNotMatch(code,/LOUREX_AWS_DISPATCH_APPROVED=true|LOUREX_AWS_ENROLLMENT_APPROVED=true/);
 assert.match(code,/AWS QA CONFIG\/CSID\/TRUST: NOT ALTERED/);
 assert.match(code,/PRODUCTION\/SITE: NOT ALTERED/);
});
