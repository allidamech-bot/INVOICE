import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const entry=readFileSync(new URL('../scripts/fiscal/run-aws-staging-worker.mjs',import.meta.url),'utf8');
const service=readFileSync(new URL('../deploy/fiscal/lourex-aws-staging.service',import.meta.url),'utf8');

test('persistent worker is pinned to reviewed profile and not arbitrary root-owned JS',()=>{
 assert.match(entry,/validateAwsFiscalWorkerConfig/);
 assert.match(entry,/requireAwsFiscalDispatchApproval/);
 assert.match(entry,/profileSha256/);
 assert.match(entry,/trusted-runtime-profile\.json/);
 assert.match(entry,/bindAwsTrustedRuntime/);
 assert.match(entry,/createStagingFiscalRuntime/);
 assert.doesNotMatch(entry,/runtime-adapter\.mjs|pathToFileURL/);
 assert.match(entry,/st\.nlink!==1/);
});
test('candidate systemd service cannot silently start or enter owner home',()=>{
 assert.match(service,/User=lourex-staging/);
 assert.match(service,/ProtectHome=true/);
 assert.match(service,/ProtectSystem=strict/);
 assert.match(service,/NoNewPrivileges=true/);
 assert.match(service,/LoadCredential=wrapping-key:/);
 assert.match(service,/LoadCredential=pin-derivation-key:/);
 assert.match(service,/ConditionPathExists=\/etc\/lourex-staging\/trusted-runtime-profile\.json/);
 assert.match(service,/WorkingDirectory=\/opt\/lourex-fiscal\/current/);
 assert.doesNotMatch(service,/\/home\/ubuntu/);
 assert.doesNotMatch(service,/LOUREX_AWS_DISPATCH_APPROVED=true/);
});
