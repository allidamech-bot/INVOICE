import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('v250 gives the launch state a matte accounting-ledger identity without changing startup markup',async()=>{
  const [css,app,html]=await Promise.all([
    read('src/styles/matte-black-v228.css'),
    read('src/app/App.tsx'),
    read('index.html')
  ]);
  assert.match(css,/v250 — Ledger Pulse launch experience/);
  assert.match(css,/SECURE DOCUMENT WORKSPACE/);
  assert.match(css,/INVOICE  ·  QUOTATION  ·  RECORDS/);
  assert.match(css,/lourexLedgerScan/);
  assert.match(css,/lourexLedgerProgress/);
  assert.match(css,/prefers-reduced-motion:reduce/);
  assert.match(app,/if\(this\.state\.loading\)return <div className="loading-screen"><Brand logoDataUrl=\{this\.state\.publicLogo\} language=\{activeLanguage\}\/><span className="loading-line"\/><\/div>/);
  assert.match(html,/id="lourex-boot" class="loading-screen"/);
});

test('v250 changes the generated service worker so installed clients refresh the launch assets',async()=>{
  const script=await read('scripts/desktop-runtime-v249.mjs');
  assert.match(script,/lourex-invoice-v249: desktop startup recovery refresh/);
  assert.match(script,/lourex-invoice-v250: ledger pulse launch experience refresh/);
  assert.match(script,/LAUNCH_RELEASE_MARKER/);
});
