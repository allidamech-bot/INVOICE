import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('More navigation remains in-app and does not own page reloads',async()=>{
  const shell=await read('src/components/AppShell.tsx');
  const navigate=shell.slice(shell.indexOf('private navigate='),shell.indexOf('private toggleCreate='));
  assert.match(navigate,/this\.props\.onNavigate\(screen\)/,'More navigation lost the in-app navigation callback');
  assert.doesNotMatch(navigate,/location\.(?:reload|replace|assign)|history\.go/,'More navigation must never reload the document');
});

test('legacy late-auth reload path is intercepted before document-entry executes',async()=>{
  const guard=await read('public/runtime-no-auto-reload-v482.js');
  assert.match(guard,/stopImmediatePropagation/);
  assert.match(guard,/lourex-account-transition-request/);
  assert.doesNotMatch(guard,/window\.location/);
});
