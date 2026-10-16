const {chromium}=require('playwright');
const assert=require('node:assert/strict');const{mkdirSync}=require('node:fs');
const out='visual-qa-output/automatic-document-electronic-copy';mkdirSync(out,{recursive:true});
(async()=>{
 const launch={headless:true};if(process.env.LOUREX_QA_CHROMIUM){launch.executablePath=process.env.LOUREX_QA_CHROMIUM;launch.args=['--no-sandbox','--single-process','--disable-gpu','--disable-software-rasterizer','--use-gl=disabled'];}
 const browser=await chromium.launch(launch),p=await browser.newPage();
 try{
  for(const c of [{w:320,lang:'ar'},{w:390,lang:'en'},{w:430,lang:'ar'}]){
   await p.setViewportSize({width:c.w,height:844});const errors=[];p.on('pageerror',e=>errors.push(e.message));
   await p.goto(`http://127.0.0.1:4173/tests/visual/ux-rehab-documents-create-20261016.html?lang=${c.lang}&theme=dark&populated=1`,{waitUntil:'load'});
   await p.locator('.lx-document-online-action').waitFor({state:'visible'});
   await p.locator('.ta-documents-create-entry').click();const choices=p.locator('.lx-document-create-dialog .ta-documents-create-choices');await choices.waitFor();
   assert.equal(await choices.locator('button').count(),8);
   for(const index of [0,7]){const button=choices.locator('button').nth(index);await button.scrollIntoViewIfNeeded();assert.equal(await button.evaluate(el=>{const r=el.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight&&document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)?.closest('button')===el;}),true,'first/last choice must receive touch above underlying cards');}
   assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
   await p.screenshot({path:`${out}/chooser-${c.lang}-${c.w}.png`,fullPage:false});await choices.locator('button').first().click();assert.deepEqual(await p.evaluate(()=>window.qaDocumentChoices),['proforma']);assert.equal(await p.getByRole('dialog').count(),0);
   for(const kind of ['proforma','invoice']){
    await p.goto(`http://127.0.0.1:4173/tests/visual/automatic-document-electronic-copy.html?lang=${c.lang}&kind=${kind}`,{waitUntil:'load'});await p.waitForFunction(()=>window.qaReady);
    for(const mode of ['pdf','print','share'])await p.evaluate(mode=>window.qaNormalOutput(mode),mode);
    const first=await p.evaluate(()=>window.qaPrints[0]);assert.ok(first.includes('/share.html#'));assert.equal(new Set(await p.evaluate(()=>window.qaPrints)).size,1,'ordinary output reuses one QR');
    assert.equal(await p.evaluate(()=>[...window.qaRecords.keys()].filter(k=>k.startsWith('publicShares/')).length),1);
    await p.evaluate(()=>window.qaChangeQuantity());await p.evaluate(()=>window.qaNormalOutput('pdf'));assert.notEqual(await p.evaluate(()=>window.qaPrints.at(-1)),first);
    const token=first.split('#')[1];assert.equal(await p.evaluate(token=>window.qaRecords.get('publicShares/'+token).snapshot.items[0].quantity,token),'10','old QR retains original version');
    await p.evaluate(()=>window.qaManage());await p.locator('.lx-electronic-management .lx-document-qr').waitFor();await p.screenshot({path:`${out}/active-${kind}-${c.lang}-${c.w}.png`,fullPage:false});await p.getByRole('button',{name:/Disable QR link|إيقاف رابط QR/}).click();
    await p.evaluate(async()=>{try{await window.qaNormalOutput('pdf');}catch(e){window.qaRejected=e.message;}});assert.match(await p.evaluate(()=>window.qaRejected),/disabled or expired|متوقف أو منتهي/);
    assert.deepEqual(errors,[]);await p.evaluate(()=>document.querySelector('.lourex-ios-output-cancel')?.click());await p.screenshot({path:`${out}/management-${kind}-${c.lang}-${c.w}.png`,fullPage:false});
   }
  }
  console.log('PASS actual ordinary App PDF/print/share automatic QR, stable revisions, manager, revocation, and root-portal chooser touch hit testing');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
