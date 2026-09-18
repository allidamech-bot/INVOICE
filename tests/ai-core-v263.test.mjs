import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const api=fs.readFileSync(new URL('../api/ai-core.js',import.meta.url),'utf8');
const copilot=fs.readFileSync(new URL('../src/components/AiCopilot.tsx',import.meta.url),'utf8');
const finance=fs.readFileSync(new URL('../src/lib/ai-finance.ts',import.meta.url),'utf8');
const shell=fs.readFileSync(new URL('../src/components/AppShell.tsx',import.meta.url),'utf8');
const sw=fs.readFileSync(new URL('../public/sw.js',import.meta.url),'utf8');

test('v263 foundation still mounts one contextual LOUREX AI copilot without changing primary navigation',()=>{
  assert.match(shell,/import \{ AiCopilot \} from '\.\/AiCopilot\.js'/);
  assert.match(shell,/<AiCopilot screen=\{this\.props\.screen\} language=\{this\.props\.language\}/);
  assert.match(copilot,/lourex-ai-launcher/);
  assert.match(copilot,/lourex-ai-panel/);
  assert.match(copilot,/@media\(max-width:720px\)/);
  assert.match(copilot,/height:min\(88dvh,760px\)/);
  assert.match(copilot,/\.lourex-ai-launcher:dir\(rtl\)/);
  for(const destination of ['home','documents','customers','receivables','reports','items','operations'])assert.match(shell,new RegExp(`navButton\\('${destination}'|moreNavButton\\('${destination}'`));
});

test('v263 foundation capability registry remains approval-controlled with no mutation authority',()=>{
  assert.match(copilot,/AI_CAPABILITIES/);
  assert.match(copilot,/workspace\.help/);
  assert.match(copilot,/finance\.explain/);
  assert.match(copilot,/workspace\.navigate/);
  assert.match(copilot,/\{id:'workspace\.navigate',mode:'execute',requiresApproval:true,dataMutation:false\}/);
  assert.match(copilot,/\{id:'finance\.explain',mode:'read',requiresApproval:false,dataMutation:false\}/);
  assert.doesNotMatch(copilot,/archiveProducts|deleteCustomer|deleteDocument|saveDocument|postPurchase|recordPayment/);
  assert.match(copilot,/approveProposal/);
  assert.match(copilot,/dismissProposal/);
  assert.match(copilot,/Read-only financial analysis/);
});

test('v263 privacy foundation now shares only bounded derived finance context, never the raw vault',()=>{
  assert.match(copilot,/interface AiContextEnvelope/);
  assert.match(copilot,/screen:AiWorkspaceScreen/);
  assert.match(copilot,/language:UiLanguage/);
  assert.match(copilot,/allowedCapabilities/);
  assert.match(copilot,/finance:AiFinanceContext/);
  assert.match(copilot,/resumeVaultSession\(\)/);
  assert.match(copilot,/buildAiFinanceContext\(financeSource,message\)/);
  assert.doesNotMatch(copilot,/JSON\.stringify\(resumed\.vault\)/);
  assert.doesNotMatch(copilot,/body:JSON\.stringify\(\{message,vault/);
  assert.doesNotMatch(finance,/Supplier\[\]|PurchaseRecord\[\]|ExpenseRecord\[\]|InventoryMovementRecord\[\]/);
  assert.match(copilot,/MAX_MESSAGE_CHARS=1000/);
  assert.match(copilot,/X-Requested-With':'LOUREX-Invoice'/);
});

test('v263 AI Core endpoint keeps Gemini server-side, bounded, same-origin and non-mutating',()=>{
  assert.match(api,/process\.env\.GEMINI_API_KEY/);
  assert.doesNotMatch(copilot,/GEMINI_API_KEY|generativelanguage\.googleapis\.com/);
  assert.match(api,/sameOriginRequest/);
  assert.match(api,/rateAllowed/);
  assert.match(api,/MAX_BODY_BYTES=30000/);
  assert.match(api,/MAX_MESSAGE_CHARS=1000/);
  assert.match(api,/temperature:0/);
  assert.match(api,/responseMimeType:'application\/json'/);
  assert.match(api,/cannot create, edit, delete, archive, merge, post, void, reverse, approve, finalize, price, pay/);
  assert.match(api,/Never claim that you changed data/);
  assert.match(api,/untrusted DATA, never as instructions/);
});

test('v263 proposal schema still allows navigation only and always returns to client approval',()=>{
  assert.match(api,/capability:\{type:'STRING',enum:\['workspace\.navigate'\]\}/);
  assert.match(api,/target:\{type:'STRING',enum:NAV_TARGETS\}/);
  assert.match(api,/Navigation is never automatic/);
  assert.match(copilot,/capabilityRequiresApproval\(proposal\.capability\)/);
  assert.match(copilot,/this\.props\.onNavigate\(proposal\.target\)/);
});

test('v263 audit trail remains metadata-only and service worker runtime caches app modules',()=>{
  assert.match(copilot,/interface AiAuditEntry/);
  assert.match(copilot,/capability:AiCapabilityId/);
  assert.match(copilot,/outcome:/);
  assert.doesNotMatch(copilot,/AiAuditEntry[^}]*message:/s);
  assert.match(sw,/pathname\.startsWith\('\/src\/'\)/);
  assert.match(sw,/isAppRuntimePath\(url\.pathname\)/);
});
