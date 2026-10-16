const {webkit}=require('playwright');
const assert=require('node:assert/strict');
const {mkdirSync}=require('node:fs');
const output='visual-qa-output/ux-rehab-document-webkit';
const cases=[
 {w:320,h:700,lang:'ar',theme:'dark'},
 {w:390,h:844,lang:'en',theme:'dark'},
 {w:430,h:932,lang:'ar',theme:'light'},
 {w:1280,h:900,lang:'en',theme:'light'},
];
(async()=>{
 mkdirSync(output,{recursive:true});
 const browser=await webkit.launch({headless:true});
 try{
  // A real React host commit after the watchdog's 12s timeout used to throw
  // NotFoundError because recovery replaced the loading component's children.
  {
   const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   try{
    await page.goto('http://127.0.0.1:4173/tests/visual/ux-rehab-startup-late-hydration-20261016.html');
    const original=await page.locator('#root').innerHTML();
    await page.locator('#lourex-startup-recovery').waitFor({timeout:18000});
    assert.equal(await page.locator('#root').innerHTML(),original,'timeout must preserve React-owned host nodes');
    await page.evaluate(()=>window.finishStartup());
    await page.locator('#lourex-startup-recovery').waitFor({state:'detached'});
    await page.getByRole('textbox',{name:'Test editor'}).fill('Late startup works');
    assert.equal(errors.length,0,'late React hydration must not throw '+errors.join(' | '));
    await page.screenshot({path:output+'/startup-late-hydration.png'});
    console.log('PASS WebKit late React startup after recovery timeout');
   }finally{await page.close();}
  }
  for(const c of cases){
   const key=[c.w,c.lang,c.theme].join('-');
   const page=await browser.newPage({viewport:{width:c.w,height:c.h},hasTouch:c.w<700,isMobile:c.w<700});
   const failures=[];
   page.on('pageerror',err=>failures.push(err.message));
   try{
    await page.goto('http://127.0.0.1:4173/tests/visual/ux-rehab-documents-create-20261016.html?lang='+c.lang+'&theme='+c.theme,{waitUntil:'load'});
    const entry=page.locator('.ta-documents-create-entry');
    await entry.waitFor({state:'visible',timeout:12000});
    assert.equal(await entry.count(),1,'one grouped document creator '+key);
    await entry.click();
    const opts=page.locator('.lx-document-create-dialog .ta-documents-create-choices');
    await opts.waitFor({state:'visible',timeout:10000});
    assert.equal(await opts.locator('button').count(),8,'eight standard creation types '+key);
    const geometry=await opts.evaluate(el=>{
      const r=el.getBoundingClientRect(),s=getComputedStyle(el);
      return{left:r.left,right:r.right,width:r.width,scroll:el.scrollHeight,client:el.clientHeight,overflowY:s.overflowY};
    });
    assert.ok(geometry.left>=-1&&geometry.right<=c.w+1,'menu fits viewport '+key+' '+JSON.stringify(geometry));
    assert.equal(await opts.evaluate(el=>{const button=el.querySelector('button'),r=button.getBoundingClientRect();return document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)?.closest('button')===button;}),true,'chooser must receive touches above document cards '+key);
    await opts.locator('button').first().click();
    assert.deepEqual(await page.evaluate(()=>window.qaDocumentChoices),['proforma'],'quote uses existing document callback '+key);
    await page.screenshot({path:output+'/'+key+'-create.png',fullPage:false,animations:'disabled'});
    assert.equal(failures.length,0,'runtime errors '+key+' '+failures.join(' | '));
    console.log('PASS WebKit documents grouped creator',key);
   }finally{await page.close();}
  }
  for(const c of cases.slice(0,3)){
   const key=[c.w,c.lang,c.theme].join('-');
   const page=await browser.newPage({viewport:{width:c.w,height:c.h},hasTouch:true,isMobile:true});
   const errors=[];page.on('pageerror',err=>errors.push(err.message));
   try{
    await page.goto('http://127.0.0.1:4173/tests/visual/editor-keyboard-batch1.html?lang='+c.lang,{waitUntil:'load'});
    await page.locator('.editor-document-elements').waitFor({state:'attached',timeout:15000});
    const result=await page.evaluate(()=>{
      const sections=[...document.querySelectorAll('.editor-screen .editor-section')];
      const headings=sections.map(el=>(el.querySelector('.section-heading h2')?.textContent||'').trim());
      const design=document.querySelector('.editor-document-elements');
      const template=document.querySelector('.editor-section .template-thumbnails')||document.querySelector('[class*=template-thumbnails]');
      const approval=design?.querySelector('.appearance-toggles');
      const bank=design?.querySelector('select');
      const all=document.querySelectorAll('.editor-document-elements .appearance-toggles');
      const tableColumns=document.querySelectorAll('.editor-screen .appearance-table-columns');
      return {headings,sectionContents:sections.map(el=>el.innerText?.slice(0,55)),approvalCount:all.length,columnControls:tableColumns.length,bank:!!bank,bankFont:bank?parseFloat(getComputedStyle(bank).fontSize):0,hasApproval:!!approval,templateOrder:!!template?Boolean(design.compareDocumentPosition(template)&Node.DOCUMENT_POSITION_FOLLOWING):true,scrollWidth:document.documentElement.scrollWidth,viewport:innerWidth};
    });
    const terms=result.headings.findIndex(x=>/Commercial Terms|الشروط التجارية/.test(x));
    const totals=result.headings.findIndex(x=>/Totals|الإجماليات/.test(x));
    const design=result.headings.findIndex(x=>/Design|التصميم/.test(x));
    assert.ok(terms>=0&&totals>terms&&design>totals,'section order '+key+' '+JSON.stringify(result.headings));
    assert.equal(result.approvalCount,1,'approval display toggles unique '+key);
    assert.equal(result.columnControls,1,'separate HS/origin/packing table options preserved '+key);
    assert.equal(result.bank,true,'bank select before template '+key);
    assert.equal(result.hasApproval,true,'signature and stamp controls present '+key);
    assert.equal(result.templateOrder,true,'visual templates after approvals '+key);
    assert.ok(result.bankFont>=16,'Safari select text at least 16px '+key+' '+result.bankFont);
    assert.ok(result.scrollWidth<=result.viewport+1,'editor width must fit phone '+key);
    assert.equal(errors.length,0,'runtime errors '+key+' '+errors.join('|'));
    await page.locator('.editor-document-elements').scrollIntoViewIfNeeded();
    await page.screenshot({path:output+'/'+key+'-editor.png',fullPage:false,animations:'disabled'});
    console.log('PASS WebKit editor sequencing',key);
   }finally{await page.close();}
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
