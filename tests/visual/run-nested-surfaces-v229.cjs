const {chromium}=require('playwright');
const assert=require('node:assert/strict');

const BASE='http://127.0.0.1:4173/tests/visual';
const MATTE={shell:'rgb(11, 11, 11)',workspace:'rgb(14, 14, 14)',surface:'rgb(20, 20, 20)',strong:'rgb(25, 25, 25)',selected:'rgb(32, 32, 32)',secondary:'rgb(26, 26, 26)',input:'rgb(16, 16, 16)'};

function isLight(background){
  const rgba=background.match(/[\d.]+/g)?.map(Number)||[];
  if(rgba.length<3||rgba[3]===0)return false;
  return rgba[0]>210&&rgba[1]>210&&rgba[2]>210;
}

async function noLightChrome(page,rootSelector,label,ignore=''){
  const light=await page.locator(rootSelector).evaluate((root,ignoreSelector)=>{
    const result=[];
    for(const el of root.querySelectorAll('*')){
      if(ignoreSelector&&el.closest(ignoreSelector))continue;
      const r=el.getBoundingClientRect(),css=getComputedStyle(el),rgba=css.backgroundColor.match(/[\d.]+/g)?.map(Number)||[];
      if(!r.width||!r.height||css.display==='none'||css.visibility==='hidden'||rgba.length<3||rgba[3]===0)continue;
      if(rgba[0]>210&&rgba[1]>210&&rgba[2]>210)result.push(`${el.tagName}.${el.className}:${css.backgroundColor}`);
    }
    return [...new Set(result)];
  },ignore);
  assert.deepEqual(light,[],`${label}: legacy light nested chrome ${JSON.stringify(light)}`);
}

async function assertBackground(page,selector,expected,label,{optional=false}={}){
  const locator=page.locator(selector);
  const count=await locator.count();
  if(!count){if(optional)return;throw new Error(`${label}: missing ${selector}`);}
  const values=await locator.evaluateAll(nodes=>nodes.map(node=>getComputedStyle(node).backgroundColor));
  assert.ok(values.every(value=>expected.includes(value)),`${label}: ${selector} backgrounds ${JSON.stringify(values)} expected ${JSON.stringify(expected)}`);
}

async function auditEditor(browser,viewport,lang,kind){
  const page=await browser.newPage({viewport:{width:viewport,height:viewport<=430?844:1000},hasTouch:viewport<=820,isMobile:viewport<=820});
  const label=`editor/${viewport}/${lang}/${kind}`;
  try{
    await page.goto(`${BASE}/obsidian-editor.html?lang=${lang}&kind=${kind}`,{waitUntil:'load'});
    await page.locator('.editor-section').first().waitFor();
    await assertBackground(page,'.premium-selected-customer',['rgba(0, 0, 0, 0)'],label,{optional:true});
    await assertBackground(page,'.premium-item-card>header',[MATTE.strong],label);
    await assertBackground(page,'.item-line-total',[MATTE.selected],label);
    await assertBackground(page,'.item-pricing-grid',['rgba(0, 0, 0, 0)'],label);
    await assertBackground(page,'.editor-totals',['rgba(0, 0, 0, 0)'],label);
    await assertBackground(page,'.product-metadata-suggestions button',[MATTE.strong,MATTE.selected],label,{optional:true});
    await assertBackground(page,'.commercial-preset-chips button',[MATTE.strong,MATTE.selected],label,{optional:true});
    const images=await page.locator('.editor-pane').evaluate(root=>[...root.querySelectorAll('.premium-selected-customer,.premium-item-card>header,.item-line-total,.recent-customer-row button,.commercial-preset-chips button,.product-metadata-suggestions button')].map(el=>getComputedStyle(el).backgroundImage).filter(value=>value!=='none'));
    assert.deepEqual(images,[],`${label}: nested editor gradients ${JSON.stringify(images)}`);
    await noLightChrome(page,'.editor-pane',label,'.invoice-page,.invoice-pages,.template-mini,.template-thumbnail,.toggle>span');
  }finally{await page.close();}
}

async function auditCustomers(browser,viewport,lang){
  const page=await browser.newPage({viewport:{width:viewport,height:viewport<=430?844:900},hasTouch:viewport<=820,isMobile:viewport<=820});
  const label=`customers/${viewport}/${lang}`;
  try{
    await page.goto(`${BASE}/obsidian-functional-customers-v196.html?lang=${lang}`,{waitUntil:'load'});
    await page.locator('.customer-card-main').click();
    await page.locator('.customer-profile-page').waitFor();
    await assertBackground(page,'.customer-profile-hero',[MATTE.surface],label);
    await assertBackground(page,'.customer-profile-card',[MATTE.surface],label);
    await assertBackground(page,'.customer-profile-quick-actions>button',[MATTE.secondary],label);
    await assertBackground(page,'.customer-profile-facts>div,.customer-profile-stack>div',['rgba(0, 0, 0, 0)'],label);
    await noLightChrome(page,'.customer-profile-page',label);
    await page.locator('.customer-profile-back').click();
    await page.locator('.customers-heading .btn-primary').click();
    await page.locator('.customer-form-stack').waitFor();
    await assertBackground(page,'.customer-form-section',[MATTE.surface],`${label}/edit`);
    await assertBackground(page,'.customer-form-section .input',[MATTE.input],`${label}/edit`);
    await noLightChrome(page,'.modal',`${label}/edit`);
  }finally{await page.close();}
}

async function auditDocuments(browser,viewport,lang){
  const page=await browser.newPage({viewport:{width:viewport,height:viewport<=430?844:1000},hasTouch:viewport<=820,isMobile:viewport<=820});
  const label=`documents/${viewport}/${lang}`;
  try{
    await page.goto(`${BASE}/obsidian-documents.html?lang=${lang}`,{waitUntil:'load'});
    await page.locator('.documents-register-row').last().locator(viewport<=900?'.mobile-actions button':'.desktop-actions button').click();
    const menu=page.locator(viewport<=900?'.mobile-document-action-sheet':'.document-action-popover');
    await menu.waitFor({state:'visible'});
    await menu.locator('button').first().click();
    await page.locator('.document-detail-page').waitFor();
    await assertBackground(page,'.document-detail-card',[MATTE.surface],label);
    await assertBackground(page,'.document-detail-item-head',[MATTE.workspace],label);
    await assertBackground(page,'.document-detail-item-row',['rgba(0, 0, 0, 0)'],label);
    await assertBackground(page,'.document-detail-secondary-actions>button',[MATTE.secondary],label,{optional:true});
    await noLightChrome(page,'.document-detail-page',label);
  }finally{await page.close();}
}

async function auditMore(browser,lang){
  const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
  const label=`more/390/${lang}`;
  try{
    await page.goto(`${BASE}/obsidian-shell.html?lang=${lang}`,{waitUntil:'load'});
    const more=page.locator('.mobile-bottom-nav button[aria-controls="mobile-more-sheet"]');
    await more.click();
    await page.locator('.mobile-more-sheet').waitFor({state:'visible'});
    await assertBackground(page,'.mobile-more-sheet',[MATTE.surface],label);
    await assertBackground(page,'.mobile-more-account,.mobile-more-link,.mobile-more-settings',[MATTE.strong],label);
    await assertBackground(page,'.mobile-more-account-icon,.mobile-more-link-icon,.mobile-more-settings-icon',[MATTE.selected],label);
    const effects=await page.locator('.mobile-more-sheet').evaluate(root=>({
      sheetImage:getComputedStyle(root).backgroundImage,
      links:[...root.querySelectorAll('.mobile-more-account,.mobile-more-link,.mobile-more-settings')].map(el=>getComputedStyle(el).backgroundImage),
      backdrop:getComputedStyle(document.querySelector('.mobile-more-backdrop')).backdropFilter||getComputedStyle(document.querySelector('.mobile-more-backdrop')).webkitBackdropFilter||'none'
    }));
    assert.equal(effects.sheetImage,'none',`${label}: More sheet still has decorative image/gradient`);
    assert.ok(effects.links.every(value=>value==='none'),`${label}: More links still have category gradients ${JSON.stringify(effects.links)}`);
    assert.ok(effects.backdrop==='none'||effects.backdrop==='',`${label}: More backdrop still uses glass blur ${effects.backdrop}`);
    await noLightChrome(page,'.mobile-more-sheet',label);
  }finally{await page.close();}
}

async function auditSettings(browser,viewport,lang){
  const page=await browser.newPage({viewport:{width:viewport,height:viewport<=430?844:1000},hasTouch:viewport<=820,isMobile:viewport<=820});
  const label=`settings/${viewport}/${lang}`;
  try{
    await page.goto(`${BASE}/obsidian-settings.html?lang=${lang}&scope=settings`,{waitUntil:'load'});
    await page.locator('.settings-workspace-v2').waitFor();
    await assertBackground(page,'.settings-workspace-v2',[MATTE.workspace],label);
    await assertBackground(page,'.settings-tabs',[MATTE.shell],label);
    await assertBackground(page,'.settings-panel',[MATTE.workspace],label);
    const tabs=page.locator('.settings-tabs>button');
    for(let i=0;i<await tabs.count();i++){
      await tabs.nth(i).click();
      await page.waitForTimeout(50);
      await assertBackground(page,'.settings-section',[MATTE.surface],`${label}/tab${i}`);
      await assertBackground(page,'.settings-workspace-v2 .input,.settings-workspace-v2 select.input,.settings-workspace-v2 textarea.input',[MATTE.input],`${label}/tab${i}`,{optional:true});
      await assertBackground(page,'.commercial-row-card',[MATTE.surface],`${label}/tab${i}`,{optional:true});
      await noLightChrome(page,'.settings-workspace-v2',`${label}/tab${i}`);
    }
  }finally{await page.close();}
}

(async()=>{
  const browser=await chromium.launch({headless:true});
  try{
    for(const viewport of [1440,390])for(const lang of ['en','ar'])for(const kind of ['proforma','invoice'])await auditEditor(browser,viewport,lang,kind);
    for(const viewport of [1024,390])for(const lang of ['en','ar'])await auditCustomers(browser,viewport,lang);
    for(const viewport of [1440,390])for(const lang of ['en','ar'])await auditDocuments(browser,viewport,lang);
    for(const lang of ['en','ar'])await auditMore(browser,lang);
    for(const viewport of [1440,390])for(const lang of ['en','ar'])await auditSettings(browser,viewport,lang);
    console.log('Nested surfaces v229: editor, customer, document detail, More and Settings passed in EN/AR desktop/mobile.');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});