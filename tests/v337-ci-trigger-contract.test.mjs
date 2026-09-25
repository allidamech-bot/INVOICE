import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('v337 PR verification cannot silently fall back to manual-only CI',async()=>{
  const workflow=await read('.github/workflows/ci.yml');
  assert.match(workflow,/^on:\s*[\s\S]*?^  workflow_dispatch:\s*$/m);
  assert.match(workflow,/^  pull_request:\s*\n    branches:\s*\n      - main\s*$/m);
});

test('v337 PR CI runs the Safari/WebKit reachability suites required by the audit',async()=>{
  const workflow=await read('.github/workflows/ci.yml');
  assert.match(workflow,/playwright install --with-deps chromium webkit/);
  for(const suite of [
    'run-v326-access-surfaces.cjs',
    'run-v326-studio-security-overlays.cjs',
    'run-v337-draft-output.cjs',
    'run-v337-create-center.cjs',
    'run-v337-document-actions.cjs',
    'run-v337-shell-navigation.cjs'
  ])assert.match(workflow,new RegExp(suite.replaceAll('.','\\.')));
});
