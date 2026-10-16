import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import jsQR from 'jsqr';
import { documentQrImage } from '../dist/src/lib/document-qr.js';
import { secureShareUrl, secureShareIsActive } from '../dist/src/lib/secure-share.js';

const token='aB9_-'.repeat(8)+'abc';
const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');

// Rasterize the generated SVG's unit-square path, then use an independent
// decoder. This catches an unreadable symbol, missing quiet zone or wrong URL.
function pixels(uri,scale=5){
  const svg=decodeURIComponent(uri.split(',')[1]);
  const [,width]=svg.match(/viewBox="0 0 (\d+) \d+"/);
  const size=Number(width)*scale,data=new Uint8ClampedArray(size*size*4).fill(255);
  for(const match of svg.matchAll(/M(\d+),(\d+)h1v1h-1z/g)){
    const x=Number(match[1])*scale,y=Number(match[2])*scale;
    for(let dy=0;dy<scale;dy++)for(let dx=0;dx<scale;dx++){
      const at=((y+dy)*size+x+dx)*4;data[at]=data[at+1]=data[at+2]=0;
    }
  }
  return {data,size};
}

test('printed QR independently decodes to the exact opaque electronic copy URL',()=>{
  for(const origin of ['https://invoice-three-puce.vercel.app','https://customer.lourex.example']){
    for(const scale of [2,5]){
      const {data,size}=pixels(documentQrImage(token,origin),scale);
      assert.equal(jsQR(data,size,size)?.data,secureShareUrl(token,origin));
      assert.ok(data.slice(0,size*4*4).every(value=>value===255),'four-module quiet zone stays white');
    }
  }
});

test('QR refuses malformed tokens and non-website origins',()=>{
  assert.throws(()=>documentQrImage('invoice-123','https://lourex.example'));
  assert.throws(()=>documentQrImage(token,'javascript:alert(1)'));
  assert.throws(()=>documentQrImage(token,''));
});

test('owner export rechecks identity, exact document and active link',async()=>{
  const source=await read('dist/src/cloud/secure-share-owner.js');
  const start=source.indexOf('export async function loadSecureShareForOutput(');
  const end=source.indexOf('export function subscribeOwnerSecureShares',start);
  const factory=new Function('requireOwnerUid','ownerDb','normalizeShare','SECURE_SHARE_TOKEN_PATTERN','secureShareIsActive',source.slice(start,end).replace('export async function','async function')+';return loadSecureShareForOutput;');
  let uid='owner',record={id:token,ownerUid:'owner',documentId:'doc',snapshot:{id:'doc'},expiresAt:'2099-01-01T00:00:00Z',revokedAt:''};
  let afterRead=()=>{};
  const fn=factory(()=>uid,()=>({collection:()=>({doc:()=>({get:async()=>{afterRead();return {exists:true,data:()=>record};}})})}),(_id,data)=>data,/^[A-Za-z0-9_-]{43}$/,secureShareIsActive);
  assert.equal((await fn(token,'doc')).snapshot.id,'doc');
  for(const patch of [{revokedAt:'2026-01-01'}, {expiresAt:'2000-01-01'}, {ownerUid:'other'}, {documentId:'other'}, {snapshot:{id:'other'}}]){
    const original=record;record={...record,...patch};await assert.rejects(fn(token,'doc'));record=original;
  }
  afterRead=()=>{uid='other';};await assert.rejects(fn(token,'doc'));
});

test('QR footer participates in pagination and original exports retain the shared snapshot',async()=>{
  const [renderer,app,css,bridge]=await Promise.all([read('src/templates/TemplateRenderer.tsx'),read('src/app/App.tsx'),read('src/styles/document-electronic-copy.css'),read('public/ios-print-bridge.js')]);
  assert.match(renderer,/finalPage&&electronicShareId\?<DocumentQr/);
  assert.match(renderer,/footer\.getBoundingClientRect\(\)\.top/);
  assert.match(renderer,/documentRenderSignature\(this.props.document\)\+\(this.props.electronicShareId/);
  assert.match(css,/doc-footer.has-electronic-qr\{height:31mm/);
  assert.match(app,/target=structuredClone\(share.snapshot\)/);
  assert.match(app,/printShareId:electronicShareId/);
  assert.match(bridge,/\.lx-document-qr img/);
  assert.match(bridge,/if\(asset.required\)throw/);
  assert.match(bridge,/pdf.link\(/);
});
