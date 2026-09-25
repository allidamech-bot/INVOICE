const {chromium,webkit}=require('playwright');
const assert=require('node:assert/strict');

const base='http://127.0.0.1:4173/tests/visual';
const expected=['draft','rfq','proforma','proforma-invoice','purchase-order','invoice','delivery-note','payment-receipt'];

(async()=>{
  const failures=[];
  for(const browserType of [chromium,webkit]){
    const browser=await browserType.launch({headless:true});
    try{
      for(const lang of ['en','ar']){
        const shell=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
        try{
          await shell.goto(`${base}/obsidian-shell.html?lang=${lang}`,{waitUntil:'load'});

          for(let index=0;index<expected.length;index++){
            await shell.evaluate(()=>{window.shellQa.newKind='';});
            await shell.locator('.ta-mobile-create').click();
            const item=shell.locator('#ta-mobile-create-menu [role="menuitem"]').nth(index);
            await item.click();
            await shell.waitForFunction(kind=>window.shellQa.newKind===kind,expected[index]);
            assert.equal(await shell.locator('#ta-mobile-create-menu').count(),0,`Create menu must close after ${expected[index]}`);
          }

          await shell.locator('.ta-mobile-create').click();
          await shell.locator('#ta-mobile-create-menu [role="menuitem"]').nth(8).click();
          await shell.waitForFunction(()=>window.shellQa.credit===1);
          await shell.locator('.ta-mobile-create').click();
          await shell.locator('#ta-mobile-create-menu [role="menuitem"]').nth(9).click();
          await shell.waitForFunction(()=>window.shellQa.statement===1);

          const tile=await shell.locator('.ta-mobile-create').click().then(async()=>shell.locator('.ta-create-menu-grid>button').first().evaluate(el=>{
            const s=getComputedStyle(el),r=el.getBoundingClientRect();
            return {height:r.height,radius:s.borderRadius,background:s.backgroundImage};
          }));
          assert.ok(tile.height>=70,`Create tile below modern touch target: ${JSON.stringify(tile)}`);
          assert.notEqual(tile.background,'none','Create tile must have differentiated surface treatment');
          await shell.locator('.ta-create-backdrop').click({position:{x:3,y:3}});

          const ai=shell.locator('.lourex-ai-launcher');
          await ai.click();
          const panel=shell.locator('.lourex-ai-panel');
          await panel.waitFor();
          const aiGeometry=await panel.evaluate(el=>{const r=el.getBoundingClientRect();return{height:r.height,viewport:innerHeight};});
          assert.ok(aiGeometry.height<=aiGeometry.viewport*.76,`AI panel is still oversized: ${JSON.stringify(aiGeometry)}`);
          await shell.locator('.lourex-ai-close').click();
          await panel.waitFor({state:'detached'});
        }catch(error){
          failures.push(`${browserType.name()} shell ${lang}: ${error?.stack||error}`);
        }finally{
          await shell.close();
        }

        const editor=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
        try{
          await editor.goto(`${base}/obsidian-editor.html?lang=${lang}&kind=proforma`,{waitUntil:'load'});
          const scroll=editor.locator('.editor-scroll');
          await scroll.waitFor();
          await editor.waitForTimeout(180);
          const before=await editor.evaluate(()=>{
            const root=document.querySelector('.editor-scroll');
            const action=document.querySelector('.mobile-editor-actionbar');
            const nav=document.querySelector('.editor-section-navigator,.ta-editor-step-nav');
            const topbar=document.querySelector('.ta-shell.is-editor>.ta-topbar');
            const support=document.querySelector('[data-editor-support-slot] .ta-editor-support-panels');
            return {
              scrollHeight:root?.scrollHeight||0,
              clientHeight:root?.clientHeight||0,
              overflowY:root?getComputedStyle(root).overflowY:'',
              actionPosition:action?getComputedStyle(action).position:'missing',
              navPosition:nav?getComputedStyle(nav).position:'missing',
              topbarDisplay:topbar?getComputedStyle(topbar).display:'missing',
              supportInside:Boolean(support)
            };
          });
          assert.ok(before.scrollHeight>before.clientHeight+100,`Editor must expose real internal scroll: ${JSON.stringify(before)}`);
          assert.match(before.overflowY,/auto|scroll/);
          assert.notEqual(before.actionPosition,'fixed','Mobile editor action dock must stay in flow');
          assert.notEqual(before.navPosition,'fixed','Editor navigation must stay in flow');
          assert.equal(before.topbarDisplay,'none','Normal app topbar must not duplicate Document Studio header');
          assert.equal(before.supportInside,true,'Lifecycle/payment/profitability panels must be inside editor scroll');

          await scroll.evaluate(el=>{el.scrollTop=el.scrollHeight;});
          await editor.waitForTimeout(80);
          const bottom=await scroll.evaluate(el=>el.scrollTop);
          assert.ok(bottom>100,`Editor cannot scroll down (${bottom})`);
          await scroll.evaluate(el=>{el.scrollTop=0;});
          await editor.waitForTimeout(40);
          assert.ok((await scroll.evaluate(el=>el.scrollTop))<2,'Editor cannot return to top');
        }catch(error){
          failures.push(`${browserType.name()} editor ${lang}: ${error?.stack||error}`);
        }finally{
          await editor.close();
        }

        const docs=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
        try{
          await docs.goto(`${base}/obsidian-documents.html?lang=${lang}`,{waitUntil:'load'});
          const rail=docs.locator('.ta-doc-type-tabs');
          await rail.waitFor();
          const info=await rail.evaluate(el=>({
            clientWidth:el.clientWidth,
            scrollWidth:el.scrollWidth,
            mask:getComputedStyle(el).maskImage||getComputedStyle(el).webkitMaskImage
          }));
          assert.ok(info.scrollWidth>info.clientWidth,`Document rail must overflow horizontally: ${JSON.stringify(info)}`);
          assert.ok(info.mask&&info.mask!=='none',`Document rail needs a visible swipe affordance: ${JSON.stringify(info)}`);
          await rail.evaluate(el=>{el.scrollLeft=el.scrollWidth;});
          await docs.waitForTimeout(50);
          assert.notEqual(await rail.evaluate(el=>el.scrollLeft),0,'Document rail must actually move horizontally');
        }catch(error){
          failures.push(`${browserType.name()} documents ${lang}: ${error?.stack||error}`);
        }finally{
          await docs.close();
        }
      }
    }finally{
      await browser.close();
    }
  }

  assert.equal(failures.length,0,failures.join('\n\n'));
  console.log('v327 production recovery PASS: Create Center, Editor scroll, AI, Documents rail — Chromium + WebKit, EN + AR.');
})().catch(error=>{console.error(error);process.exit(1);});
