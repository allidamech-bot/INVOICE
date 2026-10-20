const {chromium}=require('playwright');
const {mkdirSync,writeFileSync}=require('node:fs');
const assert=require('node:assert/strict');
const output='visual-qa-output/obsidian-financial';
const viewports=[{width:1440,height:1000},{width:820,height:1180},{width:390,height:844},{width:320,height:568}];
(async()=>{
 mkdirSync(output,{recursive:true});const browser=await chromium.launch({headless:true}),results=[];
 try{for(const viewport of viewports)for(const lang of ['en','ar'])for(const screen of ['reports','receivables','operations']){
  const page=await browser.newPage({viewport,hasTouch:viewport.width<=820,isMobile:viewport.width<=820});page.setDefaultTimeout(12000);
  const failures=[];page.on('console',message=>{if(message.type()==='error')failures.push('console: '+message.text());});page.on('pageerror',error=>failures.push('pageerror: '+String(error)));
  const shot=async state=>page.screenshot({path:`${output}/${viewport.width}-${lang}-${screen}-${state}.png`,fullPage:true,animations:'disabled'});
  const audit=async selector=>{
   const issues=await page.locator(selector).evaluate(root=>{
    const problems=[];
    if(document.documentElement.scrollWidth>innerWidth+1)problems.push(`page overflow ${document.documentElement.scrollWidth}>${innerWidth}`);
    for(const el of root.querySelectorAll('*')){
     const r=el.getBoundingClientRect(),s=getComputedStyle(el);if(!r.width||!r.height||r.bottom<0||r.top>innerHeight||s.visibility==='hidden'||s.display==='none')continue;
     const rgb=s.backgroundColor.match(/[\d.]+/g)?.map(Number)||[];
     if(r.width*r.height>1200&&rgb.length>=3&&rgb.slice(0,3).every(v=>v>225)&&(rgb.length===3||rgb[3]>.8))problems.push(`light chrome ${el.tagName}.${el.className} ${s.backgroundColor}`);
     if(innerWidth<=430&&el.matches('input,select,textarea')&&parseFloat(s.fontSize)<16)problems.push(`small phone input ${el.className} ${s.fontSize}`);
    }
    return [...new Set(problems)];
   });failures.push(...issues);
  };
  const reachable=async locator=>{
   await locator.scrollIntoViewIfNeeded();await page.waitForTimeout(120);
   const geometry=await locator.evaluate(el=>{const r=el.getBoundingClientRect(),x=Math.min(innerWidth-1,Math.max(0,r.x+r.width/2)),y=Math.min(innerHeight-1,Math.max(0,r.y+r.height/2)),hit=document.elementFromPoint(x,y);return {ok:r.top>=-1&&r.bottom<=innerHeight+1&&r.left>=-1&&r.right<=innerWidth+1&&Boolean(hit&&(el===hit||el.contains(hit))),rect:r.toJSON(),hit:hit?.className,viewport:{width:innerWidth,height:innerHeight}};});
   assert.equal(geometry.ok,true,'action clipped or covered '+JSON.stringify(geometry));
  };
  const auditInventoryContainment=async()=>{
   if(viewport.width>720)return;
   const geometry=await page.evaluate(()=>{
    const workspace=document.querySelector('.ta-inventory-workspace');
    const balances=document.querySelector('.ta-inventory-ledger');
    const entry=document.querySelector('.ta-inventory-entry');
    const action=document.querySelector('.ta-inventory-entry-action>.btn');
    if(!workspace||!balances||!entry||!action)return {error:'inventory containment nodes missing'};
    const rect=el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,width:r.width};};
    return {workspace:rect(workspace),balances:rect(balances),entry:rect(entry),action:rect(action),pageScrollWidth:document.documentElement.scrollWidth,viewport:innerWidth};
   });
   assert.equal(geometry.error,undefined,JSON.stringify(geometry));
   assert.ok(geometry.pageScrollWidth<=geometry.viewport+1,'inventory workspace expands the phone page '+JSON.stringify(geometry));
   for(const key of ['workspace','balances','entry','action']){
    const box=geometry[key];
    assert.ok(box.left>=-1&&box.right<=geometry.viewport+1&&box.width<=geometry.viewport+1,`${key} escapes phone width `+JSON.stringify(geometry));
   }
   assert.ok(geometry.action.left>=geometry.entry.left-1&&geometry.action.right<=geometry.entry.right+1,'inventory action escapes Manual Movement card '+JSON.stringify(geometry));
  };
  const auditPurchaseEditor=async()=>{
   if(viewport.width>720)return;
   const geometry=await page.evaluate(()=>{
    const selectors=['.ta-operations-page','.ta-ops-purchase-split','.ta-ops-purchase-editor','.ta-purchase-item','.ta-ops-editor-actions'];
    const clipped=[];
    for(const selector of selectors){for(const el of document.querySelectorAll(selector)){const r=el.getBoundingClientRect(),s=getComputedStyle(el);if(s.display==='none'||!r.width||!r.height)continue;if(r.left<-1||r.right>innerWidth+1||r.width>innerWidth+1)clipped.push({selector,left:r.left,right:r.right,width:r.width});}}
    const display=selector=>{const el=document.querySelector(selector);return el?getComputedStyle(el).display:null;};
    const list=document.querySelector('.ta-ops-purchase-split .ta-ops-list-card');const nav=document.querySelector('.mobile-bottom-nav');const navStyle=nav?getComputedStyle(nav):null;
    const actions=document.querySelector('.ta-ops-purchase-editor .ta-ops-editor-actions'),actionRect=actions?.getBoundingClientRect();
    const covered=[];
    if(actionRect&&actionRect.bottom>0&&actionRect.top<innerHeight){
     for(const control of document.querySelectorAll('.ta-ops-purchase-editor fieldset input,.ta-ops-purchase-editor fieldset select,.ta-ops-purchase-editor fieldset textarea,.ta-ops-purchase-editor fieldset button')){
      const r=control.getBoundingClientRect(),s=getComputedStyle(control);if(s.display==='none'||s.visibility==='hidden'||!r.width||!r.height||r.bottom<=0||r.top>=innerHeight)continue;
      // getBoundingClientRect includes content clipped by the editor scrollport.
      let left=r.left,right=r.right,top=r.top,bottom=r.bottom;
      for(let parent=control.parentElement;parent;parent=parent.parentElement){
       const style=getComputedStyle(parent),box=parent.getBoundingClientRect();
       if(/auto|scroll|hidden|clip/.test(style.overflowY)){top=Math.max(top,box.top);bottom=Math.min(bottom,box.bottom);}
       if(/auto|scroll|hidden|clip/.test(style.overflowX)){left=Math.max(left,box.left);right=Math.min(right,box.right);}
      }
      if(right>left&&bottom>top&&left<actionRect.right&&right>actionRect.left&&top<actionRect.bottom&&bottom>actionRect.top)covered.push({tag:control.tagName,label:control.closest('label')?.textContent?.trim().slice(0,40),rect:r.toJSON()});
     }
    }
    return {
     pageScrollWidth:document.documentElement.scrollWidth,
     clipped,
     covered,
     listDisplay:list?getComputedStyle(list).display:null,
     nav:navStyle?{display:navStyle.display,visibility:navStyle.visibility,opacity:navStyle.opacity}:null,
     topbarDisplay:display('.workspace-topbar'),
     heroDisplay:display('.ta-operations-page > .operations-hero'),
     summaryDisplay:display('.ta-operations-page > .ta-ops-metrics'),
     tabsDisplay:display('.ta-operations-page > .operations-tabs'),
     viewport:innerWidth
    };
   });
   assert.ok(geometry.pageScrollWidth<=viewport.width+1,'purchase workspace causes page overflow '+JSON.stringify(geometry));
   assert.deepEqual(geometry.clipped,[],'purchase editor clips outside phone viewport '+JSON.stringify(geometry));
   assert.deepEqual(geometry.covered,[],'purchase action bar covers editable fields '+JSON.stringify(geometry));
   // The current TailAdmin mobile workspace stacks the list and editor.
   // Verify usable content instead of requiring the retired focused-screen layout.
   const editor=page.locator('.ta-ops-purchase-editor');
   assert.ok(await editor.isVisible(),'purchase editor must be visible');
   const controls=editor.locator('fieldset input:not([readonly]),fieldset select,fieldset textarea');
   assert.ok(await controls.count()>0,'draft purchase must expose editable fields');
   await reachable(controls.first());
   await reachable(controls.last());
  };
  try{
   await page.addInitScript(()=>localStorage.setItem('lourex-ui-theme','dark'));
   await page.goto(`http://127.0.0.1:4173/tests/visual/obsidian-financial.html?lang=${lang}&screen=${screen}`,{waitUntil:'load'});await page.evaluate(()=>document.fonts.ready);
   if(screen==='reports'){
    const cards=page.locator('.ta-report-kpi');await cards.first().waitFor();assert.ok(await cards.count()>=2,'expected multi-currency report rail');
    await audit('.ta-reports-page');await shot('overview');
    const currency=page.locator('.ta-report-currency select');await currency.selectOption('USD');assert.equal(await cards.count(),1);await shot('usd-filter');await currency.selectOption('ALL');
    const search=page.locator('.ta-customer-report-header input');await search.fill('Atlas');assert.equal(await page.locator('.ta-customer-performance-table tbody tr').count(),1);await audit('.ta-reports-page');
    const exportButton=page.locator('.ta-page-actions .btn').first();await reachable(exportButton);
   }else if(screen==='receivables'){
    const cards=page.locator('.ta-finance-kpi');await cards.first().waitFor();assert.ok(await cards.count()>=2,'expected multi-currency receivable rail');
    const rows=page.locator('.ta-account-row');await rows.first().waitFor();assert.ok(await rows.count()>=3,'expected customer accounts');await audit('.ta-receivables-page');await shot('overview');
    const filter=page.locator('.ta-account-controls select');await filter.selectOption('overdue');assert.ok(await rows.count()>=1,'overdue filter should retain rows');
    const search=page.locator('.ta-account-controls input');await search.fill('Atlas');assert.equal(await rows.count(),1);await shot('filtered');
    const statement=rows.first().getByRole('button',{name:/^(Statement|كشف حساب)$/});await reachable(statement);await statement.click();await page.locator('.customer-statement-print').waitFor();
    const modal=page.locator('.modal').last();const modalBox=await modal.boundingBox();assert.ok(modalBox&&modalBox.width<=viewport.width+1,'statement modal exceeds viewport width');await shot('statement');
   }else{
    await page.locator('.ta-ops-metrics').waitFor();await audit('.ta-operations-page');await shot('suppliers');
    const tabs={purchases:'#operations-tab-purchases',expenses:'#operations-tab-expenses',inventory:'#operations-tab-inventory'};
    for(const [state,selector] of Object.entries(tabs)){
     const tab=page.locator(selector);await reachable(tab);await tab.click();await page.locator(`#operations-panel-${state}`).waitFor();await audit('.ta-operations-page');
     if(state==='inventory')await auditInventoryContainment();
     await shot(state);
    }
    await page.locator('#operations-tab-purchases').click();const purchaseRow=page.locator('#operations-panel-purchases .ta-ops-row').filter({has:page.locator('.ta-ops-status.is-draft')}).first();await purchaseRow.waitFor();
    const view=purchaseRow.locator('.ta-ops-row-actions button').first();await reachable(view);await view.click();await page.locator('.ta-ops-purchase-editor').waitFor();await audit('.ta-operations-page');await auditPurchaseEditor();
    const primary=page.locator('.ta-ops-purchase-editor .ta-ops-editor-actions .btn-primary');await reachable(primary);await auditPurchaseEditor();await shot('purchase-editor');
   }
  }catch(error){failures.push(String(error));await shot('failure').catch(()=>{});}
  results.push({viewport,lang,screen,failures});await page.close();
 }}finally{await browser.close();}
 writeFileSync(output+'/report.json',JSON.stringify(results,null,2));const failures=results.flatMap(r=>r.failures.map(f=>`${r.viewport.width}/${r.lang}/${r.screen}: ${f}`));assert.equal(failures.length,0,failures.join('\n'));console.log('Obsidian financial workspaces: '+results.length+' language/viewport flows passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
