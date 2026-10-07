import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('v580 Safari PDF owner runs before the final runtime cache identity',async()=>{
  const pkg=JSON.parse(await read('package.json'));
  const build=String(pkg.scripts?.build||'');
  const owner='scripts/v580-safari-pdf-single-page.mjs';
  assert.ok(build.includes(owner),'v580 Safari PDF owner is missing from build');
  const safariAt=build.indexOf(`node ${owner}`);
  const finalHashAt=build.indexOf('node scripts/ai-voice-final-runtime-hash.mjs');
  assert.ok(safariAt>=0&&finalHashAt>safariAt,'v580 must finish before the final runtime cache identity');
  assert.ok(build.trim().endsWith('node scripts/ai-voice-final-runtime-hash.mjs'),'final runtime cache identity must remain last');
});

test('v580 prevents Safari document PDF from falling back to native print and busts its bridge cache',async()=>{
  const owner=await read('scripts/v580-safari-pdf-single-page.mjs');
  assert.match(owner,/SAFARI_PDF_BRIDGE_VERSION/);
  assert.match(owner,/isAppleTouch&&document\.body\.classList\.contains\('printing'\)/);
  assert.match(owner,/Safari document output is not armed/);
  assert.match(owner,/expectedPageCount=pages\.length/);
  assert.match(owner,/actualPageCount!==expectedPageCount/);
  assert.match(owner,/ios-print-bridge\.js\?v=\$\{VERSION\}/);
  assert.match(owner,/LOCAL_CORE\.push\('\.\/ios-print-bridge\.js\?v=\$\{VERSION\}'\)/);
  assert.match(owner,/v580 Safari PDF cache refresh/);
});


test('Safari app boundary refuses native PDF fallback when the bridge is unavailable',async()=>{
  const app=await read('src/app/App.tsx');
  const start=app.indexOf("private requestPrint=async(doc:LourexDocument,mode:'print'|'pdf'|'share')");
  const end=app.indexOf('private afterPrint=',start);
  assert.ok(start>=0&&end>start,'requestPrint workflow not found');
  const workflow=app.slice(start,end);
  assert.match(workflow,/appleTouch=\/iPad\|iPhone\|iPod\/i\.test\(navigator\.userAgent\)/);
  assert.match(workflow,/mode!==['"]print['"]&&typeof preparePdf!==['"]function['"]/);
  assert.match(workflow,/Safari PDF engine is not ready/);
  assert.match(workflow,/preparePdf\?\.\(mode\)/);
});
