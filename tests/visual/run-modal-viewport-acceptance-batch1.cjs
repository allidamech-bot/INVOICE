const {chromium,webkit}=require('playwright');
const assert=require('node:assert/strict');
const {mkdirSync}=require('node:fs');

(async()=>{
 mkdirSync('visual-qa-output/modal-viewport-acceptance-batch1',{recursive:true});
 for(const [engine,width,language] of [[chromium,900,'en'],[webkit,320,'ar'],[webkit,901,'ar'],[webkit,1024,'en']]){
  const browser=await engine.launch({headless:true});
  try{
   const page=await browser.newPage({viewport:{width,height:844},hasTouch:true});
   page.setDefaultTimeout(8000);
   await page.addInitScript(()=>{
    const viewport=new EventTarget();window.acceptanceViewport={height:844,offsetTop:0};
    for(const key of ['height','offsetTop'])Object.defineProperty(viewport,key,{get:()=>window.acceptanceViewport[key]});
    Object.defineProperty(window,'visualViewport',{configurable:true,value:viewport});
   });
   await page.goto(`http://127.0.0.1:4173/tests/visual/modal-viewport-acceptance-batch1.html?lang=${language}`,{waitUntil:'networkidle'});
   await page.getByRole('button',{name:'Open form',exact:true}).click();
   await page.evaluate(()=>{window.acceptanceViewport.height=360;window.acceptanceViewport.offsetTop=20;visualViewport.dispatchEvent(new Event('resize'));});
   const modal=page.locator('.modal');
   const rect=await modal.evaluate(element=>element.getBoundingClientRect().toJSON());
   assert.ok(rect.top>=19&&rect.bottom<=381,`${engine.name()} ${width}: dialog outside keyboard-visible bounds ${JSON.stringify(rect)}`);
   const input=page.getByRole('textbox',{name:'Field 20',exact:true});await input.scrollIntoViewIfNeeded();await input.fill('Reviewed value');
   const field=await input.boundingBox(),body=await page.locator('.modal-body').boundingBox();
   assert.ok(field.y>=body.y-1&&field.y+field.height<=body.y+body.height+1,'last input reachable within actual scroll owner');
   await page.evaluate(()=>{window.acceptanceViewport.height=190;visualViewport.dispatchEvent(new Event('resize'));});
   await input.scrollIntoViewIfNeeded();
   const compactField=await input.boundingBox(),compactBody=await page.locator('.modal-body').boundingBox();
   const compactLayout=await modal.evaluate(element=>({header:element.querySelector('.modal-header').getBoundingClientRect().toJSON(),footer:element.querySelector('.modal-footer').getBoundingClientRect().toJSON(),bodyStyle:getComputedStyle(element.querySelector('.modal-body')).padding,field:element.querySelector('input').getBoundingClientRect().height}));
   assert.ok(compactField.y>=compactBody.y-1&&compactField.y+compactField.height<=compactBody.y+compactBody.height+1,`${engine.name()} ${width}: input clipped in short keyboard viewport ${JSON.stringify({compactField,compactBody,compactLayout})}`);
   const save=await page.getByRole('button',{name:'Save reviewed',exact:true}).boundingBox();
   assert.ok(save.height>=44&&save.y>=20&&save.y+save.height<=211,'short viewport retains reachable 44px save action');
   const primaryLabel=await page.getByRole('button',{name:'Save reviewed',exact:true}).evaluate(element=>({button:getComputedStyle(element).color,label:getComputedStyle(element.querySelector('span')).color}));
   assert.equal(primaryLabel.label,primaryLabel.button,'primary action label retains its approved foreground rather than muted modal text');
   await page.screenshot({path:`visual-qa-output/modal-viewport-acceptance-batch1/${engine.name()}-${width}-${language}-short.png`,clip:{x:0,y:20,width,height:190},animations:'disabled'});
   await page.evaluate(()=>{window.acceptanceViewport.height=360;visualViewport.dispatchEvent(new Event('resize'));});
   await page.getByRole('button',{name:'Nested review',exact:true}).click();
   assert.equal(await page.locator('.modal').count(),2);
   assert.equal(await page.evaluate(()=>document.body.style.overflow),'hidden');
   await page.getByRole('button',{name:'Approve review',exact:true}).click();
   assert.equal(await page.locator('.modal').count(),1);
   assert.equal(await page.evaluate(()=>document.body.style.overflow),'hidden','nested close cannot release outer lock');
   await page.getByRole('button',{name:'Save reviewed',exact:true}).click();
   assert.equal(await page.evaluate(()=>window.modalAcceptance.saved),1);
   assert.equal(await page.evaluate(()=>document.body.style.overflow),'','last close restores original scroll');
  }finally{await browser.close();}
 }
 const browser=await webkit.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  page.setDefaultTimeout(8000);
  await page.addInitScript(()=>{
   const viewport=new EventTarget();window.acceptanceViewport={height:620,offsetTop:20};
   for(const key of ['height','offsetTop'])Object.defineProperty(viewport,key,{get:()=>window.acceptanceViewport[key]});
   Object.defineProperty(window,'visualViewport',{configurable:true,value:viewport});
  });
  await page.goto('http://127.0.0.1:4173/tests/visual/workspace-ux-batch3.html?lang=ar&theme=dark',{waitUntil:'networkidle'});
  const nav=await page.locator('.ta-mobile-nav').boundingBox();
  assert.ok(nav.y>=20&&nav.y+nav.height<=641,'bottom navigation stays above Safari chrome');
  await page.locator('button[aria-controls="ta-mobile-more"]').click();
  const sheet=page.locator('#ta-mobile-more');await sheet.waitFor({state:'visible'});
  const rect=await sheet.evaluate(element=>element.getBoundingClientRect().toJSON());
  assert.ok(rect.top>=19&&rect.bottom<=641,`More sheet outside actual Safari viewport ${JSON.stringify(rect)}`);
  await sheet.evaluate(element=>{element.scrollTop=element.scrollHeight;});
  await sheet.locator('button').last().click({trial:true});
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(()=>document.documentElement.dataset.lourexShellOverlay||''),'','More releases scroll lock');
  await page.evaluate(()=>window.fixture.setState({newMenu:true}));
  const create=page.locator('#ta-mobile-create-menu');await create.waitFor({state:'visible'});
  const createBox=await create.boundingBox();assert.ok(createBox.y>=20&&createBox.y+createBox.height<=641,'existing document Create menu stays above Safari chrome');
  await create.evaluate(element=>{element.scrollTop=element.scrollHeight;});
  await create.getByRole('menuitem').last().click({trial:true});
  await page.keyboard.press('Escape');await create.waitFor({state:'hidden'});
  assert.equal(await page.evaluate(()=>document.documentElement.dataset.lourexShellOverlay||''),'','document Create releases scroll lock');
  await page.goto('http://127.0.0.1:4173/tests/visual/obsidian-settings.html?lang=ar&scope=settings',{waitUntil:'networkidle'});
  await page.evaluate(()=>{document.documentElement.dataset.uiTheme='dark';});
  await page.locator('.ta-settings-nav button').filter({hasText:'المستندات'}).click();
  const numbering=page.locator('.ta-settings-card').filter({has:page.locator('.ta-numbering-preview')});
  await page.evaluate(()=>{window.acceptanceViewport.height=190;visualViewport.dispatchEvent(new Event('resize'));});
  const prefix=numbering.locator('input').first();await prefix.scrollIntoViewIfNeeded();await prefix.fill('QT');
  const inputBox=await prefix.boundingBox();
  assert.ok(inputBox.y>=20&&inputBox.y+inputBox.height<=211,'actual Settings input remains keyboard-visible');
  assert.ok(await prefix.evaluate(element=>{const rect=element.getBoundingClientRect();return document.elementFromPoint(rect.left+rect.width/2,rect.top+rect.height/2)===element;}),'Settings input cannot be clipped by a zero-height nested pane');
  await prefix.click({trial:true});
  await numbering.getByRole('button').click();
  await page.waitForFunction(()=>window.savedSettings?.numbering.proformaPrefix==='QT');
  await page.locator('.modal-header button').click();
  assert.equal(await page.evaluate(()=>document.body.style.overflow),'','Settings close releases modal lock');
 }finally{await browser.close();}
 console.log('Batch 1 tablet/phone modal, nested locks and Safari sheet viewport acceptance: PASS');
})().catch(error=>{console.error(error);process.exitCode=1;});
