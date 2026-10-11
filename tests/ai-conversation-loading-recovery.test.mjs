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
  assert.match(source,/catch\(error\)\{host\.__workspaceObservedProps=undefined;host\.__foundationVault=undefined/);
  assert.match(source,/host\.setState\(\{__workspaceLoadError:''\}\);\}catch\(error\)/);
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
});
