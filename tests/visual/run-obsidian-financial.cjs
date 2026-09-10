const {chromium}=require('playwright');
const {mkdirSync,writeFileSync}=require('node:fs');
const assert=require('node:assert/strict');
const output='visual-qa-output/obsidian-financial';
const viewports=[{width:1440,height:1000},{width:820,height:1180},{width:390,height:844},{width:320,height:568}];
(async()=>{
 mkdirSync(output,{recursive:true});const browser=await chromium.launch({headless:true}),results=[];
 try{for(const viewport of viewports)for(const lang of ['en','ar'])for(const screen of ['reports','receivables','operations']){
  const page=await browser.newPage({viewport,hasTouch:viewport.width<=820,isMobile:viewport.width<=820});page.setDefaultTimeout(12000);
  const failures=[];page.on('pageerror',error=>failures.push('pageerror: '+String(error)));
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
  try{
   await page.goto(`http://127.0.0.1:4173/tests/visual/obsidian-financial.html?lang=${lang}&screen=${screen}`,{waitUntil:'load'});await page.evaluate(()=>document.fonts.ready);
   if(screen==='reports'){
    const cards=page.locator('.report-currency-card');await cards.first().waitFor();assert.ok(await cards.count()>=2,'expected multi-currency report rail');
    await audit('.reports-page');await shot('overview');
    const currency=page.locator('.reports-filter-panel select');await currency.selectOption('USD');assert.equal(await cards.count(),1);await shot('usd-filter');await currency.selectOption('ALL');
    const search=page.locator('.reports-customer-search input');await search.fill('Atlas');assert.equal(await page.locator('.customer-performance-table tbody tr').count(),1);await audit('.reports-page');
    const exportButton=page.locator('.reports-heading-actions .btn').first();await reachable(exportButton);
   }else if(screen==='receivables'){
    const cards=page.locator('.receivable-currency-card');await cards.first().waitFor();assert.ok(await cards.count()>=2,'expected multi-currency receivable rail');
    const rows=page.locator('.receivable-account-row');await rows.first().waitFor();assert.ok(await rows.count()>=3,'expected customer accounts');await audit('.receivables-page');await shot('overview');
    const filter=page.locator('.receivable-controls select');await filter.selectOption('overdue');assert.ok(await rows.count()>=1,'overdue filter should retain rows');
    const search=page.locator('.receivable-controls input');await search.fill('Atlas');assert.equal(await rows.count(),1);await shot('filtered');
    const statement=rows.first().locator('.btn');await reachable(statement);await statement.click();await page.locator('.customer-statement-print').waitFor();
    const modal=page.locator('.modal').last();const modalBox=await modal.boundingBox();assert.ok(modalBox&&modalBox.width<=viewport.width+1,'statement modal exceeds viewport width');await shot('statement');
   }else{
    await page.locator('.operations-summary').waitFor();await audit('.operations-page');await shot('suppliers');
    const tabs={purchases:'#operations-tab-purchases',expenses:'#operations-tab-expenses',inventory:'#operations-tab-inventory'};
    for(const [state,selector] of Object.entries(tabs)){
     const tab=page.locator(selector);await reachable(tab);await tab.click();await page.locator(`#operations-panel-${state}`).waitFor();await audit('.operations-page');await shot(state);
    }
    await page.locator('#operations-tab-purchases').click();const purchaseRow=page.locator('.purchase-row').first();await purchaseRow.waitFor();
    const view=purchaseRow.locator('.row-actions button').first();await reachable(view);await view.click();await page.locator('.purchase-editor').waitFor();await audit('.operations-page');await shot('purchase-editor');
   }
  }catch(error){failures.push(String(error));await shot('failure').catch(()=>{});}
  results.push({viewport,lang,screen,failures});await page.close();
 }}finally{await browser.close();}
 writeFileSync(output+'/report.json',JSON.stringify(results,null,2));const failures=results.flatMap(r=>r.failures.map(f=>`${r.viewport.width}/${r.lang}/${r.screen}: ${f}`));assert.equal(failures.length,0,failures.join('\n'));console.log('Obsidian financial workspaces: '+results.length+' language/viewport flows passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
