import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');

test('refresh validates the hydrated conversation thread, not the initial empty ID',async()=>{
  const source=await read('src/lib/ai-intelligence-runtime.ts');
  const start=source.indexOf('export async function refreshIntelligenceWorkspace(');
  const end=source.indexOf('async function runIntelligenceWorkspace(',start);
  assert.ok(start>=0&&end>start);
  const refresh=source.slice(start,end);
  const hydrate=refresh.indexOf('await hydrateKernel(host,resumed.vault)');
  const check=refresh.indexOf('const scope=scopeFor(host,resumed.vault)',hydrate);
  const matching=refresh.indexOf('kernelScopeKey(scopeFor(host,fresh.vault))!==kernelScopeKey(scope)',check);
  assert.ok(hydrate>=0&&check>hydrate&&matching>check,'hydration must assign the first thread ID before the post-load scope consistency check');
  assert.match(source,/if\(!host\.__lourexAssistantThreadId\)host\.__lourexAssistantThreadId='ai-thread-'\+crypto\.randomUUID\(\)/);
});

test('failed scoped conversation hydration exposes retry instead of an endless loading placeholder',async()=>{
  const source=await read('src/components/AiConversationWorkspace.tsx');
  assert.match(source,/if\(classes\.includes\('lourex-ai-messages'\)\)return react\.cloneElement\(child,undefined,host\.state\.__workspaceLoadError/);
  assert.match(source,/<div role="alert" className="lxw-load-error">/);
  assert.match(source,/host\.setState\(\{__workspaceLoadError:''\},\(\)=>void host\.__workspaceRefresh\?\.\(\)\)/);
  assert.match(source,/role="status"[^\n]*Loading scoped conversation/);
  assert.match(source,/if\(classes\.includes\('lourex-ai-proposal'\)\)return null/);
  assert.match(source,/host\.__workspaceObservedProps=undefined;host\.__foundationVault=undefined/);
  assert.match(source,/host\.setState\(\{__workspaceLoadError:''\}\)/);
  assert.match(source,/window\.setTimeout\(\(\)=>\{/);
  assert.match(source,/20_000/);
  assert.match(source,/host\.__workspaceLoadGeneration===generation/);
  assert.match(source,/host\.__workspaceLoadGeneration!==generation/);
  assert.match(source,/window\.clearTimeout\(host\.__workspaceLoadTimer\)/);
  assert.match(source,/unmountConversationWorkspace\(host:Host\)/);
  assert.match(source,/setState\(\{__workspaceLoadError:error instanceof Error/);
  assert.doesNotMatch(source,/host\.state\.error\s*\?\s*<div role="alert" className="lxw-load-error"/);
  assert.ok(source.includes("'data-workspace-ready':'false'"));
});

test('conversation hydration still requires matching account and workspace ownership',async()=>{
  const source=await read('src/components/AiConversationWorkspace.tsx');
  const runtime=await read('src/lib/ai-intelligence-runtime.ts');
  assert.match(source,/k\.scope\.accountId===\(activeAccountStorageUid\(\)\|\|''\)/);
  assert.match(source,/strictAiActor\(v\)/);
  assert.match(runtime,/strictAiActor\(resumed\.vault\);await hydrateKernel/);
  assert.match(runtime,/Scope changed while reading business memory/);
  assert.match(runtime,/const live=await resumeVaultSession\(\)/);
  assert.match(runtime,/kernelScopeKey\(scopeFor\(host,live\.vault\)\)!==kernelScopeKey\(scope\)/);
  assert.match(runtime,/Account, conversation or workspace changed during loading/);
});

test('runtime: a fresh Business thread completes hydration without stale empty-ID rejection',async()=>{
  const [{compiledReliabilityHarness},{emptyVault}]=await Promise.all([
    import('./helpers/ai-reliability-runtime.mjs'),
    import('../dist/src/lib/defaults.js')
  ]);
  const {runtime,host}=await compiledReliabilityHarness(emptyVault());
  const h=host();h.__lourexAssistantThreadId='';
  await runtime.refreshIntelligenceWorkspace(h);
  assert.match(h.__lourexAssistantThreadId,/^ai-thread-/);
  assert.equal(h.__intelligenceKernel.scope.threadId,h.__lourexAssistantThreadId);
  assert.equal(h.__intelligenceKernel.scope.scope,'business');
});

test('runtime: an unsuccessful scope load fails once rather than recursively refreshing',async()=>{
  const [{compiledReliabilityHarness},{emptyVault}]=await Promise.all([
    import('./helpers/ai-reliability-runtime.mjs'),
    import('../dist/src/lib/defaults.js')
  ]);
  const {runtime,host}=await compiledReliabilityHarness(emptyVault());
  const h=host();h.__lourexAssistantWorkspaceKey='stale|scope';
  let calls=0;
  h.__workspaceBaseSetScope=async()=>{calls++;};
  await assert.rejects(runtime.refreshIntelligenceWorkspace(h),/scope did not load/);
  assert.equal(calls,1,'failed scope loader must be attempted just once');
});

test('runtime: successful direct scope loading does not require nested UI refresh',async()=>{
  const [{compiledReliabilityHarness},{emptyVault}]=await Promise.all([
    import('./helpers/ai-reliability-runtime.mjs'),
    import('../dist/src/lib/defaults.js')
  ]);
  const {runtime,host}=await compiledReliabilityHarness(emptyVault());
  const h=host();h.__lourexAssistantWorkspaceKey='stale|scope';
  let calls=0;
  h.__workspaceBaseSetScope=async()=>{calls++;h.__lourexAssistantWorkspaceKey='default|main';};
  await runtime.refreshIntelligenceWorkspace(h);
  assert.equal(calls,1);
  assert.equal(h.__intelligenceKernel.scope.workspaceId,'default');
});
