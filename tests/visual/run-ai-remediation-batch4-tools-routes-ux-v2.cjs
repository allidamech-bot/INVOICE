const {chromium,webkit}=require('playwright');
const assert=require('node:assert/strict');
const {mkdirSync,writeFileSync}=require('node:fs');

(async()=>{
  const out='visual-qa-output/ai-remediation-batch4-tools-routes-ux';mkdirSync(out,{recursive:true});
  const cases=[{engine:chromium,name:'chromium',width:390,lang:'en',theme:'light'},{engine:webkit,name:'webkit',width:320,lang:'ar',theme:'dark'}],report=[];
  for(const c of cases){
    const browser=await c.engine.launch({headless:true});
    const labels=c.lang==='ar'?{inbox:'صندوق AI',tools:'أدوات AI',memory:'الذاكرة والمهام',brief:'الموجز الصباحي'}:{inbox:'AI Inbox',tools:'AI Tools',memory:'Memory & Tasks',brief:'Morning Brief'};
    const openSurface=async(label)=>{
      const page=await browser.newPage({viewport:{width:c.width,height:844}}),errors=[],requests=[];
      page.on('pageerror',e=>errors.push(e.message));
      await page.route('**/api/**',route=>{requests.push(route.request().url());return route.fulfill({status:503,body:'Unexpected provider call'});});
      await page.goto(`http://127.0.0.1:4173/tests/visual/contextual-ai-batch4.html?lang=${c.lang}&theme=${c.theme}`,{waitUntil:'networkidle'});
      await page.locator('[data-lourex-proactive-assistant-mount]').waitFor({state:'attached'});
      await page.evaluate(async()=>{const [{setupVault},{emptyVault},{establishSession}]=await Promise.all([import('/dist/src/storage/vault.js'),import('/dist/src/lib/defaults.js'),import('/dist/src/storage/session.js')]);const initial=emptyVault();initial.company.nameEn='LOUREX Batch 4 QA';const {key}=await setupVault('2468',initial);if(!await establishSession(key))throw new Error('Unable to establish QA session');window.dispatchEvent(new CustomEvent('lourex-account-transition-complete',{detail:{uid:'qa-batch4'}}));});
      const launcher=page.locator('.lourex-ai-launcher');await launcher.waitFor({state:'visible'});await launcher.click();
      const panel=page.locator('#lourex-ai-panel');await panel.waitFor({state:'visible'});
      const trigger=panel.locator('.lourex-ai-hub-trigger');await trigger.waitFor({state:'visible'});await trigger.click();
      const menu=panel.locator('.lourex-ai-hub-menu');await menu.waitFor({state:'visible'});await menu.locator('.lourex-ai-hub-action-copy').first().waitFor({state:'visible'});
      assert.equal(await menu.locator('.lourex-ai-hub-action').count(),4);assert.equal(await menu.locator('.lourex-ai-hub-action-copy strong').count(),4);assert.equal(await menu.locator('.lourex-ai-hub-action-copy small').count(),4);
      for(const name of Object.values(labels))assert.equal(await menu.getByRole('button',{name,exact:true}).count(),1,`exact accessible name remains ${name}`);
      if(label)await menu.getByRole('button',{name:label,exact:true}).click();
      return{page,panel,errors,requests};
    };
    try{
      let s=await openSurface(null);await s.page.screenshot({path:`${out}/${c.name}-${c.width}-${c.lang}-tools.png`,animations:'disabled'});assert.deepEqual(s.errors,[]);assert.deepEqual(s.requests,[]);await s.page.close();
      s=await openSurface(labels.tools);const workflows=s.page.locator('.lourex-ai-workflow-hub');await workflows.waitFor({state:'visible'});assert.equal(await workflows.getAttribute('data-lourex-batch4-ux'),'true');let box=await workflows.boundingBox();assert.ok(box&&box.x>=-1&&box.x+box.width<=c.width+1);await s.page.close();
      s=await openSurface(labels.memory);const manager=s.panel.locator('.lourex-ai-manager');await manager.waitFor({state:'visible'});assert.equal(await manager.getAttribute('data-lourex-batch4-ux'),'true');assert.doesNotMatch(await manager.innerText(),/assistant-task:|workspaceId|branchId/i);box=await manager.boundingBox();const pbox=await s.panel.boundingBox();assert.ok(box&&pbox&&box.x>=pbox.x-1&&box.x+box.width<=pbox.x+pbox.width+1);await s.page.close();
      s=await openSurface(labels.brief);const brief=s.page.locator('.lourex-proactive-brief');await brief.waitFor({state:'visible'});assert.equal(await brief.getAttribute('data-lourex-batch4-ux'),'true');assert.equal(await brief.locator('.lourex-proactive-evidence:visible').count(),0);assert.doesNotMatch(await brief.innerText(),/assistant-task:|workspaceId|branchId/i);await s.page.close();
      s=await openSurface(labels.inbox);const inbox=s.page.locator('.lourex-ai-inbox');await inbox.waitFor({state:'visible'});assert.equal(await inbox.getAttribute('data-lourex-batch4-ux'),'true');box=await inbox.boundingBox();assert.ok(box&&box.x>=-1&&box.x+box.width<=c.width+1);assert.deepEqual(s.errors,[]);assert.deepEqual(s.requests,[]);assert.equal(await s.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);await s.page.screenshot({path:`${out}/${c.name}-${c.width}-${c.lang}-inbox.png`,animations:'disabled'});await s.page.close();
      report.push({engine:c.name,width:c.width,lang:c.lang,theme:c.theme,tools:'PASS',workflows:'PASS',memory:'PASS',brief:'PASS',inbox:'PASS'});
    }catch(error){writeFileSync(`${out}/${c.name}-${c.width}-${c.lang}-failure.txt`,String(error?.stack||error));throw error;}finally{await browser.close();}
  }
  writeFileSync(`${out}/report.json`,JSON.stringify(report,null,2));console.log(`Remediation Batch 4 focused AI tools/routes QA: ${report.length} cases PASS.`);
})().catch(e=>{console.error(e);process.exitCode=1;});