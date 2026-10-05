const {chromium,webkit}=require('playwright');
const assert=require('node:assert/strict');
const {mkdirSync,writeFileSync}=require('node:fs');

(async()=>{
  const out='visual-qa-output/ai-remediation-batch4-tools-routes-ux';mkdirSync(out,{recursive:true});
  const cases=[{engine:chromium,name:'chromium',width:390,lang:'en',theme:'light'},{engine:webkit,name:'webkit',width:320,lang:'ar',theme:'dark'}],report=[];
  for(const c of cases){
    const browser=await c.engine.launch({headless:true});
    try{
      const page=await browser.newPage({viewport:{width:c.width,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
      await page.goto(`http://127.0.0.1:4173/tests/visual/contextual-ai-batch4.html?lang=${c.lang}&theme=${c.theme}`,{waitUntil:'networkidle'});
      await page.locator('[data-lourex-proactive-assistant-mount]').waitFor({state:'attached'});
      await page.evaluate(async()=>{const [{setupVault},{emptyVault},{establishSession}]=await Promise.all([import('/dist/src/storage/vault.js'),import('/dist/src/lib/defaults.js'),import('/dist/src/storage/session.js')]);const initial=emptyVault();initial.company.nameEn='LOUREX Batch 4 QA';const {key}=await setupVault('2468',initial);if(!await establishSession(key))throw new Error('Unable to establish QA session');window.dispatchEvent(new CustomEvent('lourex-account-transition-complete',{detail:{uid:'qa-batch4'}}));});
      const ensurePanel=async()=>{const panel=page.locator('#lourex-ai-panel');if(!await panel.isVisible()){await page.locator('.lourex-ai-launcher').click();await panel.waitFor({state:'visible'});}return panel;};
      const labels=c.lang==='ar'?{inbox:'صندوق AI',memory:'الذاكرة والمهام',brief:'الموجز الصباحي',tools:'أدوات AI'}:{inbox:'AI Inbox',memory:'Memory & Tasks',brief:'Morning Brief',tools:'AI Tools'};
      const openTools=async()=>{
        const panel=await ensurePanel(),plus=panel.locator('.lourex-ai-composer-plus');await plus.waitFor({state:'visible'});
        assert.equal(await panel.locator('.lourex-ai-hub-trigger').isVisible(),false,'legacy persistent Tools hub stays retired');
        await plus.click();const menu=panel.locator('.lourex-ai-plus-menu');await menu.waitFor({state:'visible'});
        assert.equal(await menu.getAttribute('data-view'),'root','plus opens the source gateway');
        const rootCopy=await menu.innerText();assert.match(rootCopy,c.lang==='ar'?/الكاميرا[\s\S]*الصور والملفات[\s\S]*أدوات AI/:/Camera[\s\S]*Photos & files[\s\S]*AI Tools/);
        await menu.locator('.lourex-ai-plus-item').filter({hasText:labels.tools}).last().click();
        await page.waitForFunction(()=>document.querySelector('#lourex-ai-panel .lourex-ai-plus-menu')?.dataset?.view==='tools');
        assert.ok((await menu.locator('.lourex-ai-plus-item').count())>=10,'nested AI Tools keeps the full route set');
        return{panel,menu};
      };

      let opened=await openTools(),menu=opened.menu;
      const nested=await menu.innerText();assert.match(nested,c.lang==='ar'?/صندوق AI[\s\S]*الموجز الصباحي[\s\S]*الذاكرة والمهام/:/AI Inbox[\s\S]*Morning Brief[\s\S]*Memory & Tasks/);

      await menu.locator('.lourex-ai-plus-item').filter({hasText:labels.inbox}).click();
      const inbox=page.locator('.lourex-ai-inbox');await inbox.waitFor({state:'visible'});assert.equal(await inbox.getAttribute('data-lourex-batch4-ux'),'true');let box=await inbox.boundingBox();assert.ok(box&&box.x>=-1&&box.x+box.width<=c.width+1);await page.keyboard.press('Escape');

      opened=await openTools();menu=opened.menu;await menu.locator('.lourex-ai-plus-item').filter({hasText:labels.memory}).click();
      const panel=opened.panel,manager=panel.locator('.lourex-ai-manager');await manager.waitFor({state:'visible'});assert.equal(await manager.getAttribute('data-lourex-batch4-ux'),'true');assert.doesNotMatch(await manager.innerText(),/assistant-task:|workspaceId|branchId/i);box=await manager.boundingBox();const pbox=await panel.boundingBox();assert.ok(box&&pbox&&box.x>=pbox.x-1&&box.x+box.width<=pbox.x+pbox.width+1);await manager.locator('.lourex-ai-manager-head > button').click();

      opened=await openTools();menu=opened.menu;await menu.locator('.lourex-ai-plus-item').filter({hasText:labels.brief}).click();
      const brief=page.locator('.lourex-proactive-brief');await brief.waitFor({state:'visible'});assert.equal(await brief.getAttribute('data-lourex-batch4-ux'),'true');assert.equal(await brief.locator('.lourex-proactive-evidence:visible').count(),0);assert.doesNotMatch(await brief.innerText(),/assistant-task:|workspaceId|branchId/i);await page.keyboard.press('Escape');

      assert.deepEqual(errors,[]);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);await page.screenshot({path:`${out}/${c.name}-${c.width}-${c.lang}-${c.theme}.png`,animations:'disabled'});report.push({engine:c.name,width:c.width,lang:c.lang,theme:c.theme,unifiedPlusTools:'PASS',inbox:'PASS',memory:'PASS',brief:'PASS'});
    }finally{await browser.close();}
  }
  writeFileSync(`${out}/report.json`,JSON.stringify(report,null,2));console.log(`Remediation Batch 4 focused unified + tools/routes QA: ${report.length} cases PASS.`);
})().catch(e=>{console.error(e);process.exitCode=1;});
