import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root=new URL('../',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');
const readBinary=path=>readFile(new URL(path,root));

function assertPng(buffer,width,height,label){
  assert.equal(buffer.subarray(0,8).toString('hex'),'89504e470d0a1a0a',`${label} must be a PNG`);
  assert.equal(buffer.readUInt32BE(16),width,`${label} width`);
  assert.equal(buffer.readUInt32BE(20),height,`${label} height`);
  assert.ok(buffer.length>1000,`${label} must contain real artwork`);
}

test('v118 installed PWA uses native PNG artwork on iPhone and standard manifest sizes',async()=>{
  const html=await read('index.html');
  const manifest=JSON.parse(await read('public/manifest.webmanifest'));
  assert.match(html,/rel="apple-touch-icon" sizes="180x180" href="\.\/brand\/lourex-app-icon-180\.png"/);
  assert.ok(manifest.icons.some(icon=>icon.src==='./brand/lourex-app-icon-192.png'&&icon.sizes==='192x192'&&icon.type==='image/png'&&icon.purpose==='any'));
  assert.ok(manifest.icons.some(icon=>icon.src==='./brand/lourex-app-icon-512.png'&&icon.sizes==='512x512'&&icon.type==='image/png'&&icon.purpose==='any'));
  assert.ok(manifest.icons.some(icon=>icon.src==='./brand/lourex-app-icon-512.png'&&icon.sizes==='512x512'&&icon.type==='image/png'&&icon.purpose==='maskable'));
  assert.ok(!manifest.icons.some(icon=>icon.type==='image/svg+xml'),'install manifest must not depend on SVG-only icons');

  assertPng(await readBinary('public/brand/lourex-app-icon-180.png'),180,180,'Apple touch icon');
  assertPng(await readBinary('public/brand/lourex-app-icon-192.png'),192,192,'192px PWA icon');
  assertPng(await readBinary('public/brand/lourex-app-icon-512.png'),512,512,'512px PWA icon');
});

test('v118 production build and offline shell ship every installed-app PNG',async()=>{
  const sw=await read('public/sw.js');
  for(const file of ['lourex-app-icon-180.png','lourex-app-icon-192.png','lourex-app-icon-512.png']){
    assert.match(sw,new RegExp(file.replaceAll('.','\\.')));
    const source=await readBinary(`public/brand/${file}`);
    const built=await readBinary(`dist/brand/${file}`);
    assert.deepEqual(built,source,`${file} must survive the production build byte-for-byte`);
  }
  assert.match(sw,/firebase-app-compat\.js/);
  assert.match(sw,/firebase-auth-compat\.js/);
  assert.match(sw,/firebase-firestore-compat\.js/);
  assert.match(sw,/v103 saved-item compatibility/);
  assert.match(sw,/lourex-invoice-v65/);
  assert.match(sw,/const CACHE = 'lourex-invoice-v101'/);
});

test('v118 customer quick-document transition never sets state after its page unmounts',async()=>{
  const source=await read('src/components/CustomersPage.tsx');
  assert.match(source,/private mounted=false/);
  assert.match(source,/componentDidMount\(\):void\{this\.mounted=true;/);
  assert.match(source,/componentWillUnmount\(\):void\{this\.mounted=false;/);
  assert.match(source,/catch\(e\)\{if\(this\.mounted\)this\.setState\(\{error:/);
  assert.match(source,/finally\{if\(this\.mounted\)this\.setState\(\{creatingDocument:''\}\);\}/);
  assert.match(source,/Create this customer without typing the name again/);
  assert.match(source,/Add your first customer/);
});

test('v118 global search shortcuts cannot pull focus behind an open modal',async()=>{
  const [documents,customers,items]=await Promise.all([
    read('src/components/DocumentsPage.tsx'),
    read('src/components/CustomersPage.tsx'),
    read('src/components/SavedItemsPage.tsx')
  ]);
  assert.match(documents,/handleKeyDown=\(event:KeyboardEvent\)=>\{\s*if\(document\.querySelector\('\.modal-backdrop'\)\)return;/);
  assert.match(customers,/this\.state\.editing\|\|document\.querySelector\('\.modal-backdrop'\)\)return;/);
  assert.match(items,/event\.key!=='\/'\|\|document\.querySelector\('\.modal-backdrop'\)\)return;/);
});
