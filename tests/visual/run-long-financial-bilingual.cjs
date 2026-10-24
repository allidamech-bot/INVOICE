/* Dedicated long bilingual financial output acceptance.
   Reuses the issued synthetic fixture and exact-template renderer without
   changing source production code or re-running passed EN/AR template grids. */
const assert=require('node:assert/strict');
const {readFileSync,mkdirSync,writeFileSync}=require('node:fs');
const path=require('node:path');
const {chromium,webkit}=require('playwright');

const registry=[...readFileSync(path.join(__dirname,'../../src/templates/TemplateThumbnails.tsx'),'utf8').matchAll(/\bid: '([^']+)'/g)].map(match=>match[1]);
const selected=process.argv.find(arg=>arg.startsWith('--templates='));
const templates=selected?selected.slice('--templates='.length).split(','):['obsidian','executive'];
assert.ok(templates.length>0&&new Set(templates).size===templates.length&&templates.every(id=>registry.includes(id)),'select distinct registered templates only');
const normalize=value=>String(value).normalize('NFKC').replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-0x660)).replace(/[٬,\u200e\u200f\u202a-\u202e\u2066-\u2069]/g,'').replace(/٫/g,'.');
const compact=value=>normalize(value).replace(/\s+/g,'');
const arGlyphs=value=>[...String(value).replace(/[^\u0600-\u06ff]/g,'')].sort().join('');
const englishChars=value=>compact(value).replace(/[^A-Za-z0-9]/g,'');
const out='visual-qa-output/bilingual-long-financial';
mkdirSync(out,{recursive:true});

(async()=>{
 for(const [engine,driver] of [['chromium',chromium],['webkit',webkit]]){
  const browser=await driver.launch({headless:true});
  try{
   for(const template of templates)for(const kind of ['invoice','purchase-order']){
    const page=await browser.newPage({viewport:{width:1280,height:900}});
    const errors=[];page.on('pageerror',err=>errors.push(err.message));
    const params=new URLSearchParams({lang:'en',template,long:'1',logo:'wide'});
    if(kind==='invoice')params.set('kind','invoice');
    await page.goto('http://127.0.0.1:4173/tests/visual/purchase-order-final-print.html?'+params);
    await page.emulateMedia({media:'print'});
    await page.waitForFunction(()=>document.querySelector('.print-portal .invoice-pages')?.dataset.paginationReady==='true',null,{timeout:25000});
    const initial=await page.evaluate(()=>window.qaSourceSnapshot());
    const original=JSON.parse(initial);
    assert.equal(original.kind,kind);
    assert.equal(original.appearance.templateId,template);
    assert.equal(original.items.length,40);
    // Clone the existing issued financial document and render the native
    // bilingual mode; the fixture's original data must remain untouched.
    await page.evaluate(async()=>{
     const issued=JSON.parse(window.qaSourceSnapshot());
     issued.language='bilingual';
     const {TemplateRenderer}=await import('/dist/src/templates/TemplateRenderer.js');
     window.qaBilingualSource=()=>JSON.stringify(issued);
     ReactDOM.render(React.createElement(TemplateRenderer,{document:issued,scale:1}),document.getElementById('qa-output'));
    });
    await page.waitForFunction(()=>{
     const root=document.querySelector('.print-portal .invoice-pages');
     const pages=[...(root?.querySelectorAll('.invoice-page')||[])];
     return root?.dataset.paginationReady==='true'&&pages.length>1&&pages.every(p=>p.classList.contains('lang-bilingual'));
    },null,{timeout:30000});
    await page.evaluate(async()=>{
     await document.fonts?.ready;
     await Promise.all([...document.querySelectorAll('.print-portal img')].map(img=>img.decode()));
     await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    });
    const source=await page.evaluate(()=>window.qaBilingualSource());
    const bilingual=JSON.parse(source);
    assert.equal(bilingual.language,'bilingual');
    assert.equal(bilingual.kind,kind);
    assert.equal(bilingual.status,'final');
    const root=page.locator('.print-portal .invoice-pages');
    assert.equal(await root.locator('.invoice-page:not(.template-'+template+')').count(),0,'each page must retain selected template');
    const pages=await root.locator('.invoice-page').count();
    assert.ok(pages>1&&pages<=30,'bilingual long A4 page range');
    const dom=compact(await root.innerText());
    assert.ok(dom.includes(original.number),'issued document number');
    assert.ok(dom.includes('440.00'),'unmodified tax-inclusive total');
    assert.ok(dom.includes(compact(bilingual.language==='bilingual'?(kind==='invoice'?bilingual.customerSnapshot.companyNameEn:bilingual.supplierSnapshot.nameEn):'')),'English party identity');
    assert.ok(dom.includes(compact(kind==='invoice'?bilingual.customerSnapshot.companyNameAr:bilingual.supplierSnapshot.nameAr)),'Arabic party identity');
    // Collate pagination continuation fragments per source item, excluding
    // intervening page headers/footers when checking full bilingual text.
    const domCells=await root.locator('tbody .description-cell').evaluateAll(cells=>{
     const parts={};
     for(const cell of cells){
      const id=cell.parentElement.dataset.sourceItemId;
      if(!parts[id])parts[id]={en:'',ar:''};
      parts[id].en+=' '+[...cell.querySelectorAll('.bidi-en')].map(span=>span.textContent).join(' ');
      parts[id].ar+=' '+[...cell.querySelectorAll('.bidi-ar')].map(span=>span.textContent).join(' ');
     }
     return parts;
    });
    for(let i=0;i<40;i++){
     const item=bilingual.items[i],rendered=domCells[item.id]||{en:'',ar:''};
     assert.ok(dom.includes('PO-LINE-'+String(i+1).padStart(3,'0')),'English line marker '+i);
     assert.ok(dom.includes('بند'+String(i+1).padStart(3,'0')),'Arabic line marker '+i);
     assert.equal(englishChars(rendered.en),englishChars(item.descriptionEn),'complete English DOM description '+i);
     assert.equal(arGlyphs(rendered.ar),arGlyphs(item.descriptionAr),'complete Arabic DOM description '+i);
    }
    if(engine==='chromium'){
     const pdf=await page.pdf({format:'A4',printBackground:true,preferCSSPageSize:true,margin:{top:'0',bottom:'0',left:'0',right:'0'}});
     assert.equal(pdf.subarray(0,5).toString(),'%PDF-','native PDF magic');
     writeFileSync(out+'/'+template+'-'+kind+'.pdf',pdf);
     const cells=await root.locator('.invoice-page').evaluateAll(sheets=>sheets.map(sheet=>{
      const rect=sheet.getBoundingClientRect();
      return [...sheet.querySelectorAll('tbody .description-cell')].map(cell=>{
       const bands=[...cell.querySelectorAll('.bidi-en,.bidi-ar')].map(span=>{
        const r=span.getBoundingClientRect();
        return {lang:span.classList.contains('bidi-en')?'en':'ar',left:(r.left-rect.left)/rect.width,right:(r.right-rect.left)/rect.width,top:(r.top-rect.top)/rect.height,bottom:(r.bottom-rect.top)/rect.height};
       });
       return {id:cell.parentElement.dataset.sourceItemId,bands};
      });
     }));
     const parsed=await page.evaluate(async ({data,cells})=>{
      const pdfjs=await import('/dist/vendor/pdf.mjs');
      pdfjs.GlobalWorkerOptions.workerSrc='/dist/vendor/pdf.worker.mjs';
      const file=await pdfjs.getDocument({data:Uint8Array.from(atob(data),x=>x.charCodeAt(0))}).promise;
      const descriptions={},allPages=[];
      for(let index=0;index<file.numPages;index++){
       const pdfPage=await file.getPage(index+1);
       const text=await pdfPage.getTextContent(),size=pdfPage.getViewport({scale:1});
       allPages.push(text.items.map(item=>item.str||'').join(' '));
       for(const cell of cells[index]){
        if(!descriptions[cell.id])descriptions[cell.id]={en:'',ar:''};
        for(const band of cell.bands){
         const value=text.items.filter(item=>{
          if(!item.str)return false;
          const x=(item.transform[4]+item.width/2)/size.width,y=1-(item.transform[5]+item.height/3)/size.height;
          return x>=band.left-.001&&x<=band.right+.001&&y>=band.top-.001&&y<=band.bottom+.001;
         }).map(item=>item.str).join(' ');
         descriptions[cell.id][band.lang]+=' '+value;
        }
       }
      }
      const result={pages:file.numPages,allPages,descriptions};
      await file.destroy();return result;
     },{data:pdf.toString('base64'),cells});
     assert.equal(parsed.pages,pages,'PDF/A4 page count matches renderer');
     assert.ok(parsed.allPages.every(t=>t.trim()),'no blank native PDF pages');
     const pdfContent=compact(parsed.allPages.join(' '));
     assert.ok(pdfContent.includes(original.number),'document number in PDF');
     assert.ok(pdfContent.includes('440.00'),'correct final total in PDF');
     assert.ok(!pdfContent.includes('QA-APP-CONTROL-LEAK'),'app controls excluded from PDF');
     for(let i=0;i<40;i++){
      const text=parsed.descriptions['po-long-'+i]||{en:'',ar:''};
      const en=original.items[i].descriptionEn,ar=original.items[i].descriptionAr;
      assert.equal(englishChars(text.en),englishChars(en),'English PDF description complete '+i);
      assert.equal(arGlyphs(text.ar),arGlyphs(ar),'Arabic PDF description glyphs complete '+i);
      const marker='PO-LINE-'+String(i+1).padStart(3,'0');
      assert.equal(pdfContent.split(marker).length-1,1,'bilingual PDF line exactly once '+i);
     }
    }
    assert.equal(await page.evaluate(()=>window.qaSourceSnapshot()),initial,'original fixture remains immutable');
    assert.equal(await page.evaluate(()=>window.qaBilingualSource()),source,'bilingual renderer does not mutate issued document');
    assert.deepEqual(errors,[],'no JavaScript page errors');
    console.log('PASS bilingual final '+kind+' '+template+' '+engine+' 40 descriptions');
    await page.close();
   }
  }finally{await browser.close();}
 }
})().catch(err=>{console.error(err);process.exitCode=1});
