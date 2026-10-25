const {chromium,webkit}=require('playwright');
const assert=require('node:assert/strict');
const {mkdirSync,writeFileSync}=require('node:fs');
const output='visual-qa-output/ai-batches1-7-current-workspace';
mkdirSync(output,{recursive:true});
const cases=[
  {engine:chromium,name:'chromium',width:390,height:844,lang:'en',theme:'dark'},
  {engine:webkit,name:'webkit',width:320,height:700,lang:'ar',theme:'dark'},
  {engine:webkit,name:'webkit',width:390,height:844,lang:'en',theme:'light'},
  {engine:webkit,name:'webkit',width:820,height:1180,lang:'ar',theme:'light'},
];
const rgb=v=>(String(v).match(/[\d.]+/g)||[]).slice(0,3).map(Number);
const luminance=color=>{
  const parts=rgb(color).map(x=>{const n=x/255;return n<=0.04045?n/12.92:((n+0.055)/1.055)**2.4;});
  return(parts[0]||0)*0.2126+(parts[1]||0)*0.7152+(parts[2]||0)*0.0722;
};
const contrast=(a,b)=>{const x=luminance(a),y=luminance(b);return(Math.max(x,y)+0.05)/(Math.min(x,y)+0.05);};
const report=[];
(async()=>{
 for(const c of cases){
  const browser=await c.engine.launch({headless:true});
  try{
   const page=await browser.newPage({viewport:{width:c.width,height:c.height},isMobile:c.width<=430,hasTouch:c.width<=430});
   const errors=[],requests=[];
   page.on('pageerror',e=>errors.push(String(e)));
   await page.route('**/api/**',route=>{requests.push(route.request().url());return route.fulfill({status:503,body:'No provider in local QA'});});
   await page.goto('http://127.0.0.1:4173/tests/visual/contextual-ai-batch4.html?lang='+c.lang+'&theme='+c.theme,{waitUntil:'networkidle'});
   // This is an intentionally hidden React portal mount, not visible UI.
   // Wait for attachment here; visible assertions follow on the opened panel.
   await page.locator('[data-lourex-proactive-assistant-mount]').waitFor({state:'attached'});
   await page.evaluate(async theme=>{
    const [{setupVault},{emptyVault},{establishSession},{setUiThemePreference}]=await Promise.all([
      import('/dist/src/storage/vault.js'),
      import('/dist/src/lib/defaults.js'),
      import('/dist/src/storage/session.js'),
      import('/dist/src/lib/ui-theme.js')
    ]);
    const vault=emptyVault();vault.company.nameEn='LOUREX AI Current QA';
    const {key}=await setupVault('2468',vault);
    if(!await establishSession(key))throw new Error('Test-only account session was unavailable');
    setUiThemePreference(theme);
    window.dispatchEvent(new CustomEvent('lourex-account-transition-complete',{detail:{uid:'qa-current'}}));
   },c.theme);
   await page.locator('.lourex-ai-launcher').click();
   const panel=page.locator('#lourex-ai-panel[data-lourex-workspace="2"]');
   await panel.waitFor({state:'visible'});
   await page.waitForFunction(()=>document.querySelector('#lourex-ai-panel')?.dataset.workspaceReady==='true',{timeout:30000});
   const tabs=panel.locator('.lxw-mode-tabs [role="tab"]');
   await tabs.first().waitFor({state:'visible'});
   assert.equal(await tabs.count(),2,'only Controller and Advisor modes may be visible');
   assert.deepEqual((await tabs.allTextContents()).map(s=>s.trim()),c.lang==='ar'?['المتحكم','المستشار']:['Controller','Advisor']);
   assert.equal(await panel.getAttribute('data-workspace-mode'),'controller','business chat opens in Controller');
   const visual=await panel.evaluate(node=>{const style=getComputedStyle(node);return{bg:style.backgroundColor,color:style.color,dir:node.dir};});
   const expectedCanvas=c.theme==='dark'?'rgb(16, 26, 22)':'rgb(247, 250, 248)';
   assert.equal(visual.bg,expectedCanvas,'chat uses the approved Quiet Intelligence canvas for the selected site theme');
   assert.ok(contrast(visual.color,visual.bg)>=4.5,'conversation body text meets WCAG AA');
   // A malformed selector once caused the browser to discard every later
   // document rule, despite source-string tests seeing the intended CSS.
   // Probe rendered controls in the real panel with compiled production CSS.
   const documentVisual=await panel.evaluate(async node=>{
    const card=document.createElement('section');
    card.className='lxw-chat-document lxw-document-unified';
    card.innerHTML='<header class="lxw-document-card-head"><div class="lxw-document-card-title"><small>LOUREX</small><strong>Draft quote</strong></div></header><div class="lxw-document-essentials"><span class="lxw-document-essential-customer">QA customer</span><div class="lxw-document-essential-price"><span>Items subtotal</span><strong class="lxw-document-essential-total">1100.00 <small>USD</small></strong></div></div><div class="lxw-document-meta"><span>3 items</span></div><small class="lxw-document-safety-note">PDF preview is optional.</small><details class="lxw-document-extra"><summary>All items and details</summary></details><div class="lxw-document-action-grid"><button class="lxw-document-action lxw-document-action-approve"><span>Save draft</span></button></div>';
    node.appendChild(card);
    try{
     const button=card.querySelector('button'),text=button.querySelector('span');
     const enabled=getComputedStyle(button),cardStyle=getComputedStyle(card);
     const css=selector=>getComputedStyle(card.querySelector(selector));
     const ink=selector=>css(selector).webkitTextFillColor||css(selector).color;
     const result={bg:cardStyle.backgroundColor,text:cardStyle.color,
      summary:{bg:css('.lxw-document-essentials').backgroundColor,total:ink('.lxw-document-essential-total'),
       label:ink('.lxw-document-essential-price>span'),currency:ink('.lxw-document-essential-total small')},
      meta:ink('.lxw-document-meta>span'),safety:ink('.lxw-document-safety-note'),
      enabled:{bg:enabled.backgroundColor,text:ink('button span'),opacity:enabled.opacity}};
     button.disabled=true;
     const disabled=getComputedStyle(button);
     // Flush the state change, then sample the settled paint rather than the
     // first frame of the existing background/color transitions.
     void disabled.backgroundColor;
     await Promise.all(button.getAnimations().filter(animation=>
      Number.isFinite(animation.effect?.getComputedTiming().endTime)
     ).map(animation=>animation.finished.catch(()=>{})));
     result.disabled={bg:disabled.backgroundColor,text:ink('button span'),opacity:disabled.opacity};
     return result;
    }finally{card.remove();}
   });
   assert.equal(documentVisual.bg,c.theme==='dark'?'rgb(23, 36, 29)':'rgb(255, 255, 255)',
    'document surface must follow the conversation theme');
   assert.equal(documentVisual.enabled.bg,'rgb(47, 107, 93)','Save uses the conversation green family');
   assert.equal(documentVisual.disabled.bg,documentVisual.summary.bg,'disabled Save uses the theme secondary surface');
   for(const ink of [documentVisual.text,documentVisual.meta,documentVisual.safety])
    assert.ok(contrast(ink,documentVisual.bg)>=4.5,'document body and notes remain readable');
   for(const ink of [documentVisual.summary.total,documentVisual.summary.label,documentVisual.summary.currency])
    assert.ok(contrast(ink,documentVisual.summary.bg)>=4.5,'subtotal, label and currency remain readable');
   for(const state of [documentVisual.enabled,documentVisual.disabled]){
    assert.equal(state.opacity,'1','disabled opacity must not wash out the document action');
    assert.ok(contrast(state.text,state.bg)>=4.5,'document action label meets WCAG AA in both states');
   }
   assert.equal(visual.dir,c.lang==='ar'?'rtl':'ltr');
   const box=await panel.boundingBox();
   assert.ok(box&&box.x>=-1&&box.y>=-1,'AI panel starts inside viewport');
   assert.ok(box.x+box.width<=c.width+2,'AI panel does not overflow horizontally');
   assert.ok(box.y+box.height<=c.height+2,'AI panel does not overflow vertically');
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),true,'page must not scroll horizontally');
   // Review the actual preferences and upper menu, not only the empty chat.
   await panel.getByRole('button',{name:c.lang==='ar'?'إعدادات المساعد':'AI settings',exact:true}).click();
   const preferences=panel.locator('.lxw-settings');
   await preferences.waitFor({state:'visible'});
   assert.equal(await preferences.locator('fieldset').count(),2,'preferences are grouped by purpose');
   assert.equal(await preferences.locator('select').count(),4,'existing preferences remain reachable');
   const preferenceMetrics=await preferences.locator('select').evaluateAll(nodes=>nodes.map(el=>({height:el.getBoundingClientRect().height,size:parseFloat(getComputedStyle(el).fontSize)})));
   assert.ok(preferenceMetrics.every(row=>row.height>=44&&row.size>=16),'settings controls remain touch-readable');
   await page.screenshot({path:`${output}/settings-${c.name}-${c.width}-${c.lang}-${c.theme}.png`,animations:'disabled'});
   await preferences.getByRole('button',{name:c.lang==='ar'?'تم':'Done',exact:true}).click();
   await preferences.waitFor({state:'hidden'});
   await panel.locator('.lourex-ai-overflow-trigger').click();
   await panel.locator('.lourex-ai-overflow-menu:not([inert])').waitFor({state:'visible'});
   await page.screenshot({path:`${output}/menu-${c.name}-${c.width}-${c.lang}-${c.theme}.png`,animations:'disabled'});
   await panel.locator('.lourex-ai-overflow-trigger').click();
   await panel.locator('.lourex-ai-overflow-menu').waitFor({state:'hidden'});
   const history=panel.locator('.lxw-history-trigger');
   if(c.width<=430){
    await panel.locator('.lourex-ai-overflow-trigger').click();
    await panel.getByRole('menuitem',{name:c.lang==='ar'?'المحادثات':'Conversations',exact:true}).click();
   }else{
    await history.waitFor({state:'visible'});
    const bounds=await history.boundingBox();
    assert.ok(bounds?.height>=44&&bounds.width>=38,'history is touch-accessible');
    await history.click();
   }
   assert.ok(await panel.locator('.lourex-ai-title strong').isVisible(),'LOUREX identity remains visible on narrow phones');
   await panel.locator('.lxw-history').waitFor({state:'visible'});
   const search=panel.locator('.lxw-history-search');
   assert.equal(await search.getAttribute('type'),'search');
   await page.screenshot({path:`${output}/history-${c.name}-${c.width}-${c.lang}-${c.theme}.png`,animations:'disabled'});
   assert.ok((await search.evaluate(el=>Number.parseFloat(getComputedStyle(el).fontSize)))>=16,'history search avoids Safari keyboard zoom');
   await search.fill('nonexistent-qa-thread');
   assert.equal(await panel.locator('.lxw-history-row').count(),0,'history title search filters records');
   await panel.locator('.lxw-history-head button').first().click();
   await panel.locator('.lxw-history').waitFor({state:'hidden'});
   await tabs.nth(1).click();
   await page.waitForFunction(()=>document.querySelector('#lourex-ai-panel')?.dataset.workspaceMode==='advisor');
   assert.equal(await tabs.nth(1).getAttribute('aria-selected'),'true');
   assert.equal(await panel.locator('.lxw-workspace-trigger').count(),0,'Advisor must not have Controller execution workspace');
   await panel.locator('.lourex-ai-overflow-trigger').click();
   await panel.getByRole('menuitem',{name:c.lang==='ar'?'محادثة جديدة':'New conversation',exact:true}).click();
   await page.waitForFunction(()=>{const panel=document.querySelector('#lourex-ai-panel');return panel?.dataset.workspaceReady==='true'&&panel.dataset.workspaceMode==='advisor';});
   assert.equal(await tabs.nth(1).getAttribute('aria-selected'),'true','upper-menu new conversation preserves Advisor');
   assert.equal(await panel.locator('.lxw-workspace-trigger').count(),0,'new Advisor thread does not gain Controller execution controls');
   await tabs.nth(0).click();
   await page.waitForFunction(()=>document.querySelector('#lourex-ai-panel')?.dataset.workspaceMode==='controller');
   await page.screenshot({path:`${output}/${c.name}-${c.width}-${c.lang}-${c.theme}.png`,animations:'disabled'});
   assert.deepEqual(errors,[],'no unhandled page script errors');
   assert.deepEqual(requests,[],'read-only UI QA never calls the paid provider');
   report.push({engine:c.name,width:c.width,height:c.height,lang:c.lang,siteTheme:c.theme,
    quietIntelligenceCanvas:true,documentVisual,rtl:c.lang==='ar',modeIsolation:true,historySearch:true,
    horizontalOverflow:false,apiCalls:requests.length});
   console.log('PASS '+c.name+' '+c.width+' '+c.lang+' '+c.theme+': Quiet Intelligence AI, two roles, scoped history, no overflow');
   await page.close();
  }finally{await browser.close();}
 }
 writeFileSync(output+'/report.json',JSON.stringify(report,null,2));
 console.log('Current LOUREX AI workspace passed '+report.length+' desktop/mobile Chromium-WebKit cases.');
})().catch(e=>{console.error(e);process.exitCode=1});
