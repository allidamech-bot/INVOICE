const {chromium,webkit}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const output='visual-qa-output/v365-mobile-editor-scroll';
fs.mkdirSync(output,{recursive:true});
const base='http://127.0.0.1:4173/tests/visual/v365-mobile-editor-scroll.html';
const scenarios=[
  {kind:'commercial',width:390,height:844,label:'iphone-390'},
  {kind:'commercial',width:430,height:932,label:'iphone-430'},
  {kind:'commercial',width:768,height:1024,label:'ipad-portrait'},
  {kind:'draft',width:390,height:844,label:'draft-iphone-390'},
  {kind:'draft',width:430,height:932,label:'draft-iphone-430'},
  {kind:'draft',width:768,height:1024,label:'draft-ipad-portrait'}
];

async function verify(engineName,browser,scenario){
  const page=await browser.newPage({viewport:{width:scenario.width,height:scenario.height},hasTouch:true,isMobile:scenario.width<700,deviceScaleFactor:1});
  try{
    await page.goto(`${base}?kind=${scenario.kind}`,{waitUntil:'load'});
    await page.waitForTimeout(100);
    const before=await page.evaluate(kind=>{
      const main=document.querySelector('.ta-main');
      const nested=document.querySelector(kind==='draft'?'.draft-studio-scroll':'.editor-scroll');
      const dock=document.querySelector(kind==='draft'?'.draft-mobile-actionbar':'.mobile-editor-actionbar');
      const end=document.querySelector(kind==='draft'?'#draft [data-scroll-end]':'#commercial [data-scroll-end]');
      const ms=getComputedStyle(main),ns=getComputedStyle(nested),ds=getComputedStyle(dock);
      const mr=main.getBoundingClientRect(),dr=dock.getBoundingClientRect(),er=end.getBoundingClientRect();
      return {main:{client:main.clientHeight,scroll:main.scrollHeight,top:mr.top,bottom:mr.bottom,overflowY:ms.overflowY,height:ms.height,maxHeight:ms.maxHeight,scrollTop:main.scrollTop},nested:{overflowY:ns.overflowY,client:nested.clientHeight,scroll:nested.scrollHeight},dock:{top:dr.top,bottom:dr.bottom,position:ds.position,height:dr.height},end:{top:er.top,bottom:er.bottom},viewport:innerHeight};
    },scenario.kind);
    assert.ok(before.main.client>0,`${engineName}/${scenario.label}: scroll owner has no height`);
    assert.ok(before.main.scroll>before.main.client+300,`${engineName}/${scenario.label}: content is not actually scrollable: ${JSON.stringify(before)}`);
    assert.ok(['auto','scroll'].includes(before.main.overflowY),`${engineName}/${scenario.label}: .ta-main overflowY=${before.main.overflowY}`);
    assert.equal(before.dock.position,'fixed',`${engineName}/${scenario.label}: action dock is not fixed`);
    assert.ok(before.dock.height>=44,`${engineName}/${scenario.label}: action dock too short`);
    assert.ok(before.dock.bottom<=before.viewport+1,`${engineName}/${scenario.label}: action dock escapes viewport`);

    await page.evaluate(()=>{const main=document.querySelector('.ta-main');main.scrollTop=main.scrollHeight;});
    await page.waitForTimeout(80);
    const after=await page.evaluate(kind=>{
      const main=document.querySelector('.ta-main');
      const dock=document.querySelector(kind==='draft'?'.draft-mobile-actionbar':'.mobile-editor-actionbar');
      const end=document.querySelector(kind==='draft'?'#draft [data-scroll-end]':'#commercial [data-scroll-end]');
      const dr=dock.getBoundingClientRect(),er=end.getBoundingClientRect();
      return {scrollTop:main.scrollTop,maxScroll:main.scrollHeight-main.clientHeight,endTop:er.top,endBottom:er.bottom,dockTop:dr.top,viewport:innerHeight};
    },scenario.kind);
    assert.ok(after.scrollTop>100,`${engineName}/${scenario.label}: scrollTop never advances`);
    assert.ok(Math.abs(after.maxScroll-after.scrollTop)<=3,`${engineName}/${scenario.label}: cannot reach true scroll end: ${JSON.stringify(after)}`);
    assert.ok(after.endBottom<=after.dockTop-2,`${engineName}/${scenario.label}: final editor content remains hidden behind action dock: ${JSON.stringify(after)}`);
    await page.screenshot({path:`${output}/${engineName}-${scenario.label}.png`,fullPage:false,animations:'disabled'});
    return {engine:engineName,...scenario,before,after};
  }finally{await page.close();}
}

(async()=>{
  const results=[],failures=[];
  for(const [engineName,engine] of [['chromium',chromium],['webkit',webkit]]){
    const browser=await engine.launch({headless:true});
    try{
      for(const scenario of scenarios){
        try{results.push(await verify(engineName,browser,scenario));console.log(`PASS ${engineName} ${scenario.label}`);}
        catch(error){failures.push(`${engineName}/${scenario.label}: ${error.stack||error}`);console.error(`FAIL ${engineName} ${scenario.label}: ${error.message}`);}
      }
    }finally{await browser.close();}
  }
  fs.writeFileSync(`${output}/report.json`,JSON.stringify({caseCount:results.length+failures.length,results,failures},null,2));
  if(failures.length){console.error(JSON.stringify({failures},null,2));process.exit(1);}
  console.log(JSON.stringify({caseCount:results.length,failures:0},null,2));
})().catch(error=>{console.error(error);process.exit(1);});
