const {chromium,webkit}=require('playwright');
const assert=require('node:assert/strict');
const url='http://127.0.0.1:4173/tests/visual/v542-pagination-parity.html?rows=84';

async function check(engine,name){
 const browser=await engine.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844}});
  await page.goto(url,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>{
   const views=Array.from(document.querySelectorAll('.mobile-preview-stage .invoice-pages,.print-portal .invoice-pages'));
   return views.length===2&&views.every(x=>x.getAttribute('data-pagination-ready')==='true');
  },null,{timeout:40000});
  const checked=await page.evaluate(()=>{
   const check=root=>{
    const container=document.querySelector(root+' .invoice-pages');
    const sheets=Array.from(container.querySelectorAll('.invoice-page'));
    const rows=sheets.flatMap(sheet=>Array.from(sheet.querySelectorAll('tr[data-source-item-id][data-source-fragment="0"]')));
    const ids=rows.map(row=>row.getAttribute('data-source-item-id'));
    const indices=rows.map(row=>Number(row.getAttribute('data-source-item-index')));
    return{expected:Number(container.getAttribute('data-source-item-count')),pages:sheets.length,
      rows:rows.length,ids,indices,itemsPerPage:sheets.map(sheet=>sheet.querySelectorAll('tr[data-source-item-id][data-source-fragment="0"]').length),
      totals:sheets.map(sheet=>sheet.querySelectorAll('.final-details').length),
      footers:sheets.map(sheet=>sheet.querySelector('.doc-footer')?.textContent?.trim()||''),
      empty:sheets.map((sheet,index)=>({
        index,blank:!sheet.querySelector('tr[data-source-item-id]')&&!sheet.querySelector('.final-details')
      })).filter(x=>x.blank)};
   };
   return{preview:check('.mobile-preview-stage'),output:check('.print-portal')};
  });
  for(const [kind,value]of Object.entries(checked)){
    assert.equal(value.expected,84,name+': '+kind+' source count');
    assert.equal(value.rows,84,name+': '+kind+' commercial item count');
    assert.equal(new Set(value.ids).size,84,name+': duplicate IDs');
    assert.deepEqual(value.indices,Array.from({length:84},(_,i)=>i+1),name+': row order changed');
    assert.ok(value.pages>1&&value.pages<=30,name+': unexpected page count '+value.pages);
    assert.deepEqual(value.empty,[],name+': found blank inserted pages');
    assert.equal(value.totals.reduce((a,b)=>a+b,0),1,name+': totals duplicated or omitted');
    assert.equal(value.totals.at(-1),1,name+': totals detached from closing page');
    for(let i=0;i<value.pages;i++)assert.match(value.footers[i],new RegExp((i+1)+'\\s*\\/\\s*'+value.pages+'$'),name+': incorrect page footer');
  }
  assert.equal(checked.preview.pages,checked.output.pages,name+': preview and PDF page totals differ');
  assert.deepEqual(checked.preview.itemsPerPage,checked.output.itemsPerPage,name+': different item pagination');

  // Exercise the real PDF renderer, not only HTML: the blob's physical page
  // tree must match all A4 pages used to display the 84 source items.
  await page.evaluate(()=>window.__LOUREX_PREPARE_PDF__('pdf'));
  const link=page.locator('.lourex-ios-output-primary[href^="blob:"]');
  await link.waitFor({state:'attached',timeout:90000});
  const href=await link.getAttribute('href');
  const artifact=await page.evaluate(async u=>{
    const bytes=new Uint8Array(await(await fetch(u)).arrayBuffer());
    let binary='';
    for(let p=0;p<bytes.length;p+=0x8000)binary+=String.fromCharCode(...bytes.subarray(p,Math.min(p+0x8000,bytes.length)));
    return{bytes:bytes.length,pages:(binary.match(/\/Type\s*\/Page\b/g)||[]).length};
  },href);
  assert.ok(artifact.bytes>50000,name+': PDF file missing or too small');
  assert.equal(artifact.pages,checked.output.pages,name+': physical PDF pages do not match A4 output');
  const broken=await page.evaluate(async()=>{
    const root=document.querySelector('.print-portal');
    const line=root.querySelector('tr[data-source-item-index="84"][data-source-fragment="0"]');
    if(!line)return 'missing-row';
    line.remove();
    try{await window.__LOUREX_BUILD_CHAT_PDF__(root,'should-refuse-truncated-84');return 'unexpected-success';}
    catch(error){return String(error?.message||error);}
  });
  assert.match(broken,/missing or duplicating quotation rows/,name+': incomplete document was still exported');
  return{name,htmlPages:checked.output.pages,pdfBytes:artifact.bytes,pdfPages:artifact.pages,rows:checked.output.rows};
 }finally{await browser.close();}
}
(async()=>{
 const results=[];
 results.push(await check(chromium,'chromium-84'));
 results.push(await check(webkit,'webkit-84'));
 console.log('F11 complete 84-row A4 PDF capture PASS',JSON.stringify(results));
})().catch(error=>{console.error(error);process.exit(1);});
