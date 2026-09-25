const {chromium,webkit}=require('playwright');
const assert=require('node:assert/strict');
const {mkdirSync,writeFileSync}=require('node:fs');

const output='visual-qa-output/v326-dashboard-documents';
const base='http://127.0.0.1:4173/tests/visual';
const surfaces=[
  {name:'dashboard',fixture:'obsidian-dashboard.html',selector:'.ta-finance-dashboard'},
  {name:'documents',fixture:'obsidian-documents.html',selector:'.ta-documents-page'}
];
const chromiumScenarios=[
  {name:'320',width:320,height:700,touch:true},
  {name:'390',width:390,height:844,touch:true},
  {name:'430',width:430,height:932,touch:true},
  {name:'desktop',width:1440,height:900,touch:false}
];
const webkitScenarios=[
  {name:'390',width:390,height:844,touch:true},
  {name:'430',width:430,height:932,touch:true}
];
const themes=['light','dark'];
const languages=['en','ar'];

async function inspect(page,{surface,width,height,lang}){
  return page.evaluate(({surface,width,height,lang})=>{
    const within=(outer,inner,tolerance=1)=>Boolean(outer&&inner&&inner.left>=outer.left-tolerance&&inner.right<=outer.right+tolerance&&inner.top>=outer.top-tolerance&&inner.bottom<=outer.bottom+tolerance);
    const horizontallyWithin=(outer,inner,tolerance=1)=>Boolean(outer&&inner&&inner.left>=outer.left-tolerance&&inner.right<=outer.right+tolerance&&inner.top>=outer.top-tolerance);
    const rect=el=>el?.getBoundingClientRect()||null;
    const root=document.documentElement;
    const pageRoot=document.querySelector(surface==='dashboard'?'.ta-finance-dashboard':'.ta-documents-page');
    const shell=document.querySelector('.ta-shell');
    const main=document.querySelector('.ta-main');
    const result={
      dir:root.dir,
      viewport:{width,height},
      documentScrollWidth:root.scrollWidth,
      bodyScrollWidth:document.body.scrollWidth,
      page:rect(pageRoot),
      shell:rect(shell),
      main:rect(main),
      checks:[]
    };
    const push=(name,pass,detail={})=>result.checks.push({name,pass:Boolean(pass),detail});
    push('direction',lang==='ar'?root.dir==='rtl':root.dir!=='rtl',{dir:root.dir});
    push('document-no-horizontal-overflow',root.scrollWidth<=width+1&&document.body.scrollWidth<=width+1,{root:root.scrollWidth,body:document.body.scrollWidth,width});
    push('page-horizontally-inside-main',horizontallyWithin(rect(main),rect(pageRoot),2),{main:rect(main),page:rect(pageRoot)});

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
        actions.forEach((button,index)=>push(`quick-${index}-touch-target`,rect(button).height>=44,{height:rect(button).height}));
      }
    }else{
      const summary=[...document.querySelectorAll('.ta-doc-summary-grid>button')];
      summary.forEach((card,index)=>push(`doc-summary-${index}-inside-page`,within(rect(pageRoot),rect(card),2),{card:rect(card)}));
      const tabs=[...document.querySelectorAll('.ta-doc-type-tabs>button')];
      if(width<=900)tabs.forEach((tab,index)=>push(`doc-tab-${index}-touch-target`,rect(tab).height>=44,{height:rect(tab).height}));
      const command=document.querySelector('.ta-doc-commandbar');
      push('doc-commandbar-inside-page',within(rect(pageRoot),rect(command),2),{command:rect(command),page:rect(pageRoot)});
      if(width<=900){
        const search=document.querySelector('.ta-doc-search');
        const filter=document.querySelector('.ta-doc-filter-button');
        const sort=document.querySelector('.ta-doc-sort');
        const kbd=document.querySelector('.ta-doc-search kbd');
        push('doc-search-touch-height',rect(search)?.height>=44,{height:rect(search)?.height||0});
        push('doc-filter-44-square',rect(filter)?.height>=44&&rect(filter)?.width>=44,{rect:rect(filter)});
        push('doc-sort-touch-height',rect(sort)?.height>=44,{height:rect(sort)?.height||0});
        push('doc-mobile-kbd-hidden',!kbd||getComputedStyle(kbd).display==='none',{display:kbd?getComputedStyle(kbd).display:'missing'});
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
              await page.goto(`${base}/${surface.fixture}?lang=${lang}`,{waitUntil:'load'});
              await page.evaluate(({theme})=>{document.documentElement.dataset.uiTheme=theme;document.documentElement.dataset.uiThemePreference=theme;document.documentElement.style.colorScheme=theme;},{theme});
              await page.locator(surface.selector).waitFor({state:'visible',timeout:10000});
              await page.waitForTimeout(100);
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
  console.log(`v326 dashboard/documents visual QA: ${results.length} scenarios passed.`);
})().catch(error=>{console.error(error);process.exitCode=1;});
