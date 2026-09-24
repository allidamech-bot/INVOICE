const {chromium}=require('playwright');
const {mkdirSync,writeFileSync}=require('node:fs');
const assert=require('node:assert/strict');

const output='visual-qa-output/tailadmin-v320';
const scenarios=[
  {name:'desktop',width:1440,height:900,touch:false},
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
            await page.evaluate(({theme})=>{
              document.documentElement.dataset.uiTheme=theme;
              document.documentElement.dataset.uiThemePreference=theme;
              document.documentElement.style.colorScheme=theme;
            },{theme});
            await page.locator(surface.selector).waitFor({state:'visible',timeout:10000});
            await page.waitForTimeout(180);

            const state=await page.evaluate(({selector,shell,mobile,theme,lang})=>{
              const root=getComputedStyle(document.documentElement);
              const target=document.querySelector(selector);
              const targetStyle=target?getComputedStyle(target):null;
              const content=document.querySelector('.ta-content');
              const contentStyle=content?getComputedStyle(content):null;
              const sidebar=document.querySelector('.ta-sidebar');
              const bottom=document.querySelector('.ta-mobile-bottom');
              const visibleButtons=Array.from(document.querySelectorAll('button')).filter(node=>{
                const style=getComputedStyle(node),box=node.getBoundingClientRect();
                return style.display!=='none'&&style.visibility!=='hidden'&&box.width>0&&box.height>0;
              });
              const tooSmall=mobile?visibleButtons.filter(node=>{
                const box=node.getBoundingClientRect();
                return box.width<32||box.height<32;
              }).slice(0,8).map(node=>({text:(node.textContent||node.getAttribute('aria-label')||'').trim().slice(0,80),width:node.getBoundingClientRect().width,height:node.getBoundingClientRect().height})):[];
              const value=name=>root.getPropertyValue(name).trim();
              return {
                theme,lang,dir:document.documentElement.dir,
                scrollWidth:document.documentElement.scrollWidth,
                clientWidth:document.documentElement.clientWidth,
                accent:value('--ft-accent'),workspace:value('--ft-workspace'),surface:value('--ft-surface'),text:value('--ft-text'),
                font:targetStyle?.fontFamily||'',targetBackground:targetStyle?.backgroundColor||'',contentBackground:contentStyle?.backgroundColor||'',
                sidebarDisplay:sidebar?getComputedStyle(sidebar).display:'missing',
                bottomDisplay:bottom?getComputedStyle(bottom).display:'missing',
                shell,tooSmall,
                legacyLinks:Array.from(document.querySelectorAll('link[rel="stylesheet"]')).map(link=>link.getAttribute('href')||'').filter(href=>/obsidian|luminous-noir|precision-black|canonical-v314|fintech-(?:shell|workspaces)-v280/.test(href))
              };
            },{selector:surface.selector,shell:Boolean(surface.shell),mobile:scenario.name==='mobile',theme,lang});

            const failures=[...errors];
            if(!state.accent||!state.workspace||!state.surface||!state.text)failures.push('TailAdmin --ft-* token set is incomplete');
            if(!/Outfit/i.test(state.font))failures.push(`TailAdmin typography missing: ${state.font}`);
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
            if(state.tooSmall.length)failures.push(`small mobile controls: ${JSON.stringify(state.tooSmall)}`);

            if(surface.name==='shell'){
              if(scenario.name==='desktop'){
                const create=page.locator('.ta-create-button');await create.click();
                if(!(await page.locator('.ta-create-menu').isVisible()))failures.push('TailAdmin create menu did not open');
              }else{
                const more=page.locator('.ta-mobile-nav-item').filter({hasText:lang==='ar'?'المزيد':'More'}).last();
                await more.click();
                if(!(await page.locator('.ta-mobile-sheet').isVisible()))failures.push('TailAdmin More sheet did not open');
                const sheet=await page.locator('.ta-mobile-sheet').evaluate(el=>{const r=el.getBoundingClientRect();return{bottom:r.bottom,height:r.height};});
                if(sheet.bottom>scenario.height+1)failures.push(`More sheet exceeds viewport: ${sheet.bottom}`);
              }
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
  console.log(`TailAdmin v320 visual gate: ${results.length} surface/theme/language/viewport cases passed.`);
})().catch(error=>{console.error(error);process.exitCode=1;});
