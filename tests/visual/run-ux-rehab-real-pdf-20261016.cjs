const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const {mkdirSync,writeFileSync}=require('node:fs');
const {execFileSync}=require('node:child_process');
const out='visual-qa-output/ux-rehab-real-pdf';
const base='http://127.0.0.1:4173/tests/visual/ux-rehab-real-pdf-output-20261016.html';
(async()=>{
 mkdirSync(out,{recursive:true});
 const browser=await chromium.launch({headless:true});
 try{
  for(const language of ['en','ar']){
   const page=await browser.newPage({viewport:{width:1280,height:900},deviceScaleFactor:1});
   const exceptions=[];page.on('pageerror',e=>exceptions.push(e.message));
   try{
    await page.goto(base+'?lang='+language,{waitUntil:'load'});
    await page.emulateMedia({media:'print'});
    await page.waitForFunction(()=>{
      const root=document.querySelector('.print-portal .invoice-pages');
      return Boolean(root&&root.dataset.paginationReady==='true'&&root.querySelectorAll('.invoice-page').length);
    },null,{timeout:25000});
    await page.evaluate(()=>document.fonts?.ready);
    const metrics=await page.evaluate(()=>{
      const printRoot=document.querySelector('.print-portal .invoice-pages');
      const pages=[...printRoot.querySelectorAll('.invoice-page')];
      return {pages:pages.length,visibleItems:printRoot.dataset.sourceItemCount,
       pageText:pages.map(p=>p.innerText).join(' ').replace(/\s+/g,' '),
       totals:window.qaPrintable?.totals,number:window.qaPrintable?.number};
    });
    assert.equal(metrics.visibleItems,'2','real invoice renderer must contain both source lines');
    assert.ok(metrics.pages>=1&&metrics.pages<=4,'valid document pages '+language);
    assert.equal(metrics.totals?.grandTotal,'357.50','grand total should retain exact tax math');
    assert.ok(metrics.pageText.includes(metrics.number),'printed content must include invoice number '+language);
    assert.ok(metrics.pageText.includes('357.50'),'printed DOM must show the 357.50 total '+language);
    const pdf=await page.pdf({format:'A4',preferCSSPageSize:true,printBackground:true,margin:{top:'0',bottom:'0',left:'0',right:'0'}});
    const target=out+'/invoice-'+language+'.pdf';
    writeFileSync(target,pdf);
    assert.equal(pdf.subarray(0,5).toString(),'%PDF-','browser must create an actual PDF');
    assert.ok(pdf.length>10000,'PDF cannot be blank/tiny '+language);
    const info=execFileSync('pdfinfo',[target],{encoding:'utf8'});
    const count=Number(info.match(/^Pages:\s+(\d+)/m)?.[1]||0);
    assert.ok(count>=1&&count<=4,'PDF must have page(s): '+language+' '+info.slice(0,300));
    const dimensions=info.match(/^Page size:\s+([\d.]+) x ([\d.]+) pts/m);
    assert.ok(dimensions,'PDF page geometry must be reported '+language);
    assert.ok(Math.abs(Number(dimensions[1])-595.28)<3&&Math.abs(Number(dimensions[2])-841.89)<3,'A4 page geometry '+language);
    const actualText=execFileSync('pdftotext',['-layout',target,'-'],{encoding:'utf8'});
    assert.ok(actualText.includes('INV-QA-2026-010'),'extracted PDF should preserve actual invoice number '+language);
    assert.match(actualText,/357[,.]50/,'extracted PDF must retain total 357.50 '+language);
    assert.equal(exceptions.length,0,'uncaught template runtime errors '+language+' '+exceptions.join(' | '));
    await page.screenshot({path:out+'/invoice-'+language+'.png',fullPage:false,animations:'disabled'});
    console.log('PASS actual PDF A4 render and text verification',language,JSON.stringify({bytes:pdf.length,pages:count,totals:metrics.totals}));
   }finally{await page.close();}
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
