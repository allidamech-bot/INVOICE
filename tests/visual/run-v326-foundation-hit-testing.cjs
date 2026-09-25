const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const {mkdirSync,writeFileSync}=require('node:fs');

const output='visual-qa-output/v326-foundation';
const base='http://127.0.0.1:4173/tests/visual/obsidian-shell.html';

(async()=>{
  mkdirSync(output,{recursive:true});
  const browser=await chromium.launch({headless:true});
  const results=[];
  try{
    for(const lang of ['en','ar']){
      for(const width of [320,390,430]){
        const page=await browser.newPage({viewport:{width,height:844},hasTouch:true,isMobile:true});
        const failures=[];
        try{
          await page.goto(`${base}?lang=${lang}`,{waitUntil:'load'});
          const create=page.locator('.ta-mobile-create');
          await create.click();
          const menu=page.locator('#ta-mobile-create-menu');
          await menu.waitFor();

          const hit=await menu.locator('[role="menuitem"]').nth(2).evaluate(button=>{
            const rect=button.getBoundingClientRect();
            const x=rect.left+rect.width/2;
            const y=rect.top+rect.height/2;
            const top=document.elementFromPoint(x,y);
            return {
              x,y,
              buttonVisible:rect.width>0&&rect.height>0,
              topTag:top?.tagName||'',
              topClass:top instanceof Element?top.className:'',
              ownsHit:Boolean(top&&(top===button||button.contains(top))),
              menuRect:button.closest('#ta-mobile-create-menu')?.getBoundingClientRect(),
              viewport:{width:innerWidth,height:innerHeight}
            };
          });
          assert.equal(hit.buttonVisible,true,`Create item has no geometry: ${JSON.stringify(hit)}`);
          assert.equal(hit.ownsHit,true,`Create item is visually covered: ${JSON.stringify(hit)}`);
          assert.ok(hit.menuRect.left>=-1&&hit.menuRect.right<=hit.viewport.width+1,`Create menu leaves viewport: ${JSON.stringify(hit)}`);

          await menu.locator('[role="menuitem"]').nth(2).click();
          await page.waitForFunction(()=>window.shellQa.newKind==='proforma');
          assert.equal(await page.evaluate(()=>window.shellQa.newKind),'proforma','Create menu click must reach the document boundary');
          await page.locator('#ta-mobile-create-menu').waitFor({state:'detached'});

          const more=page.locator('.ta-mobile-nav button[aria-controls="ta-mobile-more"]');
          await more.click();
          const sheet=page.locator('#ta-mobile-more');
          await sheet.waitFor();
          const moreHit=await sheet.locator('.ta-sheet-link').first().evaluate(button=>{
            const rect=button.getBoundingClientRect();
            const top=document.elementFromPoint(rect.left+rect.width/2,rect.top+rect.height/2);
            return Boolean(top&&(top===button||button.contains(top)));
          });
          assert.equal(moreHit,true,'More sheet action must own its hit-test point');

          await page.screenshot({path:`${output}/shell-${lang}-${width}.png`,fullPage:false,animations:'disabled'});
        }catch(error){failures.push(error?.stack||String(error));}
        results.push({lang,width,failures});
        await page.close();
      }
    }
  }finally{await browser.close();}

  writeFileSync(`${output}/report.json`,JSON.stringify(results,null,2));
  const failures=results.flatMap(result=>result.failures.map(failure=>`${result.lang}-${result.width}: ${failure}`));
  assert.equal(failures.length,0,failures.join('\n\n'));
  console.log(`v326 foundation hit-testing: ${results.length} mobile scenarios passed.`);
})().catch(error=>{console.error(error);process.exitCode=1;});
