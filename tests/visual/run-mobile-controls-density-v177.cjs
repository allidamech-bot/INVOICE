const { chromium } = require('playwright');
const { mkdirSync, writeFileSync } = require('node:fs');

const baseUrl='http://127.0.0.1:4173/tests/visual/mobile-controls-density-v177.html';
const reportDir='visual-qa-output';
const reportPath=`${reportDir}/mobile-controls-density-v177.json`;
const cases=[
  {width:320,height:568,label:'small phone'},
  {width:360,height:640,label:'android phone'},
  {width:390,height:844,label:'iPhone portrait'},
  {width:430,height:932,label:'large phone'},
  {width:720,height:900,label:'phone breakpoint'},
  {width:820,height:1180,label:'tablet touch'}
];

(async()=>{
  const browser=await chromium.launch({headless:true});
  const failures=[];
  const scenarios=[];
  try{
    for(const scenario of cases){
      const page=await browser.newPage({viewport:{width:scenario.width,height:scenario.height},hasTouch:true,isMobile:true});
      await page.goto(baseUrl,{waitUntil:'networkidle'});
      await page.waitForTimeout(50);
      const result=await page.evaluate(()=>{
        const rect=selector=>{
          const el=document.querySelector(selector);
          if(!el)return null;
          const r=el.getBoundingClientRect();
          const s=getComputedStyle(el);
          return {width:r.width,height:r.height,left:r.left,right:r.right,display:s.display,overflowX:s.overflowX};
        };
        const selectors=[
          '.shell-mobile-brand>button','.shell-sync-status','.page-heading .btn',
          '.settings-tabs>button','.documents-sort','.section-heading-actions .btn',
          '.product-library-star','.product-library-row>.icon-btn','.cloud-account-actions .btn',
          '.auth-language-switch','.account-entry-tabs button'
        ];
        return {
          viewport:{width:innerWidth,height:innerHeight},
          scrollWidth:document.documentElement.scrollWidth,
          targets:Object.fromEntries(selectors.map(selector=>[selector,rect(selector)])),
          tabs:rect('[data-scroll-lane]')
        };
      });
      scenarios.push({scenario,result});
      const prefix=`${scenario.label} ${scenario.width}x${scenario.height}`;
      for(const [selector,box] of Object.entries(result.targets)){
        if(!box){failures.push(`${prefix}: missing ${selector}`);continue;}
        if(box.display==='none'){failures.push(`${prefix}: hidden ${selector}`);continue;}
        if(box.height<44-.25)failures.push(`${prefix}: ${selector} height ${box.height}px (<44px)`);
        if((selector.includes('icon-btn')||selector.includes('star')||selector.includes('shell-mobile-brand'))&&box.width<44-.25)failures.push(`${prefix}: ${selector} width ${box.width}px (<44px)`);
      }
      if(result.scrollWidth>result.viewport.width+1)failures.push(`${prefix}: page horizontal overflow ${result.scrollWidth}px > ${result.viewport.width}px`);
      if(scenario.width<=720&&result.tabs&&!['auto','scroll'].includes(result.tabs.overflowX))failures.push(`${prefix}: settings tab lane is not horizontally reachable`);
      await page.close();
    }
  }finally{await browser.close();}
  const report={caseCount:cases.length,failures,scenarios};
  mkdirSync(reportDir,{recursive:true});
  writeFileSync(reportPath,JSON.stringify(report,null,2));
  if(failures.length){console.error(JSON.stringify({caseCount:cases.length,failures},null,2));process.exit(1);}
  console.log(JSON.stringify({caseCount:cases.length,failures:0},null,2));
})().catch(error=>{
  mkdirSync(reportDir,{recursive:true});
  writeFileSync(reportPath,JSON.stringify({caseCount:cases.length,error:String(error&&error.stack||error)},null,2));
  console.error(error);
  process.exit(1);
});
