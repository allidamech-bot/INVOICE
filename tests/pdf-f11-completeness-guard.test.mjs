import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const source=await readFile(new URL('../public/ios-print-bridge.js',import.meta.url),'utf8');
const start=source.indexOf('  const assertCompletePdfPagination = (pageRoot,sourcePages) => {');
const end=source.indexOf('  const renderPdfPages = async',start);
assert.ok(start>=0&&end>start,'actual A4 export guard must exist');
const ctx={};
vm.runInNewContext(source.slice(start,end)+'\nglobalThis.verify=assertCompletePdfPagination;',ctx);
const row=(i,id='rfq-'+i,fragment='0')=>({
  getAttribute(name){return name==='data-source-item-id'?id:name==='data-source-item-index'?String(i):name==='data-source-fragment'?fragment:null;}
});
function fixture(count=84){
  let content=Array.from({length:count},(_,i)=>row(i+1));
  const page={querySelectorAll(selector){return selector==='.items-table tbody tr[data-source-item-id]'?content:[];},
    querySelector(selector){if(selector==='.final-details')return {};if(selector==='.items-table tbody tr')return content[0]||null;return null;}};
  const root={classList:{contains(x){return x==='invoice-pages';}},
    getAttribute(name){return name==='data-source-item-count'?String(count):name==='data-pagination-ready'?'true':null;}};
  return{root,pages:[page],rows:content,setRows(value){content=value;}};
}
test('F11 full 84 line A4 page export passes exact source IDs and order',()=>{
 const f=fixture(84);
 assert.doesNotThrow(()=>ctx.verify(f.root,f.pages));
});
test('F11 reject an omitted source item (no truncated PDF)',()=>{
 const f=fixture(84);f.setRows(f.rows.slice(0,83));
 assert.throws(()=>ctx.verify(f.root,f.pages),/missing or duplicating quotation rows/);
});
test('F11 reject duplicate IDs, reordered commercial lines and orphan text fragment',()=>{
 const f=fixture(84);
 f.setRows([...f.rows.slice(0,83),row(84,'rfq-83')]);
 assert.throws(()=>ctx.verify(f.root,f.pages),/row order\/identity/);
 f.setRows([...f.rows.slice(1),f.rows[0]]);
 assert.throws(()=>ctx.verify(f.root,f.pages),/row order\/identity/);
 f.setRows([...f.rows,row(99,'orphan','1')]);
 assert.throws(()=>ctx.verify(f.root,f.pages),/orphan PDF continuation/);
});
test('F11 reject blank intermediate pages and missing financial close',()=>{
 const f=fixture(84);
 f.pages.unshift({querySelectorAll(){return [];},querySelector(){return null;}});
 assert.throws(()=>ctx.verify(f.root,f.pages),/blank\/intermediate PDF page/);
 const v=fixture(84);
 v.pages[0].querySelector=(selector)=>selector==='.items-table tbody tr'?v.rows[0]:null;
 assert.throws(()=>ctx.verify(v.root,v.pages),/totals\/closing content is missing/);
});
test('F11 cannot create a PDF from unpaginated source',()=>{
 const f=fixture(84);
 f.root.getAttribute=(name)=>name==='data-pagination-ready'?'false':'84';
 assert.throws(()=>ctx.verify(f.root,f.pages),/not fully paginated/);
});
