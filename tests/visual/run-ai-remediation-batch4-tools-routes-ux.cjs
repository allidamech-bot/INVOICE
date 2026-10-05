const {chromium,webkit}=require('playwright');
const assert=require('node:assert/strict');
const {mkdirSync,writeFileSync}=require('node:fs');

(async()=>{
  const output='visual-qa-output/ai-remediation-batch4-tools-routes-ux';
  mkdirSync(output,{recursive:true});
  const cases=[
    {engine:chromium,name:'chromium',width:390,lang:'en',theme:'light'},
    {engine:webkit,name:'webkit',width:320,lang:'ar',theme:'dark'}
  ];
  const report=[];
  for(const entry of cases){
    const browser=await entry.engine.launch({headless:true});
    try{
      const page=await browser.newPage({viewport:{width:entry.width,height:844}}),errors=[];
      page.on('pageerror',error=>errors.push(error.message));
      await page.route('**/api/**',route=>route.fulfill({status:503,body:'Provider calls are not expected in Batch 4 presentation QA'}));
      await page.goto(`http://127.0.0.1:4173/tests/visual/contextual-ai-batch4.html?lang=${entry.lang}&theme=${entry.theme}`,{waitUntil:'networkidle'});
      await page.locator('[data-lourex-proactive-assistant-mount]').waitFor({state:'attached'});
      await page.evaluate(async()=>{
        const [{setupVault},{emptyVault},{establishSession}]=await Promise.all([
          import('/dist/src/storage/vault.js'),
          import('/dist/src/lib/defaults.js'),
          import('/dist/src/storage/session.js')
        ]);
        const initial=emptyVault();initial.company.nameEn='LOUREX Batch 4 QA';
        const {key}=await setupVault('2468',initial);
        if(!await establishSession(key))throw new Error('Batch 4 QA could not establish encrypted LOUREX session');
        window.dispatchEvent(new CustomEvent('lourex-account-transition-complete',{detail:{uid:'qa-batch4'}}));
      });

      const ensureAssistant=async()=>{
        const currentPanel=page.locator('#lourex-ai-panel');
        if(!(await currentPanel.isVisible().catch(()=>false))){
          const launcher=page.locator('.lourex-ai-launcher');
          await launcher.waitFor({state:'visible'});
          await launcher.click();
          await currentPanel.waitFor({state:'visible'});
        }
        return currentPanel;
      };
      const openHub=async()=>{
        const currentPanel=await ensureAssistant();
        const trigger=currentPanel.locator('.lourex-ai-hub-trigger');
        await trigger.waitFor({state:'visible'});
        await trigger.click();
        const menu=currentPanel.locator('.lourex-ai-hub-menu');
        await menu.waitFor({state:'visible'});
        await menu.locator('.lourex-ai-hub-action-copy').first().waitFor({state:'visible'});
        return{panel:currentPanel,menu};
      };
      await ensureAssistant();
      const labels=entry.lang==='ar'?{inbox:'صندوق AI',tools:'أدوات AI',memory:'الذاكرة والمهام',brief:'الموجز الصباحي'}:{inbox:'AI Inbox',tools:'AI Tools',memory:'Memory & Tasks',brief:'Morning Brief'};

      let opened=await openHub(),menu=opened.menu;
      const actions=menu.locator('.lourex-ai-hub-action');assert.equal(await actions.count(),4,'Tools hub keeps the four canonical destinations');
      for(let index=0;index<4;index++){assert.equal(await actions.nth(index).locator('.lourex-ai-hub-action-copy strong').count(),1,'Tool action has one human title');assert.equal(await actions.nth(index).locator('.lourex-ai-hub-action-copy small').count(),1,'Tool action has one concise description');}
      for(const label of Object.values(labels))assert.equal(await menu.getByRole('button',{name:label,exact:true}).count(),1,`exact accessible Tool name remains ${label}`);

      await menu.getByRole('button',{name:labels.tools,exact:true}).click();
      const workflowHub=page.locator('.lourex-ai-workflow-hub');await workflowHub.waitFor({state:'visible'});
      assert.equal(await workflowHub.getAttribute('data-lourex-batch4-ux'),'true','AI Workflows uses the Batch 4 presentation owner');
      const workflowBox=await workflowHub.boundingBox();assert.ok(workflowBox&&workflowBox.x>=-1&&workflowBox.x+workflowBox.width<=entry.width+1,'AI Workflows stays horizontally contained');
      let modal=workflowHub.locator('xpath=ancestor::*[contains(@class,"modal")][1]');let close=modal.locator('.modal-header .icon-btn');if(await close.count())await close.click();else await page.keyboard.press('Escape');

      opened=await openHub();menu=opened.menu;await menu.getByRole('button',{name:labels.memory,exact:true}).click();
      const manager=opened.panel.locator('.lourex-ai-manager');await manager.waitFor({state:'visible'});
      assert.equal(await manager.getAttribute('data-lourex-batch4-ux'),'true','Memory & Tasks uses the Batch 4 presentation owner');
      const managerBox=await manager.boundingBox(),panelBox=await opened.panel.boundingBox();assert.ok(managerBox&&panelBox&&managerBox.x>=panelBox.x-1&&managerBox.x+managerBox.width<=panelBox.x+panelBox.width+1,'Memory & Tasks stays inside assistant panel');
      assert.doesNotMatch(await manager.innerText(),/assistant-task:|workspaceId|branchId/i,'Memory & Tasks does not expose technical record keys');
      await manager.locator('.lourex-ai-manager-head > button').click();

      opened=await openHub();menu=opened.menu;await menu.getByRole('button',{name:labels.brief,exact:true}).click();
      const brief=page.locator('.lourex-proactive-brief');await brief.waitFor({state:'visible'});
      assert.equal(await brief.getAttribute('data-lourex-batch4-ux'),'true','Morning Brief uses the Batch 4 presentation owner');
      assert.equal(await brief.locator('.lourex-proactive-evidence:visible').count(),0,'Morning Brief hides raw evidence');
      assert.doesNotMatch(await brief.innerText(),/assistant-task:|workspaceId|branchId/i,'Morning Brief does not expose technical record keys');
      modal=brief.locator('xpath=ancestor::*[contains(@class,"modal")][1]');close=modal.locator('.modal-header .icon-btn');if(await close.count())await close.click();else await page.keyboard.press('Escape');

      opened=await openHub();menu=opened.menu;await menu.getByRole('button',{name:labels.inbox,exact:true}).click();
      const inbox=page.locator('.lourex-ai-inbox');await inbox.waitFor({state:'visible'});
      assert.equal(await inbox.getAttribute('data-lourex-batch4-ux'),'true','AI Inbox uses the Batch 4 presentation owner');
      const inboxBox=await inbox.boundingBox();assert.ok(inboxBox&&inboxBox.x>=-1&&inboxBox.x+inboxBox.width<=entry.width+1,'AI Inbox stays horizontally contained');
      modal=inbox.locator('xpath=ancestor::*[contains(@class,"modal")][1]');close=modal.locator('.modal-header .icon-btn');if(await close.count())await close.click();else await page.keyboard.press('Escape');

      assert.deepEqual(errors,[],'Batch 4 focused browser QA has no page errors');
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'Batch 4 surfaces do not create page horizontal overflow');
      await page.screenshot({path:`${output}/${entry.name}-${entry.width}-${entry.lang}-${entry.theme}.png`,animations:'disabled'});
      report.push({engine:entry.name,width:entry.width,lang:entry.lang,theme:entry.theme,tools:'PASS',workflows:'PASS',memory:'PASS',brief:'PASS',inbox:'PASS'});
      await page.close();
    }finally{await browser.close();}
  }
  writeFileSync(`${output}/report.json`,JSON.stringify(report,null,2));
  console.log(`Remediation Batch 4 focused AI tools/routes QA: ${report.length} Chromium/WebKit cases PASS.`);
})().catch(error=>{console.error(error);process.exitCode=1;});
