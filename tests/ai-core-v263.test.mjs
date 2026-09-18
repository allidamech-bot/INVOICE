import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const api=fs.readFileSync(new URL('../api/ai-core.js',import.meta.url),'utf8');
const copilot=fs.readFileSync(new URL('../src/components/AiCopilot.tsx',import.meta.url),'utf8');
const shell=fs.readFileSync(new URL('../src/components/AppShell.tsx',import.meta.url),'utf8');
const sw=fs.readFileSync(new URL('../public/sw.js',import.meta.url),'utf8');

test('v263 mounts one contextual LOUREX AI copilot without changing primary navigation',()=>{
  assert.match(shell,/import \{ AiCopilot \} from '\.\/AiCopilot\.js'/);
  assert.match(shell,/<AiCopilot screen=\{this\.props\.screen\} language=\{this\.props\.language\}/);
  assert.match(copilot,/lourex-ai-launcher/);
  assert.match(copilot,/lourex-ai-panel/);
  assert.match(copilot,/@media\(max-width:720px\)/);
  assert.match(copilot,/height:min\(88dvh,760px\)/);
  for(const destination of ['home','documents','customers','receivables','reports','items','operations'])assert.match(shell,new RegExp(`navButton\\('${destination}'|moreNavButton\\('${destination}'`));
});

test('v263 capability registry is approval-controlled and contains no data mutation capability',()=>{
  assert.match(copilot,/AI_CAPABILITIES/);
  assert.match(copilot,/workspace\.help/);
  assert.match(copilot,/workspace\.navigate/);
  assert.match(copilot,/requiresApproval:true/);
  assert.match(copilot,/dataMutation:false/);
  assert.doesNotMatch(copilot,/archiveProducts|deleteCustomer|deleteDocument|saveDocument|postPurchase|recordPayment/);
  assert.match(copilot,/approveProposal/);
  assert.match(copilot,/dismissProposal/);
  assert.match(copilot,/No record changes without approval/);
});

test('v263 client context broker shares only bounded workspace context',()=>{
  assert.match(copilot,/interface AiContextEnvelope/);
  assert.match(copilot,/screen:AiWorkspaceScreen/);
  assert.match(copilot,/language:UiLanguage/);
  assert.match(copilot,/allowedCapabilities/);
  assert.doesNotMatch(copilot,/VaultPayload|customers:|documents:|payments:|suppliers:|savedItems:/);
  assert.match(copilot,/MAX_MESSAGE_CHARS=1000/);
  assert.match(copilot,/X-Requested-With':'LOUREX-Invoice'/);
});

test('v263 AI Core endpoint keeps Gemini server-side and rejects broader authority',()=>{
  assert.match(api,/process\.env\.GEMINI_API_KEY/);
  assert.doesNotMatch(copilot,/GEMINI_API_KEY|generativelanguage\.googleapis\.com/);
  assert.match(api,/sameOriginRequest/);
  assert.match(api,/rateAllowed/);
  assert.match(api,/MAX_BODY_BYTES=6000/);
  assert.match(api,/MAX_MESSAGE_CHARS=1000/);
  assert.match(api,/temperature:0/);
  assert.match(api,/responseMimeType:'application\/json'/);
  assert.match(api,/cannot create, edit, delete, archive, merge, post, void, reverse, approve, finalize, price, pay/);
  assert.match(api,/Never claim that you changed data/);
  assert.match(api,/Do not ask for or imply access to the encrypted vault/);
});

test('v263 proposal schema allows navigation only and always returns to client approval',()=>{
  assert.match(api,/capability:\{type:'STRING',enum:\['workspace\.navigate'\]\}/);
  assert.match(api,/target:\{type:'STRING',enum:NAV_TARGETS\}/);
  assert.match(api,/A navigation action is never executed automatically/);
  assert.match(copilot,/capabilityRequiresApproval\(proposal\.capability\)/);
  assert.match(copilot,/this\.props\.onNavigate\(proposal\.target\)/);
});

test('v263 audit trail stores metadata only and service worker runtime caches new app modules',()=>{
  assert.match(copilot,/interface AiAuditEntry/);
  assert.match(copilot,/capability:AiCapabilityId/);
  assert.match(copilot,/outcome:/);
  assert.doesNotMatch(copilot,/AiAuditEntry[^}]*message:/s);
  assert.match(sw,/pathname\.startsWith\('\/src\/'\)/);
  assert.match(sw,/isAppRuntimePath\(url\.pathname\)/);
});
