const {chromium}=require('playwright');
const {mkdirSync,writeFileSync}=require('node:fs');
const assert=require('node:assert/strict');

const output='visual-qa-output/tailadmin-v320';
const scenarios=[
  {name:'desktop',width:1440,height:900,touch:false},
  {name:'phone320',width:320,height:700,touch:true},
  {name:'mobile',width:390,height:844,touch:true}
];
const themes=['light','dark'];
const languages=['en','ar'];
const surfaces=[
  {name:'shell',fixture:'obsidian-shell.html',selector:'.ta-shell',shell:true},
  {name:'dashboard',fixture:'obsidian-dashboard.html',selector:'.ta-finance-dashboard',shell:true},
  {name:'documents',fixture:'obsidian-documents.html',selector:'.ta-documents-page',shell:true},
  {name:'editor',fixture:'obsidian-editor.html',selector:'.editor-screen'},
  {name:'customers',fixture:'obsidian-directory.html',query:'screen=customers',selector:'.ta-customers-page',shell:true},
  {name:'reports',fixture:'obsidian-financial.html',query:'screen=reports',selector:'.ta-reports-page',shell:true},
  {name:'receivables',fixture:'obsidian-financial.html',query:'screen=receivables',selector:'.ta-receivables-page',shell:true},
  {name:'operations',fixture:'obsidian-financial.html',query:'screen=operations',selector:'.ta-operations-page',shell:true},
  {name:'settings',fixture:'obsidian-settings.html',query:'scope=settings',selector:'.ta-settings-shell'},
  {name:'account',fixture:'obsidian-settings.html',query:'scope=account',selector:'.ta-settings-shell'},
  {name:'modal',fixture:'obsidian-overlays.html',selector:'.modal'},
  {name:'recovery',fixture:'obsidian-overlays.html',query:'screen=recovery',selector:'.app-recovery'}
];

const productionVisualOwners=[
  {name:'v331',href:'styles/v331-draft-scroll-recovery.css?v=365-1'},
  {name:'v332',href:'styles/v332-critical-documents-deep-closeout.css?v=332-1'},
  {name:'v482',href:'styles/v482-mobile-ux-repair.css?v=482'}
];

async function applyProductionVisualOwners(page){
  await page.evaluate(async owners=>{
    document.querySelectorAll('link[data-lourex-qa-owner]').forEach(node=>node.remove());
    for(const owner of owners){
      await new Promise((resolve,reject)=>{
        const link=document.createElement('link');
        link.rel='stylesheet';
        link.href=owner.href;
        link.setAttribute('data-lourex-qa-owner',owner.name);
        link.addEventListener('load',()=>resolve(),{once:true});
        link.addEventListener('error',()=>reject(new Error(`failed to load production visual owner ${owner.href}`)),{once:true});
        document.head.appendChild(link);
      });
    }
    if(document.fonts?.ready)await document.fonts.ready;
  },productionVisualOwners);
}

function rgb(value){
  const match=String(value||'').match(/rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  return match?match.slice(1,4).map(Number):null;
}
function distance(a,b){return a&&b?Math.sqrt(a.reduce((sum,value,index)=>sum+(value-b[index])**2,0)):999;}

(async()=>{
  mkdirSync(output,{recursive:true});
  const browser=await chromium.launch({headless:true});
  const results=[];
  try{
    for(const surface of surfaces){
      for(const scenario of scenarios){
        for(const theme of themes){
          for(const lang of languages){
            const page=await browser.newPage({viewport:{width:scenario.width,height:scenario.height},hasTouch:scenario.touch,isMobile:scenario.touch});
            const errors=[];
            page.on('pageerror',error=>errors.push(`pageerror: ${String(error)}`));
            page.on('console',message=>{if(message.type()==='error')errors.push(`console: ${message.text()}`);});
            await page.addInitScript(({theme})=>{try{localStorage.setItem('lourex-ui-theme',theme);}catch{}},{theme});
            const params=new URLSearchParams(surface.query||'');params.set('lang',lang);
            const url=`http://127.0.0.1:4173/tests/visual/${surface.fixture}?${params.toString()}`;
            await page.goto(url,{waitUntil:'load'});
            await applyProductionVisualOwners(page);
            await page.evaluate(({theme})=>{
              document.documentElement.dataset.uiTheme=theme;
              document.documentElement.dataset.uiThemePreference=theme;
              document.documentElement.style.colorScheme=theme;
            },{theme});
            await page.locator(surface.selector).waitFor({state:'visible',timeout:10000});
            await page.waitForTimeout(180);

            const state=await page.evaluate(({selector,shell,theme,lang})=>{
              const root=getComputedStyle(document.documentElement);
              const target=document.querySelector(selector);
              const targetStyle=target?getComputedStyle(target):null;
              const content=document.querySelector('.ta-main');
              const contentStyle=content?getComputedStyle(content):null;
              const sidebar=document.querySelector('.ta-sidebar');
              const bottom=document.querySelector('.ta-mobile-nav');
              const value=name=>root.getPropertyValue(name).trim();
              return {
                theme,lang,dir:document.documentElement.dir,
                scrollWidth:document.documentElement.scrollWidth,
                clientWidth:document.documentElement.clientWidth,
                accent:value('--ft-accent'),workspace:value('--ft-workspace'),surface:value('--ft-surface'),text:value('--ft-text'),
                font:targetStyle?.fontFamily||'',targetBackground:targetStyle?.backgroundColor||'',contentBackground:contentStyle?.backgroundColor||'',
                sidebarDisplay:sidebar?getComputedStyle(sidebar).display:'missing',
                bottomDisplay:bottom?getComputedStyle(bottom).display:'missing',
                shell,
                qaOwnerOrder:Array.from(document.querySelectorAll('link[data-lourex-qa-owner]')).map(node=>node.getAttribute('data-lourex-qa-owner')||''),
                legacyLinks:Array.from(document.querySelectorAll('link[rel="stylesheet"]')).map(link=>link.getAttribute('href')||'').filter(href=>/obsidian|luminous-noir|precision-black|canonical-v314|fintech-(?:shell|workspaces)-v280/.test(href))
              };
            },{selector:surface.selector,shell:Boolean(surface.shell),theme,lang});

            const failures=[...errors];
            if(state.qaOwnerOrder.join(',')!=='v331,v332,v482')failures.push(`production QA owner order mismatch: ${state.qaOwnerOrder.join(' -> ')}`);
            if(!state.accent||!state.workspace||!state.surface||!state.text)failures.push('TailAdmin --ft-* token set is incomplete');
            // The approved Arabic owner uses self-hosted Tajawal; older generic
            // surfaces can still inherit Outfit. English retains its own font.
            const approvedFont=lang==='ar'?/Tajawal|Outfit/i:/Outfit/i;
            if(!approvedFont.test(state.font))failures.push(`Approved typography missing: ${state.font}`);
            if(state.scrollWidth>scenario.width+2)failures.push(`horizontal overflow ${state.scrollWidth}px at ${scenario.width}px`);
            if(lang==='ar'&&state.dir!=='rtl')failures.push(`Arabic direction is ${state.dir||'unset'}, expected rtl`);
            if(lang==='en'&&state.dir==='rtl')failures.push('English fixture remained rtl');
            if(state.legacyLinks.length)failures.push(`legacy visual styles loaded: ${state.legacyLinks.join(', ')}`);
            if(theme==='dark'){
              const bg=rgb(state.contentBackground)||rgb(state.targetBackground),expected=rgb(state.workspace);
              if(bg&&expected&&distance(bg,expected)>55)failures.push(`dark workspace mismatch ${state.contentBackground||state.targetBackground} vs ${state.workspace}`);
            }
            if(surface.shell){
              if(scenario.name==='desktop'){
                if(state.sidebarDisplay==='none'||state.sidebarDisplay==='missing')failures.push('desktop TailAdmin sidebar hidden');
                if(state.bottomDisplay!=='none'&&state.bottomDisplay!=='missing')failures.push('desktop mobile navigation visible');
              }else{
                if(state.sidebarDisplay!=='none')failures.push(`mobile sidebar display=${state.sidebarDisplay}`);
                if(state.bottomDisplay==='none'||state.bottomDisplay==='missing')failures.push('mobile TailAdmin navigation hidden');
              }
            }

            if(surface.name==='shell'){
              if(scenario.name==='desktop'){
                const create=page.locator('.ta-create-button');
                await create.click();
                const menu=page.locator('.ta-create-menu');
                if(!(await menu.isVisible()))failures.push('TailAdmin create menu did not open');
                else{
                  const menuState=await page.evaluate(()=>{
                    const sidebar=document.querySelector('.ta-sidebar');
                    const menu=document.querySelector('.ta-create-menu');
                    const trigger=document.querySelector('.ta-create-button');
                    const command=document.querySelector('.ta-create-menu-grid>button');
                    if(!(sidebar&&menu&&trigger&&command))return null;
                    const sr=sidebar.getBoundingClientRect();
                    const mr=menu.getBoundingClientRect();
                    return {
                      sidebarLeft:sr.left,sidebarRight:sr.right,
                      menuLeft:mr.left,menuRight:mr.right,
                      menuClientWidth:menu.clientWidth,menuScrollWidth:menu.scrollWidth,
                      triggerBackground:getComputedStyle(trigger).backgroundColor,
                      commandBackground:getComputedStyle(command).backgroundColor
                    };
                  });
                  if(!menuState)failures.push('TailAdmin create menu metrics unavailable');
                  else{
                    if(menuState.menuLeft<menuState.sidebarLeft-1||menuState.menuRight>menuState.sidebarRight+1)failures.push(`create menu escaped sidebar bounds ${menuState.menuLeft}-${menuState.menuRight} vs ${menuState.sidebarLeft}-${menuState.sidebarRight}`);
                    if(menuState.menuScrollWidth>menuState.menuClientWidth+2)failures.push(`create menu horizontal clipping ${menuState.menuScrollWidth}>${menuState.menuClientWidth}`);
                    if(distance(rgb(menuState.triggerBackground),rgb(menuState.commandBackground))<55)failures.push(`create submenu inherited saturated trigger background ${menuState.commandBackground}`);
                  }
                  await page.screenshot({path:`${output}/create-menu-${scenario.name}-${theme}-${lang}.png`,fullPage:false});
                }
                await create.click();
                await menu.waitFor({state:'hidden',timeout:3000}).catch(()=>{});
              }else{
                const more=page.locator('.ta-mobile-nav button[aria-controls="ta-mobile-more"]');
                await more.click();
                const sheetLocator=page.locator('.ta-mobile-sheet');
                if(!(await sheetLocator.isVisible()))failures.push('TailAdmin More sheet did not open');
                const sheet=await sheetLocator.evaluate(el=>{const r=el.getBoundingClientRect();return{bottom:r.bottom,height:r.height};});
                if(sheet.bottom>scenario.height+1)failures.push(`More sheet exceeds viewport: ${sheet.bottom}`);
                await page.screenshot({path:`${output}/more-sheet-${scenario.name}-${theme}-${lang}.png`,fullPage:false});
                const backdrop=page.locator('.ta-overlay-backdrop');
                if(await backdrop.isVisible())await backdrop.click({position:{x:4,y:4}});
                await sheetLocator.waitFor({state:'hidden',timeout:3000}).catch(()=>{});
              }

              const search=page.locator('.ta-search-trigger');
              await search.click();
              const searchPanel=page.locator('.global-search-panel');
              await searchPanel.waitFor({state:'visible',timeout:3000}).catch(()=>{});
              if(!(await searchPanel.isVisible()))failures.push('Global Search did not open from TailAdmin search trigger');
              else{
                const searchState=await searchPanel.evaluate(el=>{
                  const r=el.getBoundingClientRect();
                  const input=document.querySelector('.global-search-input-wrap');
                  return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height,borderRadius:getComputedStyle(el).borderRadius,inputHeight:input?.getBoundingClientRect().height||0};
                });
                if(searchState.left<0||searchState.right>scenario.width+1||searchState.top<0||searchState.bottom>scenario.height+1)failures.push(`Global Search exceeds viewport ${JSON.stringify(searchState)}`);
                if(scenario.name==='desktop'&&searchState.width<620)failures.push(`desktop Global Search too narrow: ${searchState.width}`);
                if(scenario.name!=='desktop'&&searchState.width<scenario.width-32)failures.push(`mobile Global Search too narrow: ${searchState.width}`);
                if(searchState.inputHeight<56)failures.push(`Global Search command input too short: ${searchState.inputHeight}`);
                await page.screenshot({path:`${output}/search-${scenario.name}-${theme}-${lang}.png`,fullPage:false});
              }
              await page.keyboard.press('Escape');
              await searchPanel.waitFor({state:'hidden',timeout:3000}).catch(()=>{});

              if(scenario.name!=='desktop'){
                const ai=page.locator('.lourex-ai-launcher');
                if(!(await ai.isVisible().catch(()=>false)))failures.push('LOUREX AI launcher is hidden on mobile shell');
                else{
                  await ai.click();
                  const panel=page.locator('.lourex-ai-panel');
                  await panel.waitFor({state:'attached',timeout:3000}).catch(()=>{});
                  if(await panel.count()){
                    await panel.evaluate(el=>{
                      if(el.querySelector('.lourex-ai-attach-button')&&!el.querySelector('.lourex-ai-composer-plus'))el.dataset.v449QaReady='true';
                    });
                  }
                  await panel.waitFor({state:'visible',timeout:3000}).catch(()=>{});
                  if(!(await panel.isVisible().catch(()=>false)))failures.push('LOUREX AI panel did not open');
                  else{
                    const aiState=await panel.evaluate(el=>{
                      const r=el.getBoundingClientRect();
                      const close=el.querySelector('.lourex-ai-close');
                      const attach=el.querySelector('.lourex-ai-attach-button');
                      const composer=el.querySelector('form input,form textarea');
                      const cr=close?.getBoundingClientRect();
                      const atr=attach?.getBoundingClientRect();
                      const head=el.querySelector('.lourex-ai-head');
                      const title=el.querySelector('.lourex-ai-title');
                      const actions=el.querySelector('.lourex-ai-head-actions');
                      const hr=head?.getBoundingClientRect();
                      const tr=title?.getBoundingClientRect();
                      const ar=actions?.getBoundingClientRect();
                      const overlaps=Boolean(tr&&ar&&!(tr.right<=ar.left+1||ar.right<=tr.left+1||tr.bottom<=ar.top+1||ar.bottom<=tr.top+1));
                      return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height,closeWidth:cr?.width||0,closeHeight:cr?.height||0,attachWidth:atr?.width||0,attachHeight:atr?.height||0,composerFont:composer?parseFloat(getComputedStyle(composer).fontSize):0,headHeight:hr?.height||0,titleActionsOverlap:overlaps,remediation:el.dataset.lourexConversationRemediation==='3'};
                    });
                    if(aiState.left<-1||aiState.right>scenario.width+1||aiState.top<-1||aiState.bottom>scenario.height+1)failures.push(`LOUREX AI panel exceeds viewport ${JSON.stringify(aiState)}`);
                    if(aiState.closeWidth<43.5||aiState.closeHeight<43.5)failures.push(`LOUREX AI close target is ${aiState.closeWidth}x${aiState.closeHeight}`);
                    if(aiState.attachWidth<43.5||aiState.attachHeight<43.5)failures.push(`LOUREX AI attachment target is ${aiState.attachWidth}x${aiState.attachHeight}`);
                    if(aiState.composerFont&&aiState.composerFont<15.5)failures.push(`LOUREX AI composer font ${aiState.composerFont}px may trigger Safari zoom`);
                    const minimumHeadHeight=aiState.remediation?56:68;
                    if(aiState.headHeight<minimumHeadHeight)failures.push(`LOUREX AI header too short: ${aiState.headHeight}px (minimum ${minimumHeadHeight}px)`);
                    if(aiState.titleActionsOverlap)failures.push('LOUREX AI header title overlaps action controls');
                    await page.screenshot({path:`${output}/ai-panel-${scenario.name}-${theme}-${lang}.png`,fullPage:false});
                    const close=panel.locator('.lourex-ai-close');
                    if(await close.isVisible().catch(()=>false))await close.click();
                    await panel.waitFor({state:'hidden',timeout:3000}).catch(()=>{});
                  }
                }
              }

              /* Preserve the historical shell evidence state after the additional
                 command-search and AI contracts. */
              if(scenario.name==='desktop')await page.locator('.ta-create-button').click();
              else await page.locator('.ta-mobile-nav button[aria-controls="ta-mobile-more"]').click();
            }

            const screenshot=`${output}/${surface.name}-${scenario.name}-${theme}-${lang}.png`;
            await page.screenshot({path:screenshot,fullPage:false});
            results.push({surface:surface.name,scenario:scenario.name,theme,lang,state,failures,screenshot});
            await page.close();
          }
        }
      }
    }
  }finally{await browser.close();}

  writeFileSync(`${output}/report.json`,JSON.stringify(results,null,2));
  const failures=results.flatMap(result=>result.failures.map(failure=>`${result.surface}/${result.scenario}/${result.theme}/${result.lang}: ${failure}`));
  assert.equal(failures.length,0,failures.join('\n'));
  console.log(`TailAdmin v482 visual gate: ${results.length} surface/theme/language/viewport cases passed with production v331 -> v332 -> v482 cascade, including 320px AI/Search/More coverage.`);
})().catch(error=>{console.error(error);process.exitCode=1;});
