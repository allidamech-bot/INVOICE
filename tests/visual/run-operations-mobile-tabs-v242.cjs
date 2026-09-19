const {chromium}=require('playwright');
const {mkdirSync,writeFileSync}=require('node:fs');
const assert=require('node:assert/strict');

const output='visual-qa-output/operations-mobile-tabs-v242';
const viewports=[{width:320,height:568},{width:390,height:844}];

(async()=>{
  mkdirSync(output,{recursive:true});
  const browser=await chromium.launch({headless:true});
  const results=[];
  try{
    for(const viewport of viewports)for(const lang of ['en','ar']){
      const page=await browser.newPage({viewport,hasTouch:true,isMobile:true});
      page.setDefaultTimeout(12000);
      const failures=[];
      page.on('pageerror',error=>failures.push('pageerror: '+String(error)));
      try{
        await page.goto(`http://127.0.0.1:4173/tests/visual/obsidian-financial.html?lang=${lang}&screen=operations`,{waitUntil:'load'});
        await page.evaluate(()=>document.fonts.ready);
        const tabs=page.locator('.operations-tabs');
        await tabs.waitFor();
        const audit=async state=>{
          const geometry=await tabs.evaluate(el=>{
            const css=getComputedStyle(el),rect=el.getBoundingClientRect();
            const buttons=[...el.querySelectorAll('button')].map(button=>{
              const style=getComputedStyle(button),r=button.getBoundingClientRect();
              return {id:button.id,active:button.classList.contains('active'),background:style.backgroundColor,color:style.color,left:r.left,right:r.right,width:r.width};
            });
            const launcher=document.querySelector('.lourex-ai-launcher');
            const launcherRect=launcher?.getBoundingClientRect();
            return {background:css.backgroundColor,borderTopColor:css.borderTopColor,left:rect.left,right:rect.right,top:rect.top,bottom:rect.bottom,width:rect.width,pageScrollWidth:document.documentElement.scrollWidth,viewport:innerWidth,buttons,launcher:launcherRect?{left:launcherRect.left,right:launcherRect.right,top:launcherRect.top,bottom:launcherRect.bottom}:null};
          });
          assert.equal(geometry.background,'rgb(14, 14, 14)',`${state}: Operations tabs escaped Matte Black workspace ${JSON.stringify(geometry)}`);
          assert.ok(geometry.left>=-1&&geometry.right<=viewport.width+1,`${state}: Operations tabs clipped outside phone viewport ${JSON.stringify(geometry)}`);
          assert.ok(geometry.pageScrollWidth<=viewport.width+1,`${state}: Operations tabs cause page overflow ${JSON.stringify(geometry)}`);
          assert.ok(geometry.buttons.length>=4,`${state}: expected all Operations tabs ${JSON.stringify(geometry)}`);
          if(geometry.launcher){
            const overlaps=geometry.launcher.left<geometry.right&&geometry.launcher.right>geometry.left&&geometry.launcher.top<geometry.bottom&&geometry.launcher.bottom>geometry.top;
            assert.equal(overlaps,false,`${state}: LOUREX AI launcher overlaps Operations tabs ${JSON.stringify(geometry)}`);
          }
          for(const button of geometry.buttons){
            assert.ok(button.left>=geometry.left-1&&button.right<=geometry.right+1,`${state}: Operations tab button clipped ${JSON.stringify(button)}`);
            if(button.active)assert.equal(button.background,'rgb(32, 32, 32)',`${state}: active Operations tab is not canonical selected surface ${JSON.stringify(button)}`);
            else assert.equal(button.background,'rgba(0, 0, 0, 0)',`${state}: inactive Operations tab is not transparent ${JSON.stringify(button)}`);
          }
        };
        await audit('suppliers');
        await page.screenshot({path:`${output}/${viewport.width}-${lang}-suppliers.png`,fullPage:true,animations:'disabled'});
        for(const [state,id] of [['purchases','#operations-tab-purchases'],['expenses','#operations-tab-expenses'],['inventory','#operations-tab-inventory']]){
          await page.locator(id).click();
          await page.locator(`#operations-panel-${state}`).waitFor();
          await audit(state);
        }
        await page.screenshot({path:`${output}/${viewport.width}-${lang}-inventory.png`,fullPage:true,animations:'disabled'});
        if(viewport.width===320&&lang==='en'){
          await page.locator('.lourex-ai-launcher').click();
          const panel=page.locator('.lourex-ai-panel');
          await panel.waitFor();
          const panelGeometry=await panel.evaluate(el=>{
            const rect=el.getBoundingClientRect();
            const close=el.querySelector('.lourex-ai-close')?.getBoundingClientRect();
            const compose=el.querySelector('.lourex-ai-compose')?.getBoundingClientRect();
            const viewport=window.visualViewport?.height||innerHeight;
            return {top:rect.top,right:rect.right,bottom:rect.bottom,left:rect.left,viewport,width:innerWidth,close:close?{top:close.top,right:close.right,bottom:close.bottom,left:close.left}:null,compose:compose?{top:compose.top,right:compose.right,bottom:compose.bottom,left:compose.left}:null};
          });
          assert.ok(panelGeometry.top>=-1&&panelGeometry.left>=-1&&panelGeometry.right<=panelGeometry.width+1&&panelGeometry.bottom<=panelGeometry.viewport+1,`AI panel escaped mobile viewport ${JSON.stringify(panelGeometry)}`);
          assert.ok(panelGeometry.close&&panelGeometry.close.top>=panelGeometry.top&&panelGeometry.close.right<=panelGeometry.right,'AI close control must remain reachable');
          assert.ok(panelGeometry.compose&&panelGeometry.compose.bottom<=panelGeometry.viewport+1,'AI composer must remain visible');
          assert.equal(await page.getByRole('button',{name:'Import Supplier Document'}).isVisible(),true,'supplier import entry must remain visible in the AI panel');
          await page.screenshot({path:`${output}/320-en-ai-panel.png`,fullPage:false,animations:'disabled'});
          await page.locator('.lourex-ai-close').click();
        }
      }catch(error){
        failures.push(String(error));
        await page.screenshot({path:`${output}/${viewport.width}-${lang}-failure.png`,fullPage:true,animations:'disabled'}).catch(()=>{});
      }
      results.push({viewport,lang,failures});
      await page.close();
    }
  }finally{
    await browser.close();
  }
  writeFileSync(`${output}/report.json`,JSON.stringify(results,null,2));
  const failures=results.flatMap(result=>result.failures.map(failure=>`${result.viewport.width}/${result.lang}: ${failure}`));
  assert.equal(failures.length,0,failures.join('\n'));
  console.log(`Operations mobile tabs v242: ${results.length} language/phone flows passed.`);
})().catch(error=>{console.error(error);process.exitCode=1;});
