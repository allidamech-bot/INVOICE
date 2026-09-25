const {chromium,webkit}=require('playwright');
const assert=require('node:assert/strict');
const {mkdirSync,writeFileSync}=require('node:fs');

const output='visual-qa-output/v326-dashboard-documents';
const base='http://127.0.0.1:4173/tests/visual';
const surfaces=[
  {name:'dashboard',fixture:'obsidian-dashboard.html',selector:'.ta-finance-dashboard'},
  {name:'documents',fixture:'obsidian-documents.html',selector:'.ta-documents-page'},
  {name:'editor',fixture:'obsidian-editor.html',selector:'.editor-screen'},
  {name:'customers',fixture:'obsidian-directory.html',query:'screen=customers',selector:'.ta-customers-page'}
];
const chromiumScenarios=[
  {name:'320',width:320,height:700,touch:true},
  {name:'390',width:390,height:844,touch:true},
  {name:'430',width:430,height:932,touch:true},
  {name:'desktop',width:1440,height:900,touch:false}
];
const webkitScenarios=[
  {name:'320',width:320,height:700,touch:true},
  {name:'390',width:390,height:844,touch:true},
  {name:'430',width:430,height:932,touch:true}
];
const themes=['light','dark'];
const languages=['en','ar'];

async function inspect(page,{surface,width,height,lang}){
  return page.evaluate(({surface,width,height,lang})=>{
    const within=(outer,inner,tolerance=1)=>Boolean(outer&&inner&&inner.left>=outer.left-tolerance&&inner.right<=outer.right+tolerance&&inner.top>=outer.top-tolerance&&inner.bottom<=outer.bottom+tolerance);
    const horizontallyWithin=(outer,inner,tolerance=1)=>Boolean(outer&&inner&&inner.left>=outer.left-tolerance&&inner.right<=outer.right+tolerance&&inner.top>=outer.top-tolerance);
    const rect=el=>{if(!el)return null;const r=el.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};};
    const visible=el=>{if(!(el instanceof Element))return false;const s=getComputedStyle(el),r=el.getBoundingClientRect();return s.display!=='none'&&s.visibility!=='hidden'&&r.width>0&&r.height>0;};
    const lastFlowContent=root=>{
      if(!(root instanceof Element))return null;
      const candidates=[...root.children].filter(el=>{
        if(!visible(el))return false;
        const position=getComputedStyle(el).position;
        return position!=='fixed'&&position!=='absolute';
      });
      return candidates.at(-1)||root;
    };
    const root=document.documentElement;
    const selector=surface==='dashboard'?'.ta-finance-dashboard':surface==='documents'?'.ta-documents-page':surface==='editor'?'.editor-screen':'.ta-customers-page';
    const pageRoot=document.querySelector(selector);
    const shell=document.querySelector('.ta-shell');
    const main=document.querySelector('.ta-main');
    const nav=document.querySelector('.ta-mobile-nav');
    const navStyle=nav?getComputedStyle(nav):null;
    const mainStyle=main?getComputedStyle(main):null;
    const initialMain={scrollTop:main?.scrollTop||0,scrollHeight:main?.scrollHeight||0,clientHeight:main?.clientHeight||0,overflowY:mainStyle?.overflowY||''};
    const result={
      dir:root.dir,
      viewport:{width,height},
      documentScrollWidth:root.scrollWidth,
      bodyScrollWidth:document.body.scrollWidth,
      documentScrollHeight:root.scrollHeight,
      bodyScrollHeight:document.body.scrollHeight,
      page:rect(pageRoot),
      shell:rect(shell),
      main:rect(main),
      mobileNav:rect(nav),
      mobileNavDisplay:navStyle?.display||'missing',
      initialMain,
      checks:[]
    };
    const push=(name,pass,detail={})=>result.checks.push({name,pass:Boolean(pass),detail});
    push('direction',lang==='ar'?root.dir==='rtl':root.dir!=='rtl',{dir:root.dir});
    push('document-no-horizontal-overflow',root.scrollWidth<=width+1&&document.body.scrollWidth<=width+1,{root:root.scrollWidth,body:document.body.scrollWidth,width});
    push('page-horizontally-inside-main',horizontallyWithin(rect(main),rect(pageRoot),2),{main:rect(main),page:rect(pageRoot)});

    if(width<=900&&main){
      const scrollable=main.scrollHeight<=main.clientHeight+1||['auto','scroll'].includes(mainStyle?.overflowY||'');
      push('mobile-main-can-own-vertical-scroll',scrollable,{scrollHeight:main.scrollHeight,clientHeight:main.clientHeight,overflowY:mainStyle?.overflowY||''});
      const before=main.scrollTop;
      main.scrollTop=Math.max(0,main.scrollHeight-main.clientHeight);
      const after=main.scrollTop;
      const endMain=rect(main);
      const endNav=rect(nav);
      const lastContent=lastFlowContent(pageRoot);
      const endContent=rect(lastContent);
      const needsScroll=main.scrollHeight>main.clientHeight+2;
      push('mobile-main-reaches-scroll-end',!needsScroll||after>before+1,{before,after,scrollHeight:main.scrollHeight,clientHeight:main.clientHeight});
      push('mobile-last-content-reachable',!endContent||!endMain||endContent.bottom<=endMain.bottom+3,{content:endContent,main:endMain,tag:lastContent?.className||lastContent?.tagName||''});
      if(nav&&navStyle?.display!=='none'&&endContent&&endNav){
        push('mobile-last-content-clears-bottom-nav',endContent.bottom<=endNav.top-2,{contentBottom:endContent.bottom,navTop:endNav.top,content:lastContent?.className||lastContent?.tagName||'',nav:endNav});
      }
      main.scrollTop=before;
    }

    if(surface==='dashboard'){
      const cards=[...document.querySelectorAll('.ta-kpi-card')];
      push('dashboard-has-four-kpis',cards.length===4,{count:cards.length});
      cards.forEach((card,index)=>{
        const cardRect=rect(card);
        push(`kpi-${index}-inside-page`,within(rect(pageRoot),cardRect,2),{card:cardRect,page:rect(pageRoot)});
        const primary=card.querySelector('.ta-kpi-money-stack b,.ta-kpi-copy>strong');
        if(primary){
          const style=getComputedStyle(primary);
          push(`kpi-${index}-value-fits`,primary.scrollWidth<=primary.clientWidth+1,{text:primary.textContent,scrollWidth:primary.scrollWidth,clientWidth:primary.clientWidth,textOverflow:style.textOverflow,fontSize:style.fontSize});
        }
      });
      if(width<=900){
        const grid=document.querySelector('.ta-kpi-grid');
        const gridStyle=grid?getComputedStyle(grid):null;
        push('mobile-kpi-two-column-grid',Boolean(gridStyle&&gridStyle.gridTemplateColumns.split(' ').length===2),{columns:gridStyle?.gridTemplateColumns||''});
        const actions=[...document.querySelectorAll('.ta-quick-actions>button')];
        actions.forEach((button,index)=>push(`quick-${index}-touch-target`,(rect(button)?.height||0)>=44,{height:rect(button)?.height||0}));
      }
    }else if(surface==='documents'){
      const summary=[...document.querySelectorAll('.ta-doc-summary-grid>button')];
      summary.forEach((card,index)=>push(`doc-summary-${index}-inside-page`,within(rect(pageRoot),rect(card),2),{card:rect(card)}));
      const tabs=[...document.querySelectorAll('.ta-doc-type-tabs>button')];
      if(width<=900)tabs.forEach((tab,index)=>push(`doc-tab-${index}-touch-target`,(rect(tab)?.height||0)>=44,{height:rect(tab)?.height||0}));
      const command=document.querySelector('.ta-doc-commandbar');
      push('doc-commandbar-inside-page',within(rect(pageRoot),rect(command),2),{command:rect(command),page:rect(pageRoot)});
      if(width<=900){
        const search=document.querySelector('.ta-doc-search');
        const filter=document.querySelector('.ta-doc-filter-button');
        const sort=document.querySelector('.ta-doc-sort');
        const kbd=document.querySelector('.ta-doc-search kbd');
        push('doc-search-touch-height',(rect(search)?.height||0)>=44,{height:rect(search)?.height||0});
        push('doc-filter-44-square',(rect(filter)?.height||0)>=44&&(rect(filter)?.width||0)>=44,{rect:rect(filter)});
        push('doc-sort-touch-height',(rect(sort)?.height||0)>=44,{height:rect(sort)?.height||0});
        push('doc-mobile-kbd-hidden',!kbd||getComputedStyle(kbd).display==='none',{display:kbd?getComputedStyle(kbd).display:'missing'});
      }
    }else if(surface==='editor'){
      const sections=[...document.querySelectorAll('.editor-section')];
      push('editor-has-sections',sections.length>=3,{count:sections.length});
      if(width<=900){
        const scroll=document.querySelector('.editor-scroll');
        const scrollStyle=scroll?getComputedStyle(scroll):null;
        const mainRect=rect(main),shellRect=rect(shell);
        push('editor-has-single-outer-scroll-owner',Boolean(main&&scroll&&['visible','clip'].includes(scrollStyle?.overflowY||'visible')),{mainOverflow:mainStyle?.overflowY||'',editorScrollOverflow:scrollStyle?.overflowY||''});
        push('editor-main-owns-full-mobile-viewport-top',Boolean(mainRect&&Math.abs(mainRect.top)<=1),{main:mainRect,viewportHeight:height});
        push('editor-main-stays-inside-viewport',Boolean(mainRect&&mainRect.bottom<=height+1),{main:mainRect,viewportHeight:height});
        push('editor-main-stays-inside-shell',Boolean(mainRect&&shellRect&&mainRect.top>=shellRect.top-1&&mainRect.bottom<=shellRect.bottom+1),{main:mainRect,shell:shellRect});
        const actionbar=document.querySelector('.mobile-editor-actionbar');
        const actionRect=rect(actionbar);
        push('editor-mobile-actions-visible',Boolean(actionbar&&getComputedStyle(actionbar).display!=='none'&&actionRect&&actionRect.height>=44),{rect:actionRect});
      }
    }else if(surface==='customers'){
      const cards=[...document.querySelectorAll('.ta-customer-card,.ta-customer-row')];
      push('customers-render-content',cards.length>0||Boolean(document.querySelector('.ta-customers-empty')),{cards:cards.length});
      if(width<=900){
        const controls=[...document.querySelectorAll('.ta-customers-page button,.ta-customers-page input')].filter(el=>getComputedStyle(el).display!=='none');
        controls.slice(0,12).forEach((control,index)=>push(`customer-control-${index}-touch-target`,(rect(control)?.height||0)>=40,{height:rect(control)?.height||0}));
      }
    }
    return result;
  },{surface,width,height,lang});
}

async function runBrowser(browserType,browserName,scenarios){
  const browser=await browserType.launch({headless:true});
  const results=[];
  try{
    for(const surface of surfaces){
      for(const scenario of scenarios){
        for(const theme of themes){
          for(const lang of languages){
            const page=await browser.newPage({viewport:{width:scenario.width,height:scenario.height},hasTouch:scenario.touch,isMobile:scenario.touch});
            const failures=[];
            page.on('pageerror',error=>failures.push(`pageerror: ${String(error)}`));
            try{
              await page.addInitScript(({theme})=>{try{localStorage.setItem('lourex-ui-theme',theme);}catch{}},{theme});
              const params=new URLSearchParams(surface.query||'');params.set('lang',lang);
              await page.goto(`${base}/${surface.fixture}?${params.toString()}`,{waitUntil:'load'});
              await page.evaluate(({theme})=>{document.documentElement.dataset.uiTheme=theme;document.documentElement.dataset.uiThemePreference=theme;document.documentElement.style.colorScheme=theme;},{theme});
              await page.locator(surface.selector).waitFor({state:'visible',timeout:10000});
              await page.waitForTimeout(120);
              const state=await inspect(page,{surface:surface.name,width:scenario.width,height:scenario.height,lang});
              for(const check of state.checks)if(!check.pass)failures.push(`${check.name}: ${JSON.stringify(check.detail)}`);
              const shot=`${output}/${browserName}-${surface.name}-${scenario.name}-${theme}-${lang}.png`;
              await page.screenshot({path:shot,fullPage:false,animations:'disabled'});
              results.push({browser:browserName,surface:surface.name,scenario:scenario.name,theme,lang,state,failures,screenshot:shot});
            }catch(error){
              failures.push(error?.stack||String(error));
              results.push({browser:browserName,surface:surface.name,scenario:scenario.name,theme,lang,failures});
            }
            await page.close();
          }
        }
      }
    }
  }finally{await browser.close();}
  return results;
}

(async()=>{
  mkdirSync(output,{recursive:true});
  const results=[
    ...await runBrowser(chromium,'chromium',chromiumScenarios),
    ...await runBrowser(webkit,'webkit',webkitScenarios)
  ];
  writeFileSync(`${output}/report.json`,JSON.stringify(results,null,2));
  const failures=results.flatMap(result=>result.failures.map(failure=>`${result.browser}/${result.surface}/${result.scenario}/${result.theme}/${result.lang}: ${failure}`));
  assert.equal(failures.length,0,failures.join('\n'));
  console.log(`v337 WebKit/mobile reachability QA: ${results.length} dashboard/documents/editor/customers scenarios passed.`);
})().catch(error=>{console.error(error);process.exitCode=1;});