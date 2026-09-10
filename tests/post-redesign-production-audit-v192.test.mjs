import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('v192 production audit layer is loaded after Obsidian closeout and before printable template styling',async()=>{
  const index=await read('index.html');
  const closeout='./styles/obsidian-closeout-v191.css';
  const audit='./styles/obsidian-production-audit-v192.css';
  const print='./styles/document-premium-redesign-v141.css';
  assert.ok(index.includes(audit));
  assert.ok(index.indexOf(closeout)<index.indexOf(audit));
  assert.ok(index.indexOf(audit)<index.indexOf(print));
});

test('v192 removes residual light editor design rows and pins switch geometry',async()=>{
  const css=await read('src/styles/obsidian-production-audit-v192.css');
  assert.match(css,/@media screen/);
  assert.match(css,/\.app-ui \.design-advanced-panel/);
  assert.match(css,/\.app-ui \.appearance-auto-note/);
  assert.match(css,/\.app-ui \.appearance-toggles \.toggle-row/);
  assert.match(css,/background:var\(--ds-surface\)!important/);
  assert.match(css,/\.toggle-row>\.toggle\{[\s\S]*width:36px!important[\s\S]*height:21px!important/);
  assert.match(css,/\.toggle-row>\.toggle>span\{[\s\S]*width:17px!important[\s\S]*height:17px!important/);
  assert.match(css,/@media \(max-width:720px\)[\s\S]*appearance-toggles\{grid-template-columns:minmax\(0,1fr\)!important/);
  assert.doesNotMatch(css,/invoice-page|invoice-pages|template-renderer|document-page/);
});

test('v192 editor browser QA audits the design section after scrolling and checks all six switches',async()=>{
  const runner=await read('tests/visual/run-obsidian-editor.cjs');
  assert.match(runner,/const auditDesign=async\(\)=>/);
  assert.match(runner,/expected 6 appearance toggle rows/);
  assert.match(runner,/appearance switch inflated/);
  const designScroll=runner.indexOf("await sections.last().scrollIntoViewIfNeeded();");
  assert.ok(designScroll>=0);
  const after=runner.slice(designScroll,designScroll+500);
  assert.match(after,/await audit\(\);/);
  assert.match(after,/await auditDesign\(\);/);
  assert.match(after,/firstAppearanceSwitch\.click\(\)/);
});

test('v192 remains cached intact while later immutable PWA generations advance',async()=>{
  const sw=await read('public/sw.js');
  const versions=[...sw.matchAll(/^const CACHE = 'lourex-invoice-v(\d+)';$/gm)];
  const current=Number(versions.at(-1)?.[1]);
  assert.ok(Number.isInteger(current)&&current>=196,'current immutable PWA generation must not regress below v196');
  assert.match(sw,/lourex-invoice-v193: preserved as a legacy marker/);
  assert.match(sw,/lourex-invoice-v192: preserved as a legacy marker/);
  assert.match(sw,/lourex-invoice-v191: preserved as a legacy marker/);
  assert.ok(sw.includes("LOCAL_CORE.push('./styles/obsidian-production-audit-v192.css')"));
});
