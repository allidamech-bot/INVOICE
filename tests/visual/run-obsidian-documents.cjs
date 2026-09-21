const {chromium}=require('playwright');
const {mkdirSync,writeFileSync}=require('node:fs');
const assert=require('node:assert/strict');
const output='visual-qa-output/obsidian-documents';
const scenarios=[{width:1440,height:1000},{width:1024,height:900},{width:820,height:1180},{width:768,height:1024},{width:390,height:844},{width:320,height:568}];
(async()=>{
  mkdirSync(output,{recursive:true});
  const browser=await chromium.launch({headless:true}),results=[];
  try{
    for(const viewport of scenarios)for(const lang of ['en','ar']){
      const page=await browser.newPage({viewport,hasTouch:viewport.width<=820,isMobile:viewport.width<=820});
      page.setDefaultTimeout(12000);
      const failures=[];page.on('pageerror',e=>failures.push(String(e)));
      const check=async(selector)=>{
        const issues=await page.locator(selector).evaluate(root=>{
          const issues=[];
          if(document.documentElement.scrollWidth>innerWidth+1)issues.push('horizontal page overflow');
          for(const el of root.querySelectorAll('*')){
            const r=el.getBoundingClientRect(),css=getComputedStyle(el);
            if(!r.width||!r.height||css.visibility==='hidden')continue;
            if(css.backgroundColor==='rgb(255, 255, 255)')issues.push('white surface '+el.className);
          }
          return issues;
        });failures.push(...issues);
      };
      try{
        await page.addInitScript(()=>localStorage.setItem('lourex-ui-theme','dark'));
        await page.goto('http://127.0.0.1:4173/tests/visual/obsidian-documents.html?lang='+lang,{waitUntil:'load'});
        await page.evaluate(()=>{
          document.documentElement.dataset.uiTheme='dark';
          document.documentElement.dataset.uiThemePreference='dark';
          document.documentElement.style.colorScheme='dark';
        });
        await page.locator('.documents-register').waitFor();
        await page.evaluate(()=>document.fonts.ready);
        await page.waitForTimeout(450);
        const theme=await page.evaluate(()=>{
          const resolved=value=>{const probe=document.createElement('i');probe.style.cssText=`position:fixed;visibility:hidden;background:${value}`;document.body.appendChild(probe);const color=getComputedStyle(probe).backgroundColor;probe.remove();return color;};
          return{accent:resolved('var(--mf-accent)'),surface:resolved('var(--mf-surface)'),surface2:resolved('var(--mf-surface-2)')};
        });
        assert.equal(await page.locator('.documents-register-row').count(),6);
        assert.equal(await page.locator('.documents-heading-actions .btn').first().isVisible(),true,'creation action visible');
        await check('.documents-workspace-v2');
        assert.equal(await page.locator('.documents-heading-actions .btn-primary').evaluate(el=>getComputedStyle(el).backgroundColor),theme.accent,'primary action uses the active theme accent');
        const draftContrast=await page.locator('.document-status-pill.status-draft').evaluate(el=>{
          const rgb=value=>value.match(/[\d.]+/g).slice(0,3).map(Number);
          const lum=value=>rgb(value).map(x=>{x/=255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4}).reduce((sum,x,i)=>sum+x*[.2126,.7152,.0722][i],0);
          let bg='rgb(0, 0, 0)';for(let node=el;node;node=node.parentElement){const value=getComputedStyle(node).backgroundColor;if(value!=='rgba(0, 0, 0, 0)'&&value!=='transparent'){bg=value;break;}}
          const a=lum(getComputedStyle(el).color),b=lum(bg);return(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
        });
        assert.ok(draftContrast>=4.5,`draft status contrast ${draftContrast.toFixed(2)}`);
        await page.screenshot({path:output+'/'+viewport.width+'-'+lang+'-list.png',fullPage:true,animations:'disabled'});
        const search=page.locator('.documents-search-input');
        await search.fill('INV-2026-0042');
        assert.equal(await page.locator('.documents-register-row').count(),1);
        await search.fill('no-such-document');
        await page.locator('.documents-empty').waitFor();
        await check('.documents-empty');
        await search.fill('');
        await page.locator('.documents-filter-toggle').click();
        await page.screenshot({path:output+'/'+viewport.width+'-'+lang+'-filters.png',fullPage:true,animations:'disabled'});
        await page.locator('.documents-advanced-filters select').nth(1).selectOption('partially-paid');
        assert.equal(await page.locator('.documents-register-row').count(),1);
        assert.match(await page.locator('.register-identity').innerText(),/0041/);
        await page.locator('.documents-clear-filters').click();
        await page.locator('.documents-filter-toggle').click();
        await page.locator('.documents-advanced-filters select').nth(2).selectOption('EUR');
        assert.equal(await page.locator('.documents-register-row').count(),1);
        await page.locator('.documents-clear-filters').click();
        const actions=page.locator('.documents-register-row').last().locator(viewport.width<=900?'.mobile-actions button':'.desktop-actions button');
        await actions.scrollIntoViewIfNeeded();
        await actions.click();
        const menu=page.locator(viewport.width<=900?'.mobile-document-action-sheet':'.document-action-popover');
        await menu.waitFor({state:'visible'});
        const menuState=await menu.evaluate(el=>{
          const r=el.getBoundingClientRect();
          return {inside:r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight,
            hit:[...el.querySelectorAll('button')].every(button=>{
              const b=button.getBoundingClientRect();
              if(b.top<r.top||b.bottom>r.bottom)return true;
              return button.contains(document.elementFromPoint(b.x+b.width/2,b.y+b.height/2));
            }),bg:getComputedStyle(el).backgroundColor};
        });
        assert.equal(menuState.inside,true,'menu outside viewport');
        assert.equal(menuState.hit,true,'menu occluded');
        assert.equal(menuState.bg,theme.surface2,'action menu uses the semantic elevated surface');
        const portal=page.locator(viewport.width<=900?'.mobile-document-action-portal':'.document-desktop-action-portal');
        assert.equal(await portal.evaluate(el=>getComputedStyle(el).backgroundColor),'rgba(0, 0, 0, 0)','portal must preserve the workspace beneath it');
        await page.screenshot({path:output+'/'+viewport.width+'-'+lang+'-menu.png',animations:'disabled'});
        await page.keyboard.press('End');
        assert.equal(await menu.locator('button').last().evaluate(el=>el===document.activeElement),true);
        await page.keyboard.press('Escape');
        assert.equal(await actions.evaluate(el=>el===document.activeElement),true,'focus restored');
        await actions.click();
        await menu.locator('button').first().click();
        await page.locator('.document-detail-page').waitFor();
        await check('.document-detail-page');
        assert.equal(await page.locator('.document-detail-value>strong').innerText(),'3,900.00 USD');
        await page.screenshot({path:output+'/'+viewport.width+'-'+lang+'-detail.png',fullPage:true,animations:'disabled'});
        await page.locator('.document-detail-more button').click();
        await menu.waitFor({state:'visible'});
        await page.keyboard.press('Escape');
        await page.locator('.document-detail-back').click();
        await page.locator('.documents-register').waitFor();
      }catch(error){failures.push(String(error));await page.screenshot({path:output+'/'+viewport.width+'-'+lang+'-failure.png',fullPage:true}).catch(()=>{});}
      results.push({viewport,lang,failures});await page.close();
    }
  }finally{await browser.close();}
  writeFileSync(output+'/report.json',JSON.stringify(results,null,2));
  const failures=results.flatMap(r=>r.failures.map(f=>r.viewport.width+'/'+r.lang+': '+f));
  assert.equal(failures.length,0,failures.join('\n'));
  console.log('Obsidian documents: '+results.length+' language/viewport flows passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
