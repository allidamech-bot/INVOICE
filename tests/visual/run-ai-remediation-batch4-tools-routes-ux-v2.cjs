const {chromium,webkit}=require('playwright');
const assert=require('node:assert/strict');
const {mkdirSync,writeFileSync}=require('node:fs');

(async()=>{
  const out='visual-qa-output/ai-remediation-batch4-tools-routes-ux';
  mkdirSync(out,{recursive:true});
  const cases=[
    {engine:chromium,name:'chromium',width:390,lang:'en',theme:'light'},
    {engine:webkit,name:'webkit',width:320,lang:'ar',theme:'dark'}
  ];
  const report=[];
  for(const c of cases){
    const browser=await c.engine.launch({headless:true});
    try{
      const page=await browser.newPage({viewport:{width:c.width,height:844}}),errors=[],requests=[];
      page.on('pageerror',e=>errors.push(e.message));
      await page.route('**/api/**',route=>{requests.push(route.request().url());return route.fulfill({status:503,body:'Provider calls are not expected in Batch 4 presentation QA'});});
      await page.goto(`http://127.0.0.1:4173/tests/visual/contextual-ai-batch4.html?lang=${c.lang}&theme=${c.theme}`,{waitUntil:'networkidle'});
      await page.locator('[data-lourex-proactive-assistant-mount]').waitFor({state:'attached'});
      await page.evaluate(async()=>{
        const [{setupVault},{emptyVault},{establishSession}]=await Promise.all([import('/dist/src/storage/vault.js'),import('/dist/src/lib/defaults.js'),import('/dist/src/storage/session.js')]);
        const initial=emptyVault();initial.company.nameEn='LOUREX Batch 4 QA';
        const {key}=await setupVault('2468',initial);
        if(!await establishSession(key))throw new Error('Unable to establish QA session');
        window.dispatchEvent(new CustomEvent('lourex-account-transition-complete',{detail:{uid:'qa-batch4'}}));
      });
      const ensureAssistant=async()=>{
        const p=page.locator('#lourex-ai-panel');
        if(!(await p.isVisible().catch(()=>false))){const launcher=page.locator('.lourex-ai-launcher');await launcher.waitFor({state:'visible'});await launcher.click();await p.waitFor({state:'visible'});}
        const trigger=p.locator('.lourex-ai-hub-trigger');await trigger.waitFor({state:'visible'});
        return p;
      };
      const openHub=async()=>{const p=await ensureAssistant();const trigger=p.locator('.lourex-ai-hub-trigger');await trigger.click();const menu=p.locator('.lourex-ai-hub-menu');await menu.waitFor({state:'visible'});await menu.locator('.lourex-ai-hub-action-copy').first().waitFor({state:'visible'});return{p,menu};};
      const closeModal=async root=>{const modal=root.locator('xpath=ancestor::*[contains(@class,"modal")][1]');const close=modal.locator('.modal-header .icon-btn');if(await close.count())await close.click();else await page.keyboard.press('Escape');};
      const labels=c.lang==='ar'?{inbox:'صندوق AI',tools:'أدوات AI',memory:'الذاكرة والمهام',brief:'الموجز الصباحي'}:{inbox:'AI Inbox',tools:'AI Tools',memory:'Memory & Tasks',brief:'Morning Brief'};

      await ensureAssistant();
      let opened=await openHub(),menu=opened.menu;
      assert.equal(await menu.locator('.lourex-ai-hub-action').count(),4,'Tools hub keeps four canonical destinations');
      assert.equal(await menu.locator('.lourex-ai-hub-action-copy strong').count(),4,'Tools hub exposes four human titles');
      assert.equal(await menu.locator('.lourex-ai-hub-action-copy small').count(),4,'Tools hub exposes four concise descriptions');
      for(const label of Object.values(labels))assert.equal(await menu.getByRole('button',{name:label,exact:true}).count(),1,`exact accessible name remains ${label}`);

      await menu.getByRole('button',{name:labels.tools,exact:true}).click();
      const workflows=page.locator('.lourex-ai-workflow-hub');await workflows.waitFor({state:'visible'});assert.equal(await workflows.getAttribute('data-lourex-batch4-ux'),'true');let box=await workflows.boundingBox();assert.ok(box&&box.x>=-1&&box.x+box.width<=c.width+1,'AI Workflows stays contained');await closeModal(workflows);

      opened=await openHub();menu=opened.menu;await menu.getByRole('button',{name:labels.memory,exact:true}).click();
      const manager=opened.p.locator('.lourex-ai-manager');await manager.waitFor({state:'visible'});assert.equal(await manager.getAttribute('data-lourex-batch4-ux'),'true');assert.doesNotMatch(await manager.innerText(),/assistant-task:|workspaceId|branchId/i);box=await manager.boundingBox();const pbox=await opened.p.boundingBox();assert.ok(box&&pbox&&box.x>=pbox.x-1&&box.x+box.width<=pbox.x+pbox.width+1,'Memory & Tasks stays inside assistant panel');await manager.locator('.lourex-ai-manager-head > button').click();

      opened=await openHub();menu=opened.menu;await menu.getByRole('button',{name:labels.brief,exact:true}).click();
      const brief=page.locator('.lourex-proactive-brief');await brief.waitFor({state:'visible'});assert.equal(await brief.getAttribute('data-lourex-batch4-ux'),'true');assert.equal(await brief.locator('.lourex-proactive-evidence:visible').count(),0);assert.doesNotMatch(await brief.innerText(),/assistant-task:|workspaceId|branchId/i);await closeModal(brief);

      opened=await openHub();menu=opened.menu;await menu.getByRole('button',{name:labels.inbox,exact:true}).click();
      const inbox=page.locator('.lourex-ai-inbox');await inbox.waitFor({state:'visible'});assert.equal(await inbox.getAttribute('data-lourex-batch4-ux'),'true');box=await inbox.boundingBox();assert.ok(box&&box.x>=-1&&box.x+box.width<=c.width+1,'AI Inbox stays contained');await closeModal(inbox);

      assert.deepEqual(requests,[],'presentation QA must not call AI/provider APIs');
      assert.deepEqual(errors,[],'Batch 4 browser QA must have no page errors');
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'Batch 4 surfaces must remain overflow-free');
      await page.screenshot({path:`${out}/${c.name}-${c.width}-${c.lang}-${c.theme}.png`,animations:'disabled'});
      report.push({engine:c.name,width:c.width,lang:c.lang,theme:c.theme,tools:'PASS',workflows:'PASS',memory:'PASS',brief:'PASS',inbox:'PASS',providerCalls:requests.length});
      await page.close();
    }catch(error){writeFileSync(`${out}/${c.name}-${c.width}-${c.lang}-failure.txt`,String(error?.stack||error));throw error;}finally{await browser.close();}
  }
  writeFileSync(`${out}/report.json`,JSON.stringify(report,null,2));
  console.log(`Remediation Batch 4 focused AI tools/routes QA: ${report.length} cases PASS.`);
})().catch(e=>{console.error(e);process.exitCode=1;});
