const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const {mkdirSync,writeFileSync}=require('node:fs');

const output='visual-qa-output/v326-mobile-shell';
const shellBase='http://127.0.0.1:4173/tests/visual/obsidian-shell.html';
const editorBase='http://127.0.0.1:4173/tests/visual/obsidian-editor.html';

const ownsPoint=async locator=>locator.evaluate(node=>{
  const rect=node.getBoundingClientRect();
  const x=rect.left+rect.width/2,y=rect.top+rect.height/2;
  const top=document.elementFromPoint(x,y);
  return {owns:Boolean(top&&(top===node||node.contains(top))),rect:{left:rect.left,right:rect.right,top:rect.top,bottom:rect.bottom,width:rect.width,height:rect.height},topClass:top instanceof Element?String(top.className||''):''};
});

(async()=>{
  mkdirSync(output,{recursive:true});
  const browser=await chromium.launch({headless:true});
  const results=[];
  const run=async(name,fn)=>{
    const failures=[];
    try{await fn(failures);}catch(error){failures.push(error?.stack||String(error));}
    results.push({name,failures});
  };

  try{
    for(const lang of ['en','ar'])for(const width of [320,390,430])await run(`shell-${lang}-${width}`,async()=>{
      const page=await browser.newPage({viewport:{width,height:844},hasTouch:true,isMobile:true});
      try{
        await page.goto(`${shellBase}?lang=${lang}`,{waitUntil:'load'});
        await page.locator('.ta-mobile-nav').waitFor();

        const geometry=await page.evaluate(()=>{
          const rect=selector=>{const r=document.querySelector(selector)?.getBoundingClientRect();return r?{left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height}:null;};
          return {scrollWidth:document.documentElement.scrollWidth,width:innerWidth,nav:rect('.ta-mobile-nav'),topbar:rect('.ta-topbar')};
        });
        assert.ok(geometry.scrollWidth<=geometry.width+1,`horizontal overflow ${JSON.stringify(geometry)}`);
        assert.ok(geometry.nav&&geometry.nav.left>=0&&geometry.nav.right<=width,`dock outside viewport ${JSON.stringify(geometry.nav)}`);
        assert.ok(geometry.nav.height>=64&&geometry.nav.height<=90,`unexpected dock height ${JSON.stringify(geometry.nav)}`);

        await page.locator('.ta-mobile-create').click();
        const menu=page.locator('#ta-mobile-create-menu');
        await menu.waitFor();
        const menuBox=await menu.boundingBox();
        assert.ok(menuBox&&menuBox.x>=0&&menuBox.x+menuBox.width<=width+1,`Create surface outside viewport ${JSON.stringify(menuBox)}`);
        assert.ok(menuBox&&menuBox.height<=844*.72,`Create surface too tall ${JSON.stringify(menuBox)}`);
        const firstHit=await ownsPoint(menu.locator('[role="menuitem"]').first());
        assert.equal(firstHit.owns,true,`Create option is covered ${JSON.stringify(firstHit)}`);
        const aiWhileCreate=await page.locator('.lourex-ai-launcher').evaluate(el=>({opacity:getComputedStyle(el).opacity,pointer:getComputedStyle(el).pointerEvents})).catch(()=>null);
        if(aiWhileCreate)assert.equal(aiWhileCreate.pointer,'none','AI launcher must not intercept Create surface');
        await page.keyboard.press('Escape');
        await menu.waitFor({state:'detached'});

        await page.locator('.ta-mobile-nav button[aria-controls="ta-mobile-more"]').click();
        const more=page.locator('#ta-mobile-more');
        await more.waitFor();
        const moreBox=await more.boundingBox();
        const navBox=await page.locator('.ta-mobile-nav').boundingBox();
        assert.ok(moreBox&&moreBox.x>=0&&moreBox.x+moreBox.width<=width+1,`More surface outside viewport ${JSON.stringify(moreBox)}`);
        assert.ok(moreBox&&moreBox.height<=844*.72,`More surface too tall ${JSON.stringify(moreBox)}`);
        assert.ok(moreBox&&navBox&&moreBox.y+moreBox.height<=navBox.y+1,`More overlaps dock ${JSON.stringify({moreBox,navBox})}`);
        const moreHit=await ownsPoint(more.locator('.ta-sheet-link').first());
        assert.equal(moreHit.owns,true,`More action is covered ${JSON.stringify(moreHit)}`);
        await page.screenshot({path:`${output}/shell-${lang}-${width}.png`,animations:'disabled'});
      }finally{await page.close();}
    });

    for(const lang of ['en','ar'])await run(`editor-preview-${lang}`,async()=>{
      const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
      try{
        await page.goto(`${editorBase}?lang=${lang}&kind=invoice`,{waitUntil:'load'});
        await page.locator('.editor-screen').waitFor();
        const previewButton=page.locator('.mobile-action-buttons button').filter({hasText:lang==='ar'?'معاينة':'Preview'}).first();
        await previewButton.click();
        const preview=page.locator('.mobile-preview-overlay');
        await preview.waitFor({state:'visible'});
        const headerHit=await ownsPoint(preview.locator(':scope > header'));
        assert.equal(headerHit.owns,true,`Preview chrome header is covered ${JSON.stringify(headerHit)}`);
        const layers=await page.evaluate(()=>{
          const preview=document.querySelector('.mobile-preview-overlay');
          const ai=document.querySelector('.lourex-ai-launcher');
          return {previewZ:preview?getComputedStyle(preview).zIndex:null,aiOpacity:ai?getComputedStyle(ai).opacity:null,aiPointer:ai?getComputedStyle(ai).pointerEvents:null,scrollWidth:document.documentElement.scrollWidth,width:innerWidth};
        });
        assert.equal(layers.previewZ,'1400','Preview must use the v326 overlay level');
        if(layers.aiOpacity!==null)assert.equal(layers.aiPointer,'none','AI launcher must not intercept Preview');
        assert.ok(layers.scrollWidth<=layers.width+1,`Preview has horizontal viewport overflow ${JSON.stringify(layers)}`);
        await page.screenshot({path:`${output}/preview-${lang}-390.png`,animations:'disabled'});
      }finally{await page.close();}
    });
  }finally{await browser.close();}

  writeFileSync(`${output}/report.json`,JSON.stringify(results,null,2));
  const failures=results.flatMap(result=>result.failures.map(failure=>`${result.name}: ${failure}`));
  assert.equal(failures.length,0,failures.join('\n\n'));
  console.log(`v326 mobile shell: ${results.length} scenarios passed.`);
})().catch(error=>{console.error(error);process.exitCode=1;});
