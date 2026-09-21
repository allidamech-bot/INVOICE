const {chromium}=require('playwright');
const {mkdirSync,writeFileSync}=require('node:fs');
const assert=require('node:assert/strict');
const output='visual-qa-output/obsidian-shell';
const scenarios=[{width:1440,height:900,touch:false},{width:1024,height:768,touch:false},{width:820,height:1180,touch:true},{width:390,height:844,touch:true}];
(async()=>{
  mkdirSync(output,{recursive:true});
  const browser=await chromium.launch({headless:true});
  const results=[];
  try{
    for(const scenario of scenarios)for(const lang of ['en','ar']){
      const page=await browser.newPage({viewport:{width:scenario.width,height:scenario.height},hasTouch:scenario.touch,isMobile:scenario.touch});
      const errors=[];page.on('pageerror',error=>errors.push(String(error)));
      await page.goto(`http://127.0.0.1:4173/tests/visual/obsidian-shell.html?lang=${lang}`,{waitUntil:'load'});
      await page.evaluate(()=>{
        document.documentElement.dataset.uiTheme='dark';
        document.documentElement.dataset.uiThemePreference='dark';
        document.documentElement.style.colorScheme='dark';
      });
      await page.locator('.workspace-shell').waitFor();
      // Theme changes intentionally animate in the application. Sample only after the
      // transition settles so this QA checks the semantic end state, not an in-flight blend.
      await page.waitForTimeout(450);
      const state=await page.evaluate(()=>{
        const info=selector=>{const el=document.querySelector(selector);if(!el)return null;const s=getComputedStyle(el),r=el.getBoundingClientRect();return {display:s.display,background:s.backgroundColor,color:s.color,width:r.width,height:r.height,left:r.left,right:r.right,bottom:r.bottom,boxShadow:s.boxShadow,paddingBottom:s.paddingBottom};};
        const resolvedBackground=value=>{const probe=document.createElement('i');probe.style.cssText=`position:fixed;visibility:hidden;background:${value}`;document.body.appendChild(probe);const color=getComputedStyle(probe).backgroundColor;probe.remove();return color;};
        const mobileTheme=innerWidth<=900;
        return {
          viewport:innerWidth,scrollWidth:document.documentElement.scrollWidth,dir:document.documentElement.dir,
          sidebar:info('.workspace-sidebar'),topbar:info('.workspace-topbar'),active:info('.shell-nav-button.active'),create:info('.shell-create-button'),mobileCreate:info('.mobile-create-button'),bottomNav:info('.mobile-bottom-nav'),content:info('.workspace-content'),logoText:document.querySelector('.shell-brand-button .brand-words strong')?.textContent,
          expected:{shell:resolvedBackground('var(--mf-shell)'),canvas:resolvedBackground('var(--mf-canvas)'),surface:resolvedBackground('var(--mf-surface)'),accent:resolvedBackground('var(--mf-accent)'),topbar:resolvedBackground(mobileTheme?'var(--mf-shell)':'color-mix(in srgb,var(--mf-shell) 94%,transparent)'),bottomNav:resolvedBackground('color-mix(in srgb,var(--mf-shell) 96%,transparent)')}
        };
      });
      const failures=[...errors];
      if(state.scrollWidth>scenario.width+1)failures.push(`horizontal overflow ${state.scrollWidth}`);
      if(state.topbar?.background!==state.expected.topbar)failures.push(`topbar ${state.topbar?.background}; expected ${state.expected.topbar}`);
      if(state.content?.background!==state.expected.canvas)failures.push(`content ${state.content?.background}; expected ${state.expected.canvas}`);
      if(scenario.width>960){
        if(!state.sidebar||state.sidebar.display==='none')failures.push('desktop sidebar hidden');
        if(state.sidebar?.background!==state.expected.shell)failures.push(`sidebar ${state.sidebar?.background}; expected ${state.expected.shell}`);
        if(state.bottomNav?.display!=='none')failures.push('desktop bottom navigation visible');
        if(state.logoText!=='LOUREX')failures.push(`fallback brand ${state.logoText}`);
        const startShadow=lang==='ar'?state.active?.boxShadow.includes('-3px'):state.active?.boxShadow.includes('3px');
        if(!startShadow)failures.push(`logical active indicator ${state.active?.boxShadow}`);
      }else{
        if(state.sidebar?.display!=='none')failures.push('mobile sidebar visible');
        if(!state.bottomNav||state.bottomNav.display==='none')failures.push('mobile bottom navigation hidden');
        if(state.bottomNav?.background!==state.expected.bottomNav)failures.push(`mobile navigation ${state.bottomNav?.background}; expected ${state.expected.bottomNav}`);
        if(state.bottomNav&&state.bottomNav.height<65)failures.push(`mobile navigation height ${state.bottomNav.height}`);
        if(state.mobileCreate?.background!==state.expected.accent)failures.push(`mobile create ${state.mobileCreate?.background}; expected ${state.expected.accent}`);
      }
      if(scenario.width>960&&state.create?.background!==state.expected.accent)failures.push(`primary create ${state.create?.background}; expected ${state.expected.accent}`);
      if(scenario.width<=960){
        const more=page.getByRole('button',{name:lang==='ar'?'المزيد':'More'}).last();
        await more.click();
        await page.locator('.mobile-more-sheet').waitFor();
        const sheet=await page.locator('.mobile-more-sheet').evaluate(el=>({background:getComputedStyle(el).backgroundColor,bottom:el.getBoundingClientRect().bottom,height:el.getBoundingClientRect().height}));
        if(sheet.background!==state.expected.surface)failures.push(`more sheet ${sheet.background}; expected ${state.expected.surface}`);
        if(sheet.bottom>scenario.height-64)failures.push(`more sheet overlaps navigation ${sheet.bottom}`);
      }else{
        await page.locator('.shell-create-button').click();
        if(!(await page.locator('.desktop-shell-new-menu').isVisible()))failures.push('desktop create menu did not open');
        const menu=await page.locator('.desktop-shell-new-menu').evaluate(el=>({background:getComputedStyle(el).backgroundColor,stack:getComputedStyle(el.querySelector('button>span')).display}));
        if(menu.background!==state.expected.surface)failures.push(`desktop create menu ${menu.background}; expected ${state.expected.surface}`);
        if(menu.stack!=='flex')failures.push(`desktop create menu copy ${menu.stack}`);
      }
      await page.screenshot({path:`${output}/${scenario.width}-${lang}.png`,fullPage:false});
      results.push({scenario,lang,state,failures});await page.close();
    }
  }finally{await browser.close();}
  writeFileSync(`${output}/report.json`,JSON.stringify(results,null,2));
  const failures=results.flatMap(r=>r.failures.map(f=>`${r.scenario.width}/${r.lang}: ${f}`));
  assert.equal(failures.length,0,failures.join('\n'));
  console.log(`Obsidian shell: ${results.length} responsive/language cases passed.`);
})().catch(error=>{console.error(error);process.exitCode=1;});
