import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('Firebase UID is cryptographically verified before every public AI provider route',()=>{
 const files=readDirectory(new URL('../api/',import.meta.url)).filter(x=>x.endsWith('.js'));
 for(const file of files){
   const body=source('api/'+file);
   if(!body.includes('routeAiStructured('))continue;
   assert.match(body,/requireAiFirebaseAuth\(request,response\)/,file+' must reject unsigned users');
   assert.match(body,/sameOriginRequest\(request\)/,file+' must retain origin checks');
   const handler=body.slice(body.indexOf('export default async function handler('));
   assert.match(handler,/if\(!await requireAiFirebaseAuth\(request,response\)\)return;/,file+' must authenticate before routing provider input');
   const firstAuth=handler.indexOf('requireAiFirebaseAuth(request,response)');
   const firstDispatch=handler.indexOf('handleToolPlan(body,response)');
   if(firstDispatch>=0)assert.ok(firstAuth<firstDispatch,file+' must authenticate before tool-plan dispatch');
 }
});
import {readdirSync as readDirectory} from 'node:fs';
test('No provider model may plan protected financial side effects',()=>{
 const api=source('api/ai-inbox.js');
 const before=api.split('const TOOL_GUIDE=')[0];
 for(const name of ['document.finalize','payment.record','inventory.adjust','financial.delete','accounting.post']){
  assert.equal(before.includes("'"+name+"'"),false,name+' must not be present in server-side allowed tool IDs');
 }
 assert.match(api,/HIGH IMPACT tools are NOT available via the provider planner/);
});
test('The opt-in provider smoke does not run with missing QA credentials or contact external services',()=>{
 const entry=new URL('../scripts/qa-ai-provider-sandbox.mjs',import.meta.url);
 const env={...process.env,LOUREX_AI_QA_CONFIRM:'isolated-qa-no-customer-data',
   LOUREX_AI_QA_GROQ_API_KEY:'',GROQ_API_KEY:'prohibited-production-placeholder',
   GEMINI_API_KEY:'prohibited-production-placeholder'};
 const result=spawnSync(process.execPath,[entry.pathname],{encoding:'utf8',env,timeout:7000});
 assert.equal(result.status,2);
 assert.match(result.stderr,/SANDBOX_NOT_CONFIGURED/);
 assert.doesNotMatch(result.stdout+result.stderr,/prohibited-production-placeholder/);
});
test('Provider smoke is manual-only; branch workflows stay fully secrets-free',()=>{
 const workflow=source('.github/workflows/lourex-ai-batches1-7-free-qa.yml');
 const testProgram=source('scripts/qa-ai-provider-sandbox.mjs');
 assert.doesNotMatch(workflow,/secrets\./,'No GitHub QA workflow may load any API key, including an isolated QA key');
 assert.doesNotMatch(workflow,/node scripts\/qa-ai-provider-sandbox\.mjs/,'Provider calls must not run automatically in CI');
 assert.match(testProgram,/delete process\.env\[name\]/);
 assert.match(testProgram,/LOUREX_SANDBOX_OK/);
 assert.doesNotMatch(testProgram,/(?:https?:\/\/invoice-three|fetch\(\s*['"]https?:\/\/)/);
});

test('Workspace settings distinguish local operator selection from authenticated team membership',()=>{
 const settings=source('src/components/AccessGovernanceSettings.tsx');
 assert.match(settings,/roles control approval workflows inside this account/);
 assert.match(settings,/does NOT create a Firebase login or grant separate cloud access/);
 assert.match(settings,/لا تشارك كلمة مرور الحساب/);
});
test('Server planner trusts signed token identity and ignores client-selected role',()=>{
 const auth=source('api/_ai/firebase-auth.js');
 const api=source('api/ai-inbox.js');
 assert.match(auth,/request\.aiVerifiedRole=identity\.role/);
 assert.match(auth,/TRUSTED_AI_ROLES/);
 assert.match(auth,/payload\.lourexAiRole/);
 assert.match(api,/handleToolPlan\(body,response,request\.aiVerifiedRole\)/);
 assert.match(api,/function plannerToolIds\(scope,conversationMode,verifiedRole='viewer'\)/);
 assert.match(api,/cleanToolPlan\(routed\.data,scope,conversationMode,verifiedRole\)/);
});

test('Each provider-only QA path uses only isolated credentials, validates synthetic schema and never touches internet in tests',()=>{
 const entry=new URL('../scripts/qa-ai-provider-sandbox.mjs',import.meta.url);
 const mock=new URL('./fixtures/qa-ai-provider-mock.mjs',import.meta.url);
 const secret='qa-synthetic-token-0123456789012345';
 for(const provider of ['groq','cloudflare','gemini']){
  const env={...process.env,LOUREX_AI_QA_CONFIRM:'isolated-qa-no-customer-data',
    LOUREX_AI_QA_PROVIDER:provider,
    LOUREX_AI_QA_GROQ_API_KEY:secret,
    LOUREX_AI_QA_GEMINI_API_KEY:secret,
    LOUREX_AI_QA_CLOUDFLARE_API_TOKEN:secret,
    LOUREX_AI_QA_CLOUDFLARE_ACCOUNT_ID:'qa-account-id',
    GROQ_API_KEY:'forbidden-production-groq',
    GEMINI_API_KEY:'forbidden-production-gemini',
    CLOUDFLARE_AI_API_TOKEN:'forbidden-production-cloudflare',
    CLOUDFLARE_ACCOUNT_ID:'forbidden-production-account'};
  const run=spawnSync(process.execPath,['--import',mock.pathname,entry.pathname],
    {encoding:'utf8',env,timeout:8000});
  assert.equal(run.status,0,provider+': '+run.stderr);
  assert.match(run.stdout,new RegExp('SANDBOX_PASS: isolated '+provider+' provider'));
  assert.doesNotMatch(run.stdout+run.stderr,/forbidden-production|qa-synthetic-token/);
 }
});

test('QA smoke rejects invalid provider, missing QA keys, missing consent despite inherited production keys',()=>{
 const entry=new URL('../scripts/qa-ai-provider-sandbox.mjs',import.meta.url);
 const base={...process.env,GROQ_API_KEY:'production-groq-is-not-qa',
  GEMINI_API_KEY:'production-gemini-is-not-qa',
  CLOUDFLARE_AI_API_TOKEN:'production-cloudflare-is-not-qa'};
 const invalid=[
  {LOUREX_AI_QA_PROVIDER:'unknown',LOUREX_AI_QA_CONFIRM:'isolated-qa-no-customer-data'},
  {LOUREX_AI_QA_PROVIDER:'gemini',LOUREX_AI_QA_CONFIRM:'isolated-qa-no-customer-data',LOUREX_AI_QA_GEMINI_API_KEY:''},
  {LOUREX_AI_QA_PROVIDER:'cloudflare',LOUREX_AI_QA_CONFIRM:'isolated-qa-no-customer-data',LOUREX_AI_QA_CLOUDFLARE_API_TOKEN:'long-qa-test-value',LOUREX_AI_QA_CLOUDFLARE_ACCOUNT_ID:''},
  {LOUREX_AI_QA_PROVIDER:'groq',LOUREX_AI_QA_CONFIRM:'not-consented',LOUREX_AI_QA_GROQ_API_KEY:'long-qa-test-value'},
  {LOUREX_AI_QA_PROVIDER:'groq',LOUREX_AI_QA_CONFIRM:'isolated-qa-no-customer-data',LOUREX_AI_QA_GROQ_API_KEY:'production-groq-is-not-qa'}
 ];
 for(const patch of invalid){
  const result=spawnSync(process.execPath,[entry.pathname],{encoding:'utf8',timeout:8000,env:{...base,...patch}});
  assert.equal(result.status,2,'No provider may be contacted when opt-in is not fully configured');
  assert.match(result.stderr,/SANDBOX_NOT_CONFIGURED/);
  assert.doesNotMatch(result.stdout+result.stderr,/production-.*-is-not-qa/);
 }
});

test('Firestore production release is opt-in, rules-only and blocked without a reviewed backup',()=>{
 const script=source('scripts/release-firestore-rules.mjs');
 const config=JSON.parse(source('firebase.rules-release.json'));
 assert.deepEqual(config,{firestore:{rules:'firestore.rules'}},'Release must not include indexes, auth, hosting, functions or databases');
 assert.match(script,/--only','firestore:rules/);
 assert.match(script,/--project',project/);
 assert.match(script,/LOUREX_FIRESTORE_LIVE_BACKUP_REVIEWED/);
 assert.match(script,/LOUREX_FIRESTORE_APPROVED_COMMIT/);
 assert.match(script,/LOUREX_FIRESTORE_APPROVED_SHA256/);
 assert.match(script,/version.stdout.trim\(\)!==approvedCli/);
 assert.match(script,/if\(process\.env\.CI==='true'/);
 const executable=new URL('../scripts/release-firestore-rules.mjs',import.meta.url);
 const mock={...process.env,CI:'true',LOUREX_FIRESTORE_DEPLOY_APPROVED:'',
  LOUREX_FIRESTORE_LIVE_BACKUP_REVIEWED:'',
  LOUREX_FIRESTORE_APPROVED_COMMIT:'',
  LOUREX_FIRESTORE_APPROVED_SHA256:''};
 const check=spawnSync(process.execPath,[executable.pathname,'--dry-run'],{
  encoding:'utf8',timeout:7000,env:mock
 });
 assert.equal(check.status,0,check.stderr);
 assert.match(check.stdout,/DRY_RUN_ONLY/);
 assert.match(check.stdout,/Rules SHA-256: [a-f0-9]{64}/);
 const denied=spawnSync(process.execPath,[executable.pathname,'--deploy'],{
  encoding:'utf8',timeout:7000,env:mock
 });
 assert.equal(denied.status,2,'No Firebase deploy may start inside CI or without explicit reviewed approvals');
 assert.match(denied.stderr,/FIRESTORE_RELEASE_BLOCKED/);
 assert.doesNotMatch(denied.stdout,/FIRESTORE_RULES_DEPLOYED/);
});

test('QA smoke rejects production Cloudflare account even with a different QA token',()=>{
  const entry=new URL('../scripts/qa-ai-provider-sandbox.mjs',import.meta.url);
  const productionAccount='production-account-test-only';
  const result=spawnSync(process.execPath,[entry.pathname],{
    encoding:'utf8',timeout:8000,
    env:{...process.env,
      LOUREX_AI_QA_CONFIRM:'isolated-qa-no-customer-data',
      LOUREX_AI_QA_PROVIDER:'cloudflare',
      LOUREX_AI_QA_CLOUDFLARE_API_TOKEN:'qa-synthetic-different-token-0123456789',
      LOUREX_AI_QA_CLOUDFLARE_ACCOUNT_ID:productionAccount,
      CLOUDFLARE_ACCOUNT_ID:productionAccount,
      CLOUDFLARE_AI_API_TOKEN:'production-synthetic-token-0123456789'}
  });
  assert.equal(result.status,2,'Provider must not be contacted with a production Cloudflare account');
  assert.match(result.stderr,/SANDBOX_NOT_CONFIGURED/);
  assert.doesNotMatch(result.stdout+result.stderr,/production-account-test-only|production-synthetic-token/);
});
