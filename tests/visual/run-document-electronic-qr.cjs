const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const {mkdirSync,writeFileSync}=require('node:fs');
const {execFileSync}=require('node:child_process');
const jsQR=require('jsqr');
const out='visual-qa-output/document-electronic-qr';mkdirSync(out,{recursive:true});
(async()=>{
 const launch={headless:true};
 if(process.env.LOUREX_QA_CHROMIUM){launch.executablePath=process.env.LOUREX_QA_CHROMIUM;launch.args=['--no-sandbox','--single-process','--disable-gpu','--disable-software-rasterizer','--use-gl=disabled'];}
 const browser=await chromium.launch(launch);
 const p=await browser.newPage();
 try{
  for(const lang of ['en','ar'])for(const width of [320,390,430]){
   await p.setViewportSize({width,height:844});const errors=[];p.on('pageerror',e=>errors.push(e.message));
   await p.goto('http://127.0.0.1:4173/tests/visual/document-electronic-qr.html?lang='+lang,{waitUntil:'load'});
   await p.locator('.lx-electronic-totals .is-total').waitFor();
   assert.match(await p.locator('.lx-electronic-totals .is-total').innerText(),/500.00/);
   assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'mobile overflow');
   assert.equal(await p.locator('.lx-electronic-products li').count(),2);assert.deepEqual(errors,[]);
   await p.screenshot({path:`${out}/mobile-${lang}-${width}.png`,fullPage:true});
  }
  for(const lang of ['en','ar'])for(const kind of ['proforma','invoice'])for(const count of [2,38]){
   await p.setViewportSize({width:1100,height:1200});const errors=[];p.on('pageerror',e=>errors.push(e.message));
   const key=`${kind}-${lang}-${count}`;
   await p.goto(`http://127.0.0.1:4173/tests/visual/document-electronic-qr.html?view=pdf&lang=${lang}&kind=${kind}&items=${count}`,{waitUntil:'load'});
   await p.emulateMedia({media:'print'});
   await p.waitForFunction(()=>document.querySelector('.invoice-pages')?.dataset.paginationReady==='true',null,{timeout:20000});
   assert.equal(await p.locator('.invoice-page .lx-document-qr').count(),1);
   const layout=await p.evaluate(()=>[...document.querySelectorAll('.invoice-page')].map(page=>{const footer=page.querySelector('.doc-footer'),body=page.querySelector('.doc-body');return {bottom:Math.max(...[...body.querySelectorAll('*')].map(n=>n.getBoundingClientRect().bottom)),footer:footer.getBoundingClientRect().top};}));
   for(const page of layout)assert.ok(page.bottom<=page.footer+1,'content overlaps QR footer: '+JSON.stringify(page));
   const decoded=await p.locator('.lx-document-qr img').evaluate(async img=>{await img.decode();const canvas=document.createElement('canvas');canvas.width=img.naturalWidth;canvas.height=img.naturalHeight;const c=canvas.getContext('2d');c.drawImage(img,0,0);return {data:[...c.getImageData(0,0,canvas.width,canvas.height).data],size:canvas.width};});
   const expected=await p.locator('.lx-document-qr').getAttribute('href');assert.equal(jsQR(new Uint8ClampedArray(decoded.data),decoded.size,decoded.size)?.data,expected);
   const pdf=await p.pdf({format:'A4',preferCSSPageSize:true,printBackground:true});writeFileSync(`${out}/${key}.pdf`,pdf);
   const text=execFileSync('pdftotext',['-layout',`${out}/${key}.pdf`,'-'],{encoding:'utf8'});
   assert.match(text,/QR-QA-001/);assert.ok(text.includes(count===2?'500.00':'9,500.00'),'PDF accounting total');
   assert.ok(pdf.includes(Buffer.from('/URI')),'PDF electronic link annotation');assert.deepEqual(errors,[]);
   if(count===2){
    // QR lives in the document's normal closing flow. Crop from its measured
    // position rather than assuming it is always within the last 420 pixels.
    const qrRegion=await p.locator('.lx-document-qr img').evaluate(img=>{
      const page=img.closest('.invoice-page'),rect=page.getBoundingClientRect(),qr=img.getBoundingClientRect();
      return {x:(qr.left-rect.left)/rect.width,y:(qr.top-rect.top)/rect.height,
        width:qr.width/rect.width,height:qr.height/rect.height};
    });
    await p.emulateMedia({media:'screen'});
    const encoded=await p.evaluate(async()=>{const file=await window.__LOUREX_BUILD_CHAT_PDF__(document.querySelector('.print-portal'),'QR-export');return await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result.split(',')[1]);r.onerror=reject;r.readAsDataURL(file);});});
    const exported=Buffer.from(encoded,'base64'),target=`${out}/export-${key}.pdf`;writeFileSync(target,exported);
    assert.ok(exported.includes(Buffer.from('/URI')),'iPhone PDF bridge keeps clickable electronic link');
    const ppm=execFileSync('pdftoppm',['-singlefile','-r','150',target],{maxBuffer:20000000});
    const header=ppm.subarray(0,100).toString('ascii').match(/^P6\s+(\d+)\s+(\d+)\s+255\s/);assert.ok(header,'PDF raster should be PPM');
    const w=Number(header[1]),h=Number(header[2]),margin=.018;
    const x0=Math.max(0,Math.floor((qrRegion.x-margin)*w));
    const y0=Math.max(0,Math.floor((qrRegion.y-margin)*h));
    const x1=Math.min(w,Math.ceil((qrRegion.x+qrRegion.width+margin)*w));
    const y1=Math.min(h,Math.ceil((qrRegion.y+qrRegion.height+margin)*h));
    const cw=x1-x0,ch=y1-y0;
    assert.ok(cw>15&&ch>15,'measured exported QR region must have printable area');
    const rgba=new Uint8ClampedArray(cw*ch*4),offset=header[0].length;
    for(let y=0;y<ch;y++)for(let x=0;x<cw;x++){
      const source=offset+((y+y0)*w+(x+x0))*3,dest=(y*cw+x)*4;
      rgba[dest]=ppm[source];rgba[dest+1]=ppm[source+1];rgba[dest+2]=ppm[source+2];rgba[dest+3]=255;
    }
    assert.equal(jsQR(rgba,cw,ch)?.data,expected,'QR must decode from actual exported PDF pixels');
   }
   await p.screenshot({path:`${out}/${key}.png`,fullPage:true});
  }
  await p.emulateMedia({media:'screen'});await p.setViewportSize({width:390,height:844});
  await p.goto('http://127.0.0.1:4173/tests/visual/document-electronic-qr.html?view=portal&lang=en',{waitUntil:'load'});
  await p.locator('.lx-public-mobile-document').waitFor();
  await p.getByRole('button',{name:'Original / PDF',exact:true}).click();
  await p.waitForFunction(()=>document.querySelector('.lx-public-document-shell .invoice-pages')?.dataset.paginationReady==='true');
  await p.getByRole('button',{name:'Electronic view',exact:true}).click();
  await p.getByRole('button',{name:'Print / Save PDF',exact:true}).click();
  await p.waitForFunction(()=>window.qaPrintCount===1);
  await p.evaluate(()=>window.qaRevoke());
  await p.getByRole('button',{name:'Print / Save PDF',exact:true}).click();
  await p.locator('.lx-public-error[role="alert"]').waitFor();
  assert.equal(await p.evaluate(()=>window.qaPrintCount),1,'revocation must prevent another PDF export');
  console.log('PASS electronic document mobile, QR decode from actual PDF, links, totals, multipage footer, portal preview and revocation');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
