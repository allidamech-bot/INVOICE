import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('v337 runtime upgrades an already-marked stale stylesheet instead of trusting its marker',async()=>{
  const runtime=await read('public/document-entry-v302.js');
  assert.match(runtime,/function stylesheetHrefMatches\(link,href\)/);
  assert.match(runtime,/new URL\(link\.getAttribute\('href'\)\|\|link\.href,document\.baseURI\)/);
  assert.match(runtime,/const existing=document\.querySelector\(`link\[\$\{marker\}\]`\)/);
  assert.match(runtime,/existing instanceof HTMLLinkElement/);
  assert.match(runtime,/if\(!stylesheetHrefMatches\(existing,href\)\)existing\.href=href/);
  assert.match(runtime,/v331-draft-scroll-recovery\.css\?v=337-3/);
});
