const {chromium}=require('playwright');
const {mkdirSync,writeFileSync}=require('node:fs');
const assert=require('node:assert/strict');
const output='visual-qa-output/obsidian-editor';
const viewports=[{width:1440,height:1000},{width:1024,height:900},{width:820,height:1180},{width:390,height:844},{width:320,height:568}];
(async()=>{
 mkdirSync(output,{recursive:true});const browser=await chromium.launch({headless:true}),results=[];
 try{for(const viewport of viewports)for(const lang of ['en','ar'])for(const kind of ['invoice','proforma']){
  const page=await browser.newPage({viewport,hasTouch:viewport.width<=820,isMobile:viewport.width<=820});page.setDefaultTimeout(12000);
  const failures=[];page.on('pageerror',e=>failures.push(e.stack||String(e)));
  const stem=viewport.width+'-'+lang+'-'+kind;
  try{
   await page.goto('http://127.0.0.1:4173/tests/visual/obsidian-editor.html?lang='+lang+'&kind='+kind,{waitUntil:'load'});
   await page.evaluate(()=>{document.documentElement.dataset.uiTheme='dark';document.documentElement.dataset.uiThemePreference='dark';document.documentElement.style.colorScheme='dark';});
   await page.locator('.editor-section-nav-button').first().waitFor();
   await page.evaluate(()=>document.fonts.ready);
   await page.waitForTimeout(450);
   const theme=await page.evaluate(()=>{const resolved=value=>{const probe=document.createElement('i');probe.style.cssText=`position:fixed;visibility:hidden;background:${value}`;document.body.appendChild(probe);const color=getComputedStyle(probe).backgroundColor;probe.remove();return color;};return{workspace:resolved('var(--mf-workspace)'),surface:resolved('var(--mf-surface)')};});
   const audit=async()=>{
    const issues=await page.evaluate(expectedSurface=>{
     const issues=[],screen=document.querySelector('.editor-screen');
     if(screen.scrollWidth>innerWidth+1)issues.push('editor horizontal overflow');
     for(const el of document.querySelectorAll('.editor-section>.section-heading')){
      const background=getComputedStyle(el).backgroundColor;
      if(!['rgba(0, 0, 0, 0)',expectedSurface].includes(background))issues.push('section heading outside semantic surface system: '+background);
     }
     for(const el of document.querySelectorAll('.editor-scroll *,.editor-topbar,.document-readiness,.mobile-editor-actionbar,.preview-stage')){
      if(el.closest('.invoice-pages,.template-mini,.template-thumbnail')||el.matches('.toggle>span'))continue;
      const rect=el.getBoundingClientRect(),css=getComputedStyle(el);
      if(rect.width&&rect.height&&css.backgroundColor==='rgb(255, 255, 255)')issues.push('white chrome: '+el.tagName+'.'+el.className+' in '+el.parentElement.className);
     }
     return [...new Set(issues)];
    },theme.surface);failures.push(...issues);
   };
   const auditStepNav=async()=>{
    if(viewport.width>420)return;
    const geometry=await page.locator('.editor-section-navigator').evaluate(nav=>{
     const navRect=nav.getBoundingClientRect();
     const buttons=[...nav.querySelectorAll('.editor-section-nav-button')];
     return {count:buttons.length,nav:{left:navRect.left,right:navRect.right,width:navRect.width},clipped:buttons.map((button,index)=>{const r=button.getBoundingClientRect();return {index,left:r.left,right:r.right,width:r.width,display:getComputedStyle(button).display};}).filter(item=>item.left<-1||item.right>innerWidth+1||item.width<24||item.display==='none'),viewport:innerWidth};
    });
    assert.equal(geometry.count,6,'mobile editor must expose all six section steps '+JSON.stringify(geometry));
    assert.deepEqual(geometry.clipped,[],'mobile editor section step clipped '+JSON.stringify(geometry));
   };
   const auditDesign=async()=>{
    const issues=await page.evaluate(theme=>{
     const issues=[],panel=document.querySelector('.design-advanced-panel');
     if(!panel){issues.push('design advanced panel missing');return issues;}
     const panelRect=panel.getBoundingClientRect(),panelCss=getComputedStyle(panel);
     if(panelCss.backgroundColor!==theme.workspace)issues.push('design panel outside semantic workspace: '+panelCss.backgroundColor);
     const rows=[...panel.querySelectorAll('.appearance-toggles .toggle-row')];
     if(rows.length!==6)issues.push('expected 6 appearance toggle rows, found '+rows.length);
     for(const row of rows){
      const rowRect=row.getBoundingClientRect(),rowCss=getComputedStyle(row),toggle=row.querySelector('.toggle');
      if(rowCss.backgroundColor!==theme.surface)issues.push('appearance row outside semantic surface: '+rowCss.backgroundColor);
      if(rowRect.left<panelRect.left-1||rowRect.right>panelRect.right+1)issues.push('appearance row escapes design panel');
      if(!toggle){issues.push('appearance switch missing');continue;}
      const toggleRect=toggle.getBoundingClientRect();
      if(Math.abs(toggleRect.width-36)>1||Math.abs(toggleRect.height-21)>1)issues.push('appearance switch inflated: '+toggleRect.width+'x'+toggleRect.height);
      if(toggleRect.left<rowRect.left-1||toggleRect.right>rowRect.right+1||toggleRect.top<rowRect.top-1||toggleRect.bottom>rowRect.bottom+1)issues.push('appearance switch escapes row');
     }
     const firstGroup=panel.querySelector('.appearance-toggles');
     if(firstGroup){
      const columns=getComputedStyle(firstGroup).gridTemplateColumns.split(' ').filter(Boolean).length;
      const expected=innerWidth<=720?1:innerWidth<=1180?2:3;
      if(columns!==expected)issues.push('appearance grid columns '+columns+' expected '+expected);
     }
     return [...new Set(issues)];
    },theme);failures.push(...issues);
   };
   const auditTotals=async()=>{
    if(viewport.width>960)return;
    const issues=await page.evaluate(()=>{
     const issues=[],switches=[...document.querySelectorAll('.adjustments-list .toggle-row>.toggle')];
     if(switches.length!==4)issues.push('expected 4 totals switches, found '+switches.length);
     for(const toggle of switches){
      const hit=toggle.getBoundingClientRect(),track=getComputedStyle(toggle,'::before'),knob=toggle.querySelector('span')?.getBoundingClientRect();
      const trackWidth=parseFloat(track.width),trackHeight=parseFloat(track.height);
      if(hit.width<43||hit.height<43)issues.push('totals switch hit target below 44px: '+hit.width+'x'+hit.height);
      if(Math.abs(trackWidth-36)>1||Math.abs(trackHeight-21)>1)issues.push('totals visual track inflated: '+trackWidth+'x'+trackHeight);
      if(!knob||Math.abs(knob.width-17)>1||Math.abs(knob.height-17)>1)issues.push('totals switch knob inflated: '+(knob?knob.width+'x'+knob.height:'missing'));
      if(getComputedStyle(toggle).backgroundColor!=='rgba(0, 0, 0, 0)')issues.push('totals hit target must stay visually transparent');
     }
     return [...new Set(issues)];
    });failures.push(...issues);
   };
   await audit();await auditStepNav();
   await page.screenshot({path:output+'/'+stem+'-document.png',animations:'disabled'});
   const sections=page.locator('.editor-section');
   await sections.nth(2).scrollIntoViewIfNeeded();
   await audit();await auditStepNav();
   await page.screenshot({path:output+'/'+stem+'-items.png',animations:'disabled'});
   await page.locator('.item-pricing-grid input').first().fill('5');
   await page.waitForFunction(()=>window.lastSaved?.items[0].quantity==='5');
   await sections.nth(3).scrollIntoViewIfNeeded();
   assert.match(await page.locator('.editor-totals .grand').innerText(),/5,045.00/);
   await audit();await auditStepNav();await auditTotals();
   await page.screenshot({path:output+'/'+stem+'-totals.png',animations:'disabled'});
   await sections.nth(4).scrollIntoViewIfNeeded();
   await audit();await auditStepNav();
   await page.screenshot({path:output+'/'+stem+'-terms.png',animations:'disabled'});
   await sections.last().scrollIntoViewIfNeeded();
   await audit();await auditStepNav();
   await auditDesign();
   const firstAppearanceSwitch=page.locator('.design-advanced-panel .appearance-toggles .toggle').first();
   const before=await firstAppearanceSwitch.getAttribute('aria-checked');
   await firstAppearanceSwitch.click();
   assert.notEqual(await firstAppearanceSwitch.getAttribute('aria-checked'),before);
   await auditDesign();await auditStepNav();
   await page.screenshot({path:output+'/'+stem+'-design.png',animations:'disabled'});
   if(viewport.width<=1180){
    if(viewport.width<=900)await page.locator('.mobile-action-buttons .btn').nth(1).click();
    else await page.locator('.mobile-preview-button:visible').first().click();
    await page.locator('.mobile-preview-overlay').waitFor({state:'visible'});
    const preview=await page.locator('.mobile-preview-stage').evaluate(el=>({background:getComputedStyle(el).backgroundColor,paper:el.querySelectorAll('.invoice-page').length}));
    assert.equal(preview.background,theme.workspace);assert.ok(preview.paper>0);
    await page.screenshot({path:output+'/'+stem+'-preview.png',animations:'disabled'});
    await page.locator('.mobile-preview-overlay header .icon-btn').click();
   }else assert.equal(await page.locator('.preview-stage').evaluate(el=>getComputedStyle(el).backgroundColor),theme.workspace);
  }catch(e){failures.push(String(e));await page.screenshot({path:output+'/'+stem+'-failure.png',fullPage:true}).catch(()=>{});}
  results.push({viewport,lang,kind,failures});await page.close();
 }
 for(const viewport of [viewports[0],viewports[2],viewports[4]])for(const lang of ['en','ar'])for(const kind of ['invoice','proforma']){
  const page=await browser.newPage({viewport,hasTouch:viewport.width<=820,isMobile:viewport.width<=820});page.setDefaultTimeout(12000);
  const failures=[];page.on('pageerror',e=>failures.push(e.stack||String(e)));
  try{
   await page.goto('http://127.0.0.1:4173/tests/visual/obsidian-editor.html?lang='+lang+'&kind='+kind+'&status=final',{waitUntil:'load'});
   await page.evaluate(()=>{document.documentElement.dataset.uiTheme='dark';document.documentElement.dataset.uiThemePreference='dark';document.documentElement.style.colorScheme='dark';});
   await page.locator('.editor-section-nav-button').first().waitFor();
   await page.evaluate(()=>document.fonts.ready);
   await page.waitForTimeout(450);
   const surface=await page.evaluate(()=>{const probe=document.createElement('i');probe.style.cssText='position:fixed;visibility:hidden;background:var(--mf-surface)';document.body.appendChild(probe);const color=getComputedStyle(probe).backgroundColor;probe.remove();return color;});
   assert.ok(await page.locator('.editor-form-lock').evaluate(el=>el.disabled));
   const issues=await page.evaluate(expectedSurface=>{
    const issues=[];
    const topbar=document.querySelector('.editor-topbar').getBoundingClientRect();
    if(topbar.top<0||topbar.bottom>innerHeight)issues.push('final editor command bar outside viewport');
    for(const selector of ['.final-lock-banner','.final-quote-convert-bar']){
     const el=document.querySelector(selector);if(!el)continue;
     const r=el.getBoundingClientRect();
     if(r.left<0||r.right>innerWidth+1||r.bottom>innerHeight+1)issues.push(selector+' outside viewport');
     if(getComputedStyle(el).backgroundColor!==expectedSurface)issues.push(selector+' not on semantic surface');
    }
    if(document.querySelector('.editor-pane').getBoundingClientRect().height<90)issues.push('final editor has insufficient working space');
    return issues;
   },surface);failures.push(...issues);
   if(viewport.width<=420){
    const clipped=await page.locator('.editor-section-nav-button').evaluateAll(buttons=>buttons.map((button,index)=>{const r=button.getBoundingClientRect();return {index,left:r.left,right:r.right,width:r.width};}).filter(item=>item.left<-1||item.right>innerWidth+1||item.width<24));
    assert.deepEqual(clipped,[],'final mobile editor section step clipped '+JSON.stringify(clipped));
   }
   await page.screenshot({path:output+'/'+viewport.width+'-'+lang+'-'+kind+'-final.png',animations:'disabled'});
  }catch(e){failures.push(String(e));}
  results.push({viewport,lang,kind,status:'final',failures});await page.close();
 }
 }finally{await browser.close();}
 writeFileSync(output+'/report.json',JSON.stringify(results,null,2));
 const failures=results.flatMap(r=>r.failures.map(f=>r.viewport.width+'/'+r.lang+'/'+r.kind+': '+f));
 assert.equal(failures.length,0,failures.join('\n'));console.log('Obsidian editor: '+results.length+' responsive/language/document cases passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
