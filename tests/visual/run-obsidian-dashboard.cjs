const {chromium}=require('playwright');
const {mkdirSync,writeFileSync}=require('node:fs');
const assert=require('node:assert/strict');
const output='visual-qa-output/obsidian-dashboard';
const scenarios=[{width:1440,height:1000,touch:false},{width:1024,height:900,touch:false},{width:820,height:1180,touch:true},{width:768,height:1024,touch:true},{width:390,height:844,touch:true},{width:320,height:568,touch:true}];

(async()=>{
  mkdirSync(output,{recursive:true});
  const browser=await chromium.launch({headless:true});
  const results=[];
  try{
    for(const scenario of scenarios)for(const lang of ['en','ar']){
      const page=await browser.newPage({viewport:{width:scenario.width,height:scenario.height},hasTouch:scenario.touch,isMobile:scenario.touch});
      const errors=[];page.on('pageerror',error=>errors.push(String(error)));
      await page.goto(`http://127.0.0.1:4173/tests/visual/obsidian-dashboard.html?lang=${lang}`,{waitUntil:'load'});
      await page.locator('.dashboard-page').waitFor();
      await page.evaluate(()=>document.fonts.ready);
      const state=await page.evaluate(()=>{
        const style=selector=>getComputedStyle(document.querySelector(selector));
        const rect=selector=>document.querySelector(selector).getBoundingClientRect();
        const columns=style('.dashboard-kpis').gridTemplateColumns.split(' ').filter(Boolean).length;
        const kpis=[...document.querySelectorAll('.dashboard-kpi')].map(el=>({height:el.getBoundingClientRect().height,background:getComputedStyle(el).backgroundColor,radius:getComputedStyle(el).borderRadius}));
        const whiteSurfaces=[...document.querySelectorAll('.dashboard-page *')].filter(el=>getComputedStyle(el).backgroundColor==='rgb(255, 255, 255)').length;
        return{scrollWidth:document.documentElement.scrollWidth,canvas:style('.workspace-shell').backgroundColor,hero:style('.dashboard-hero').backgroundColor,kpiPanel:style('.dashboard-kpis').backgroundColor,columns,kpis,whiteSurfaces,recentHead:style('.dashboard-document-head').display,recentRows:document.querySelectorAll('.dashboard-document-row').length,statuses:document.querySelectorAll('.dashboard-document-status').length,firstRowHeight:rect('.dashboard-document-row').height,dir:document.documentElement.dir};
      });
      const failures=[...errors];
      if(state.scrollWidth>scenario.width+1)failures.push(`horizontal overflow ${state.scrollWidth}`);
      if(state.canvas!=='rgb(9, 18, 24)')failures.push(`canvas ${state.canvas}`);
      if(state.hero!=='rgba(0, 0, 0, 0)')failures.push(`hero surface ${state.hero}`);
      if(state.kpiPanel!=='rgb(16, 29, 36)')failures.push(`KPI panel ${state.kpiPanel}`);
      if(state.kpis.length!==4)failures.push(`KPI count ${state.kpis.length}`);
      if(state.kpis.some(item=>item.background!=='rgba(0, 0, 0, 0)'||item.radius!=='0px'))failures.push('KPI cards are not internally divided');
      if(state.whiteSurfaces)failures.push(`white application surfaces ${state.whiteSurfaces}`);
      if(state.recentRows!==6||state.statuses!==6)failures.push(`recent document structure ${state.recentRows}/${state.statuses}`);
      if(state.firstRowHeight<64||state.firstRowHeight>(scenario.width<=800?112:82))failures.push(`recent row height ${state.firstRowHeight}`);
      if(scenario.width<=800){if(state.columns!==2)failures.push(`mobile KPI columns ${state.columns}`);if(state.recentHead!=='none')failures.push('mobile table head visible');}
      else{if(state.recentHead==='none')failures.push('desktop table head hidden');}
      await page.screenshot({path:`${output}/${scenario.width}-${lang}.png`,fullPage:true});
      results.push({scenario,lang,state,failures});await page.close();
    }
  }finally{await browser.close();}
  writeFileSync(`${output}/report.json`,JSON.stringify(results,null,2));
  const failures=results.flatMap(result=>result.failures.map(failure=>`${result.scenario.width}/${result.lang}: ${failure}`));
  assert.equal(failures.length,0,failures.join('\n'));
  console.log(`Obsidian dashboard: ${results.length} responsive/language cases passed.`);
})().catch(error=>{console.error(error);process.exitCode=1;});
