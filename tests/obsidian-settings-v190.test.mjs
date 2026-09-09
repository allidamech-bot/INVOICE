import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('v190 keeps the Obsidian settings pass isolated to application settings UI',async()=>{
  const css=await read('src/styles/settings-obsidian-v190.css');
  assert.match(css,/Batch 8 — Obsidian Executive settings and company workspace/);
  for(const selector of ['settings-workspace-v2','settings-tabs','settings-title','company-artwork-section','commercial-row-card','settings-account-card']){
    assert.ok(css.includes(selector),`missing ${selector}`);
  }
  assert.match(css,/@media screen/);
  assert.doesNotMatch(css,/@media print/);
  assert.doesNotMatch(css,/\.invoice-pages|\.invoice-page|\.document-page/);
});

test('v190 is bundled after financial workspaces and before the protected printable-template layer',async()=>{
  const html=await read('index.html');
  const financial=html.indexOf('./styles/financial-workspaces-v189.css');
  const settings=html.indexOf('./styles/settings-obsidian-v190.css');
  const printable=html.indexOf('./styles/document-premium-redesign-v141.css');
  assert.ok(financial>=0&&settings>financial&&printable>settings);
});

test('v190 Settings QA exercises the real modal in English and Arabic responsive flows',async()=>{
  const [fixture,runner,workflow]=await Promise.all([
    read('tests/visual/obsidian-settings.html'),
    read('tests/visual/run-obsidian-settings.cjs'),
    read('.github/workflows/ci.yml')
  ]);
  assert.match(fixture,/SettingsModal/);
  assert.match(runner,/\['en','ar'\]/);
  assert.match(runner,/1440/);
  assert.match(runner,/820/);
  assert.match(runner,/390/);
  assert.match(runner,/320/);
  for(const state of ['company','commercial','documents','security'])assert.ok(runner.includes(state),state);
  assert.match(workflow,/run-obsidian-settings\.cjs/);
});