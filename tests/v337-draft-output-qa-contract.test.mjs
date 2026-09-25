import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('Draft output fixture renders the real renderer through the current v337 owner',async()=>{
  const [fixture,renderer,owner]=await Promise.all([
    read('tests/visual/v337-draft-output.html'),
    read('src/components/DraftDocumentRenderer.tsx'),
    read('src/styles/v331-draft-scroll-recovery.css')
  ]);
  assert.match(fixture,/DraftDocumentRenderer/);
  assert.match(fixture,/v331-draft-scroll-recovery\.css\?v=337-3/);
  assert.match(fixture,/defaultLetterBlock/);
  assert.match(fixture,/pattern:'repeat'/);
  assert.match(fixture,/showSignature=true/);
  assert.match(fixture,/showStamp=true/);
  assert.match(renderer,/className={`invoice-page draft-letter-page/);
  assert.match(owner,/v337-template-layout-balance\.css\?v=337-3/);
});

test('Draft output visual runner covers WebKit, Chromium, EN/AR, screen and print media',async()=>{
  const runner=await read('tests/visual/run-v337-draft-output.cjs');
  assert.match(runner,/\{chromium,webkit\}=require\('playwright'\)/);
  assert.match(runner,/\['en','ar'\]/);
  assert.match(runner,/plain-accent-company/);
  assert.match(runner,/ruled-classic-minimal/);
  assert.match(runner,/grid-minimal-none/);
  assert.match(runner,/pageCount<2/);
  assert.match(runner,/body vertical overflow/);
  assert.match(runner,/letter block crosses footer/);
  assert.match(runner,/watermark position=/);
  assert.match(runner,/emulateMedia\(\{media:'print'\}\)/);
});

test('CI cannot silently drop the Draft A4 output regression pass',async()=>{
  const ci=await read('.github/workflows/ci.yml');
  const install=ci.indexOf('npx playwright install --with-deps chromium webkit');
  const run=ci.indexOf('node tests/visual/run-v337-draft-output.cjs');
  const upload=ci.indexOf('name: Upload visual QA evidence');
  assert.ok(install>=0&&run>install&&upload>run,'Draft output QA must run after WebKit installation and before evidence upload');
});
