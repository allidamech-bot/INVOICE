/* Focused geometry checks against the shipped renderer, using synthetic data. */
const {chromium}=require('playwright');
const fs=require('node:fs/promises');
const path=require('node:path');
const assert=require('node:assert/strict');
const {exportQuotationPdf,verifyExportedQrLinks}=require('./quotation-pdf-pixels.cjs');
const root=path.resolve(__dirname,'../..');
const templates=(process.env.LOUREX_TEMPLATE_IDS||'executive,minimal,trade,signature,obsidian,cobalt,editorial,split,prism,slate,horizon,mono,aurora,ledger,noir,midnight,blackivory,carbon').split(',');
(async()=>{
 const browser=await chromium.launch({headless:true});
 const report=[];
 try{
  const page=await browser.newPage({viewport:{width:1280,height:1400}});
  await page.route('http://lourex.test/**',async route=>{
   const file=path.resolve(root,'.'+decodeURIComponent(new URL(route.request().url()).pathname));
   if(!file.startsWith(root+path.sep))return route.fulfill({status:403,body:''});
   try{await route.fulfill({body:await fs.readFile(file),contentType:({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.ttf':'font/ttf','.woff2':'font/woff2'})[path.extname(file)]||'application/octet-stream'});}catch{await route.fulfill({status:404,body:''});}
  });
  for(const template of templates)for(const language of ['en','ar','bilingual'])for(const profile of [
   {items:'2'}, {items:'24'}, {items:'2',bank:'false'},
   {items:'2',signing:'false'},
   {items:'2',bank:'false',signing:'false',terms:'false'},
   {items:'2',signing:'false',qr:'false'},
   {items:'2',bank:'false',qr:'false'}
  ]){
   const params={template,language,profile:'showcase',mode:'print',qr:'true',...profile};
   await page.goto('http://lourex.test/tests/visual/template-visual-qa.html?'+new URLSearchParams(params));
   await page.waitForFunction(()=>document.querySelector('.invoice-pages')?.dataset.paginationReady==='true',null,{timeout:20000});
   const result=await page.evaluate(()=>{
    const failures=[];const pages=[...document.querySelectorAll('.invoice-page')],last=pages.at(-1);
    const closing=last.querySelector('.final-details'),footer=last.querySelector('.doc-footer');
    const rect=el=>el.getBoundingClientRect();
    if(document.querySelectorAll('.final-details').length!==1)failures.push('closing duplicated');
    if(rect(closing).bottom>rect(footer).top-4)failures.push('closing touches footer');
    if(rect(footer).top-rect(closing).bottom>22)failures.push('closing floats away from bottom footer');
    const qr=closing.querySelector('.document-qr-block'),bottom=closing.querySelector('.bottom-grid');
    const blocks=[...bottom.children];
    for(let i=0;i<blocks.length;i++){
     const a=rect(blocks[i]);
     if(Math.abs(a.top-rect(blocks[0]).top)>2)failures.push('closing blocks do not share a row');
     for(const b of blocks.slice(i+1).map(rect))if(a.left<b.right-1&&a.right>b.left+1&&a.top<b.bottom-1&&a.bottom>b.top+1)failures.push('closing blocks collide');
    }
    if(blocks.length===1&&rect(blocks[0]).width<rect(bottom).width*.9)failures.push('single closing block reserves empty columns');
    if(!closing.querySelector('.terms-block')){
     const summary=rect(closing.querySelector('.totals-block')),row=rect(closing.querySelector('.lower-grid'));
     const rtl=last.dir==='rtl';
     if(Math.abs((rtl?summary.left:summary.right)-(rtl?row.left:row.right))>2)failures.push('totals move away from financial edge when terms are absent');
    }
    for(const paper of pages){
     if(paper.scrollWidth>paper.clientWidth+2||paper.scrollHeight>paper.clientHeight+2)failures.push('A4 page overflow');
     const boundary=rect(paper.querySelector('.doc-footer')).top;
     for(const el of paper.querySelectorAll('.doc-body *'))if(rect(el).height&&rect(el).bottom>boundary-1)failures.push('body overlaps footer');
    }
    const indices=[...document.querySelectorAll('tr[data-source-fragment="0"]')].map(el=>+el.dataset.sourceItemIndex);
    const expected=+document.querySelector('.invoice-pages').dataset.sourceItemCount;
    if(indices.length!==expected||indices.some((n,i)=>n!==i+1))failures.push('item sequence changed');
    if(expected===2&&pages.length!==1)failures.push('ordinary quotation gains an unnecessary page');
    if(expected===24&&pages.length<2)failures.push('long quotation not paginated');
    if(expected===24&&pages.length>3)failures.push('ordinary 24-item quotation wastes A4 pages');
    for(const cell of document.querySelectorAll('td.col-num')){
     const range=document.createRange();range.selectNodeContents(cell);
     if(range.getClientRects().length>1)failures.push('item number wraps across lines');
    }
    return {pages:pages.length,failures:[...new Set(failures)]};
   });
   report.push({params,...result});
   assert.equal(await page.locator('.document-qr-block').count(),params.qr==='true'?1:0,'electronic QR count');
   assert.equal(await page.locator('.bank-block').count(),params.bank==='false'?0:1,'configured bank count');
   assert.equal(await page.locator('.signature-block').count(),params.signing==='false'?0:1,'configured signing count');
   if(process.env.LOUREX_CLOSING_PDF==='true'&&language==='bilingual'&&profile.bank===undefined&&profile.signing===undefined&&['executive','midnight'].includes(template)){
    const directory=process.env.LOUREX_TEMPLATE_QA_OUTPUT||'/tmp/lourex-closing-qa';
    await fs.mkdir(directory,{recursive:true});
    const pdf=path.join(directory,`${template}-${profile.items}-closing.pdf`);
    const pages=await exportQuotationPdf(page,pdf);
    assert.equal(pages.length,result.pages,'PDF page count differs from measured preview');
    assert.equal(await verifyExportedQrLinks(page,pdf),1,'PDF must contain exactly one scannable final-page QR');
    await page.locator('.invoice-page').last().screenshot({path:pdf.replace('.pdf','.png')});
    console.log(`A4 PDF and QR passed: ${template}/${profile.items} (${pages.length} pages)`);
   }
  }
 }finally{await browser.close();}
 const failed=report.filter(r=>r.failures.length);
 for(const r of failed)console.error(JSON.stringify(r));
 console.log(`${report.length-failed.length}/${report.length} quotation closing cases passed`);
 assert.equal(failed.length,0);
})().catch(e=>{console.error(e);process.exitCode=1;});
