import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {diagnosticsOwnerUidAllowed} from '../api/_ai/admin-diagnostics-auth.js';
const src=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('owner-only diagnostics fail closed for every other Firebase UID',()=>{
 const uid='synthetic-owner-uid-0123456789';
 assert.equal(diagnosticsOwnerUidAllowed(uid,uid),true);
 assert.equal(diagnosticsOwnerUidAllowed('synthetic-other-uid-0123456789',uid),false);
 assert.equal(diagnosticsOwnerUidAllowed(uid,''),false);
 assert.equal(diagnosticsOwnerUidAllowed(uid,undefined),false);
 assert.equal(diagnosticsOwnerUidAllowed('owner','owner'),false);
 const gate=src('api/_ai/admin-diagnostics-auth.js'),endpoint=src('api/ai-core.js');
 assert.match(gate,/requireAiFirebaseAuth\(request,response\)/);
 assert.match(gate,/request\.aiVerifiedUid/);
 assert.match(gate,/process\.env\.LOUREX_AI_DIAGNOSTICS_ADMIN_UID/);
 assert.match(endpoint,/diagnosticsOwnerUidAllowed\(request\.aiVerifiedUid,process\.env\.LOUREX_AI_DIAGNOSTICS_ADMIN_UID\)/);
 assert.match(endpoint,/if\(!sameOriginRequest\(request\)\)/);
});
test('full diagnostics are gated even for direct URLs and generic recovery cannot copy logs',()=>{
 const h=src('public/health.html'),js=src('public/health.js'),ui=src('public/settings-diagnostics-entry-v344.js');
 assert.match(h,/<main hidden>/);
 assert.match(js,/if\(!await ownerPermission\(\)\)/);
 assert.match(js,/if\(main\)main.hidden=false/);
 assert.match(ui,/if\(!ownerDiagnosticsAllowed\)/);
 assert.match(ui,/api\/ai-core/);
 assert.doesNotMatch(src('src/app/AuthScreenSelector.tsx'),/health\.html/);
 assert.doesNotMatch(src('src/app/AppErrorBoundary.tsx'),/health\.html|unified\?\.exportText\(\)/);
});
