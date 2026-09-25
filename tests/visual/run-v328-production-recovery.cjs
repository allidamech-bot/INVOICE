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
            await shell.locator('#ta-mobile-create-menu [role="menuitem"]').nth(index).click();
            await shell.waitForFunction(kind=>window.shellQa.newKind===kind,expected[index]);
            assert.equal(await shell.locator('#ta-mobile-create-menu').count(),0,`Create menu did not close after ${expected[index]}`);
          }
          await shell.locator('.ta-mobile-create').click();
          await shell.locator('#ta-mobile-create-menu [role="menuitem"]').nth(8).click();
          await shell.waitForFunction(()=>window.shellQa.credit===1);
          await shell.locator('.ta-mobile-create').click();
          await shell.locator('#ta-mobile-create-menu [role="menuitem"]').nth(9).click();
          await shell.waitForFunction(()=>window.shellQa.statement===1);

          const alignment=await shell.evaluate(()=>{
            const ai=document.querySelector('.lourex-ai-launcher');
            const search=document.querySelector('.ta-search-trigger');
            if(!(ai instanceof HTMLElement)||!(search instanceof HTMLElement))return null;
            const a=ai.getBoundingClientRect(),s=search.getBoundingClientRect();
            return{ai:{w:a.width,h:a.height,cY:a.top+a.height/2},search:{w:s.width,h:s.height,cY:s.top+s.height/2}};
          });
          assert.ok(alignment,`Missing header actions: ${JSON.stringify(alignment)}`);
          assert.ok(Math.abs(alignment.ai.w-44)<1.1&&Math.abs(alignment.ai.h-44)<1.1,`AI launcher must be 44x44: ${JSON.stringify(alignment)}`);
          assert.ok(Math.abs(alignment.ai.cY-alignment.search.cY)<=2,`AI/search are not vertically centered: ${JSON.stringify(alignment)}`);
        }catch(error){failures.push(`${browserType.name()} shell ${lang}: ${error?.stack||error}`);}finally{await shell.close();}

        const editor=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
        try{
          await editor.goto(`${base}/obsidian-editor.html?lang=${lang}&kind=proforma`,{waitUntil:'load'});
          const scroll=editor.locator('.editor-scroll');
          await scroll.waitFor();await editor.waitForTimeout(160);
          const info=await editor.evaluate(()=>{
            const root=document.querySelector('.editor-scroll');
            const nav=document.querySelector('.ta-editor-step-nav');
            const action=document.querySelector('.mobile-editor-actionbar');
            const selector=document.querySelector('.template-selector');
            const mini=document.querySelector('.template-mini-static');
            if(!(root instanceof HTMLElement))return null;
            const navRect=nav instanceof HTMLElement?nav.getBoundingClientRect():null;
            return{
              scrollHeight:root.scrollHeight,clientHeight:root.clientHeight,overflowY:getComputedStyle(root).overflowY,
              navInside:Boolean(nav&&root.contains(nav)),navPosition:nav instanceof HTMLElement?getComputedStyle(nav).position:'missing',navTop:navRect?.top??-1,
              actionPosition:action instanceof HTMLElement?getComputedStyle(action).position:'missing',
              templateColumns:selector instanceof HTMLElement?getComputedStyle(selector).gridTemplateColumns:'',
              templateHeight:mini instanceof HTMLElement?mini.getBoundingClientRect().height:0
            };
          });
          assert.ok(info&&info.scrollHeight>info.clientHeight+120,`Editor must expose real scroll: ${JSON.stringify(info)}`);
          assert.match(info.overflowY,/auto|scroll/);
          assert.equal(info.navInside,true,`Stepper must live inside editor scroll: ${JSON.stringify(info)}`);
          assert.notEqual(info.navPosition,'fixed');
          assert.notEqual(info.actionPosition,'fixed');
          assert.ok(info.templateColumns&&!info.templateColumns.includes(' '),`Phone template gallery must be one column: ${JSON.stringify(info)}`);
          assert.ok(info.templateHeight>=110,`Template preview is too cramped: ${JSON.stringify(info)}`);
          await scroll.evaluate(el=>{el.scrollTop=el.scrollHeight;});await editor.waitForTimeout(60);
          assert.ok((await scroll.evaluate(el=>el.scrollTop))>100,'Editor cannot scroll to bottom');
          await scroll.evaluate(el=>{el.scrollTop=0;});await editor.waitForTimeout(40);
          assert.ok((await scroll.evaluate(el=>el.scrollTop))<2,'Editor cannot return to top');
        }catch(error){failures.push(`${browserType.name()} editor ${lang}: ${error?.stack||error}`);}finally{await editor.close();}

        const dashboard=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
        try{
          await dashboard.goto(`${base}/obsidian-dashboard.html?lang=${lang}`,{waitUntil:'load'});
          const card=dashboard.locator('.lourex-advisor-card');
          await card.waitFor();
          const cardInfo=await card.evaluate(el=>{const r=el.getBoundingClientRect();const mark=el.querySelector('.lourex-advisor-mark');const starters=el.querySelector('.lourex-advisor-starters');return{height:r.height,mark:mark instanceof HTMLElement?mark.getBoundingClientRect().height:0,columns:starters instanceof HTMLElement?getComputedStyle(starters).gridTemplateColumns:''};});
          assert.ok(cardInfo.height<=500,`Dashboard advisor is still oversized: ${JSON.stringify(cardInfo)}`);
          assert.ok(cardInfo.mark>=38&&cardInfo.mark<=48,`Advisor robot mark has wrong scale: ${JSON.stringify(cardInfo)}`);
          assert.ok(cardInfo.columns&&cardInfo.columns!=='none',`Advisor starters need a modern grid: ${JSON.stringify(cardInfo)}`);
        }catch(error){failures.push(`${browserType.name()} dashboard ${lang}: ${error?.stack||error}`);}finally{await dashboard.close();}
      }
    }finally{await browser.close();}
  }
  assert.equal(failures.length,0,failures.join('\n\n'));
  console.log('v328 production recovery PASS: create actions, header AI alignment, editor scroll/stepper, templates and dashboard advisor — Chromium + WebKit, EN + AR.');
})().catch(error=>{console.error(error);process.exit(1);});
