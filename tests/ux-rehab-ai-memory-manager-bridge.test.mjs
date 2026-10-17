import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

/** The legacy manager has durable scoped memory and task authorization. The
 * canonical chat must move that one panel, not create a second manager or
 * silently lose it when removing the obsolete context bar. */
test('AI-MEMORY-01: canonical chat retains the original scoped Memory & Tasks component',()=>{
  const shell=readFileSync('src/components/AiConversationWorkspace.tsx','utf8');
  const legacy=readFileSync('scripts/ai-batch6-personal-memory-tasks.mjs','utf8');
  const router=readFileSync('scripts/ai-batch7-placement-repair.mjs','utf8');
  assert.match(shell,/const memoryManagerParts=legacyContext\.flatMap/);
  assert.match(shell,/cn\.includes\('lourex-ai-manager-button'\)\|\|cn\.includes\('lourex-ai-manager'\)/);
  assert.match(shell,/const memoryManagerBridge=memoryManagerParts\.length/);
  assert.match(shell,/data-workspace-pane':pane\},[\s\S]*memoryManagerBridge\?\[memoryManagerBridge\]:\[\]/);
  assert.match(legacy,/function __lourexManagerPanel\(instance\)/);
  assert.match(legacy,/assistantManagerOpen/);
  assert.match(router,/clickHidden\('#lourex-ai-panel \.lourex-ai-manager-button',0\)/);
});
