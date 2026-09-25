const {chromium,webkit}=require('playwright');
const {mkdirSync,writeFileSync}=require('node:fs');
const assert=require('node:assert/strict');

const output='visual-qa-output/v326-access-surfaces';
const surfaces=[
  {name:'editor',fixture:'obsidian-editor.html',query:'',selector:'.editor-screen'},
  {name:'settings',fixture:'obsidian-settings.html',query:'scope=settings',selector:'.ta-settings-shell'},
  {name:'account',fixture:'obsidian-settings.html',query:'scope=account',selector:'.ta-settings-shell'},
  {name:'auth-signin',fixture:'premium-auth-gateway-v187.html',query:'mode=signin',selector:'.ta-auth-frame'},
  {name:'auth-create',fixture:'premium-auth-gateway-v187.html',query:'mode=create',selector:'.ta-auth-frame'},
  {name:'modal',fixture:'obsidian-overlays.html',query:'',selector:'.modal'},
  {name:'global-search',fixture:'v326-global-search.html',query:'',selector:'.global-search-panel'}
];
const chromiumScenarios=[
  {name:'320-light',width:320,height:720,theme:'light'},
  {name:'390-dark',width:390,height:844,theme:'dark'},
  {name:'430-light',width:430,height:932,theme:'light'},
  {name:'desktop-light',width:1440,height:900,theme:'light'},
  {name:'desktop-dark',width:1440,height:900,theme:'dark'}
];
const webkitScenarios=[
  {name:'iphone320-light',width:320,height:700,theme:'light'},
  {name:'iphone320-dark',width:320,height:700,theme:'dark'},
  {name:'iphone390-light',width:390,height:844,theme:'light'},
  {name:'iphone390-dark',width:390,height:844,theme:'dark'},
  {name:'iphone430-light',width:430,height:932,theme:'light'}
];
const languages=['en','ar'];

async function inspect(page,surface,scenario,lang){
  return page.evaluate(({surface,scenario,lang})=>{
    const failures=[];
    const target=document.querySelector(surface.selector);
    const toPx=value=>{const n=parseFloat(String(value||'0'));return Number.isFinite(n)?n:0;};
    const isVisible=el=>{if(!el)return false;const s=getComputedStyle(el),r=el.getBoundingClientRect();return s.display!=='none'&&s.visibility!=='hidden'&&r.width>0&&r.height>0;};
    const box=el=>{if(!el)return null;const r=el.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};
    const checkTargets=(selectors,label)=>{
      for(const selector of selectors){for(const el of document.querySelectorAll(selector)){if(!isVisible(el))continue;const r=el.getBoundingClientRect();if(r.width<43.5||r.height<43.5)failures.push(`${label} touch target ${selector} is ${r.width.toFixed(1)}x${r.height.toFixed(1)}`);}}
    };
    const checkFonts=(selectors,min,label)=>{
      for(const selector of selectors){for(const el of document.querySelectorAll(selector)){if(!isVisible(el))continue;const size=toPx(getComputedStyle(el).fontSize);if(size<min)failures.push(`${label} font ${selector} is ${size}px`);}}
    };
    if(!target){failures.push(`missing ${surface.selector}`);return{failures};}
    const targetBox=box(target);
    if(document.documentElement.scrollWidth>scenario.width+2)failures.push(`horizontal overflow ${document.documentElement.scrollWidth}px > ${scenario.width}px`);
    if(lang==='ar'&&document.documentElement.dir!=='rtl')failures.push(`Arabic dir=${document.documentElement.dir}`);
    if(lang==='en'&&document.documentElement.dir==='rtl')failures.push('English remained rtl');
    if(scenario.width<=900&&targetBox.width>scenario.width+3)failures.push(`surface width ${targetBox.width.toFixed(1)} exceeds viewport ${scenario.width}`);

    if(surface.name==='editor'){
      checkFonts(['.ta-editor-step-label'],10.5,'editor');
      checkFonts(['.ta-editor-step-number'],9.5,'editor');
      if(scenario.width<=1180)checkTargets(['.ta-editor-step-list>button'],'editor');
      if(scenario.width<=700)checkTargets(['.ta-editor-convert-card>.btn'],'editor');
    }
    if(surface.name==='settings'||surface.name==='account'){
      if(scenario.width<=720){
        checkTargets(['.ta-settings-nav button','.ta-settings-segmented button','.ta-settings-link-action','.ta-settings-asset-trigger','.ta-recovery-status .btn'],'settings');
        const modal=document.querySelector('.modal');if(modal&&isVisible(modal)){const r=modal.getBoundingClientRect();if(r.bottom>scenario.height+2||r.top<-2)failures.push(`settings modal leaves viewport ${JSON.stringify(box(modal))}`);}
      }
    }
    if(surface.name.startsWith('auth-')){
      checkTargets(['.ta-auth-language','.ta-auth-tabs button','.ta-google-button','.ta-auth-primary','.ta-auth-link'],'auth');
      checkFonts(['.ta-auth-security small'],10,'auth');
      if(scenario.width<=900){const r=target.getBoundingClientRect();if(r.left<-2||r.right>scenario.width+2)failures.push(`auth frame leaves viewport ${JSON.stringify(box(target))}`);}
    }
    if(surface.name==='modal'){
      const r=target.getBoundingClientRect();if(r.top<-2||r.bottom>scenario.height+2)failures.push(`modal leaves viewport ${JSON.stringify(box(target))}`);
      if(scenario.width<=720)checkTargets(['.modal-footer-actions .btn'],'modal');
      checkFonts(['.modal-message'],11,'modal');
    }
    if(surface.name==='global-search'){
      const r=target.getBoundingClientRect();if(r.left<-2||r.right>scenario.width+2||r.top<-2||r.bottom>scenario.height+2)failures.push(`search panel leaves viewport ${JSON.stringify(box(target))}`);
      if(scenario.width<=720)checkTargets(['.global-search-actions>button','.global-search-destinations button'],'search');
      checkFonts(['.global-search-actions small','.global-search-result-copy small'],9.5,'search');
      const input=document.querySelector('.global-search-input-wrap input');if(input&&isVisible(input)&&input.getBoundingClientRect().height<43.5)failures.push(`search input height=${input.getBoundingClientRect().height.toFixed(1)}`);
    }
    return{failures,box:targetBox,scrollWidth:document.documentElement.scrollWidth,dir:document.documentElement.dir};
  },{surface,scenario,lang});
}

async function probeGlobalSearchResults(page,state,scenario){
  const input=page.locator('.global-search-input-wrap input');
  await input.fill('QA');
  await page.waitForTimeout(80);
  const resultCount=await page.locator('.global-search-results .global-search-result').count();
  if(resultCount<8)state.failures.push(`global-search expected many QA results, found ${resultCount}`);
  const probe=await page.evaluate(()=>{
    const scroller=document.querySelector('.global-search-results');
    if(!(scroller instanceof HTMLElement))return null;
    const results=[...scroller.querySelectorAll('.global-search-result')].filter(el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return s.display!=='none'&&r.width>0&&r.height>0;});
    const last=results.at(-1)||null;
    const style=getComputedStyle(scroller);
    const before=scroller.scrollTop;
    const max=Math.max(0,scroller.scrollHeight-scroller.clientHeight);
    scroller.scrollTop=max;
    const after=scroller.scrollTop;
    const sr=scroller.getBoundingClientRect();
    const lr=last?.getBoundingClientRect()||null;
    const data={overflowY:style.overflowY,touchAction:style.touchAction,max,after,resultCount:results.length,lastReachable:!lr||lr.bottom<=sr.bottom+2,lastBottom:lr?.bottom??null,scrollerBottom:sr.bottom};
    scroller.scrollTop=before;
    return data;
  });
  if(!probe){state.failures.push('global-search results scroller missing');return;}
  if(scenario.width<=900&&probe.touchAction!=='pan-y')state.failures.push(`global-search touch-action=${probe.touchAction||'missing'}, expected pan-y`);
  if(scenario.width<=900&&probe.max<=2)state.failures.push(`global-search fixture did not force scrolling (max=${probe.max})`);
  if(probe.max>2&&!['auto','scroll'].includes(probe.overflowY))state.failures.push(`global-search overflow-y=${probe.overflowY} with ${probe.max}px hidden range`);
  if(probe.max>2&&probe.after<probe.max-2)state.failures.push(`global-search cannot reach scroll end ${probe.after}/${probe.max}`);
  if(!probe.lastReachable)state.failures.push(`global-search last result clipped ${probe.lastBottom} > ${probe.scrollerBottom}`);
  await input.fill('');
}

async function runEngine(engine,browserType,scenarios){
  const browser=await browserType.launch({headless:true});
  const rows=[];
  try{
    for(const surface of surfaces){for(const scenario of scenarios){for(const lang of languages){
      const context=await browser.newContext({viewport:{width:scenario.width,height:scenario.height},hasTouch:scenario.width<=900,isMobile:scenario.width<=900});
      const page=await context.newPage();const errors=[];
      page.on('pageerror',error=>errors.push(`pageerror: ${String(error)}`));
      page.on('console',message=>{if(message.type()==='error')errors.push(`console: ${message.text()}`);});
      await page.addInitScript(theme=>{try{localStorage.setItem('lourex-ui-theme',theme);}catch{}},scenario.theme);
      const params=new URLSearchParams(surface.query||'');params.set('lang',lang);
      await page.goto(`http://127.0.0.1:4173/tests/visual/${surface.fixture}?${params.toString()}`,{waitUntil:'load'});
      await page.evaluate(theme=>{document.documentElement.dataset.uiTheme=theme;document.documentElement.dataset.uiThemePreference=theme;document.documentElement.style.colorScheme=theme;},scenario.theme);
      await page.locator(surface.selector).first().waitFor({state:'visible',timeout:10000});
      await page.waitForTimeout(180);
      const state=await inspect(page,surface,scenario,lang);state.failures.push(...errors);
      if(surface.name==='global-search'){
        await probeGlobalSearchResults(page,state,scenario);
        if(scenario.width<=720){
          const payment=page.locator('.global-search-actions>button').filter({hasText:lang==='ar'?'تسجيل دفعة':'Record payment'}).first();
          if(await payment.count()){
            await payment.click();await page.waitForTimeout(50);
            const back=page.locator('.global-search-back-button');
            if(await back.isVisible()){const bb=await back.boundingBox();if(!bb||bb.height<43.5||bb.width<43.5)state.failures.push(`search back target ${bb?`${bb.width.toFixed(1)}x${bb.height.toFixed(1)}`:'missing'}`);await back.click();}
          }
        }
      }
      const screenshot=`${output}/${engine}-${surface.name}-${scenario.name}-${lang}.png`;
      await page.screenshot({path:screenshot,fullPage:false});
      rows.push({engine,surface:surface.name,scenario:scenario.name,lang,state,screenshot});
      await context.close();
    }}}
  }finally{await browser.close();}
  return rows;
}

(async()=>{
  mkdirSync(output,{recursive:true});
  const rows=[...(await runEngine('chromium',chromium,chromiumScenarios)),...(await runEngine('webkit',webkit,webkitScenarios))];
  writeFileSync(`${output}/report.json`,JSON.stringify(rows,null,2));
  const failures=rows.flatMap(row=>row.state.failures.map(f=>`${row.engine}/${row.surface}/${row.scenario}/${row.lang}: ${f}`));
  assert.equal(failures.length,0,failures.join('\n'));
  console.log(`v337 access surfaces: ${rows.length} Chromium/WebKit scenarios passed, including 320px Safari Global Search pan-y scrolling.`);
})().catch(error=>{console.error(error);process.exitCode=1;});