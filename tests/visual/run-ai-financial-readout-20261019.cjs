/* Production-built financial readout browser acceptance; local fixture only. */
const {webkit,chromium}=require('playwright');
const assert=require('node:assert/strict');
const {mkdirSync,writeFileSync}=require('node:fs');
const channels=color=>(color.match(/[\d.]+/g)||[]).slice(0,3).map(Number);
const luminance=color=>{
 const [r=0,g=0,b=0]=channels(color).map(x=>{const n=x/255;return n<=0.04045?n/12.92:((n+0.055)/1.055)**2.4;});
 return 0.2126*r+0.7152*g+0.0722*b;
};
const contrast=(fg,bg)=>{
 const x=luminance(fg),y=luminance(bg);
 return (Math.max(x,y)+0.05)/(Math.min(x,y)+0.05);
};

const output='visual-qa-output/ai-financial-readout';
mkdirSync(output,{recursive:true});
const cases=[
 {engine:webkit,browser:'webkit',width:390,height:844,lang:'ar'},
 {engine:webkit,browser:'webkit',width:820,height:1180,lang:'ar'},
 {engine:chromium,browser:'chromium',width:390,height:844,lang:'en'}
];
(async()=>{
 const report=[];
 for(const spec of cases){
  const browser=await spec.engine.launch({headless:true});
  try{
   const page=await browser.newPage({viewport:{width:spec.width,height:spec.height},isMobile:spec.width<=430,hasTouch:spec.width<=430});
   const errors=[];
   page.on('pageerror',error=>errors.push(String(error)));
   await page.route('**/api/**',route=>route.abort());
   await page.goto('http://127.0.0.1:4173/tests/visual/ai-financial-readout-20261019.html?lang='+spec.lang,{waitUntil:'networkidle'});
   await page.waitForFunction(()=>Boolean(window.lourexReportFixture),null,{timeout:30000});
   const panel=page.locator('#lourex-ai-panel');
   const reportCard=panel.locator('article.lxbr');
   assert.equal(await reportCard.count(),1,'financial readout has exactly one single DOM owner');
   const title=reportCard.locator('h3');
   assert.equal(await title.count(),1);
   assert.match(await title.innerText(),/INV-2026-0003/);
   assert.match(await reportCard.innerText(),/QA752-PAY-01 TEST ONLY/);
   assert.match(await reportCard.innerText(),/3000\.00/);
   assert.match(await reportCard.innerText(),/3399\.00/);
   const disclosure=reportCard.locator('details.lxbr-items');
   assert.equal(await disclosure.count(),1);
   assert.equal(await disclosure.getAttribute('open'),null,'items are collapsed before interaction');
   assert.equal(await reportCard.locator('.lxbr-item-content:visible').count(),0,'collapsed item list does not flood the chat');
   assert.equal(await panel.locator('.lourex-ai-structured-answer').count(),0,'old JSX must be replaced, not layered');
   const visibleText=await reportCard.innerText();
   assert.doesNotMatch(visibleText,/:::lourex-|###/,'no internal rendering markers exposed');
   const measurements=await reportCard.evaluate(node=>{
    const bounds=node.getBoundingClientRect(),panel=document.getElementById('lourex-ai-panel').getBoundingClientRect();
    const styles=getComputedStyle(node);
    const all=[...node.querySelectorAll('h3,h4,dd,.lxbr-reference,summary')];
    return {x:bounds.x,width:bounds.width,panelX:panel.x,panelWidth:panel.width,
      documentWidth:document.documentElement.scrollWidth,viewport:innerWidth,
      textColor:styles.color,background:styles.backgroundColor,
      overflowing:all.filter(child=>{const b=child.getBoundingClientRect();return b.width>0&&(b.left<panel.left-3||b.right>panel.right+3);}).map(el=>el.tagName)};
   });
   assert.ok(measurements.x>=measurements.panelX-2&&measurements.x+measurements.width<=measurements.panelX+measurements.panelWidth+2,'report remains inside chat panel');
   assert.ok(measurements.documentWidth<=spec.width+2,'page has no horizontal overflow');
   assert.deepEqual(measurements.overflowing,[],'financial content fits the viewport');
   const textSamples=await reportCard.evaluate(node=>{
    const styles=el=>getComputedStyle(el);
    const selections=[
     ['heading','h3','.lxbr-heading'],
     ['customer','.lxbr-party','.lxbr-heading'],
     ['fact label','.lxbr-fact dt','.lxbr-fact'],
     ['fact value','.lxbr-fact dd','.lxbr-fact'],
     ['section heading','.lxbr-section h4','#lourex-ai-panel'],
     ['receipt','.lxbr-reference','.lxbr-ledger li'],
     ['balance','.lxbr-balance','.lxbr-ledger li'],
     ['disclosure','.lxbr-items summary','.lxbr-items']
    ];
    return selections.map(([name,selector,surface])=>{
     const text=node.querySelector(selector),bg=node.querySelector(surface)||document.querySelector(surface);
     if(!text||!bg)throw Error('Missing visual sample '+name);
     const ink=styles(text),fill=styles(bg);
     return {name,ink:ink.webkitTextFillColor==='rgba(0, 0, 0, 0)'?ink.color:ink.webkitTextFillColor||ink.color,bg:fill.backgroundColor};
    });
   });
   for(const sample of textSamples){
    assert.ok(sample.bg.startsWith('rgb('),'text sample has an opaque background '+JSON.stringify(sample));
    assert.ok(contrast(sample.ink,sample.bg)>=4.5,'financial text contrast must be readable: '+JSON.stringify(sample));
   }

   await page.screenshot({path:output+'/'+spec.browser+'-'+spec.width+'-'+spec.lang+'-collapsed.png',fullPage:true,animations:'disabled'});
   await disclosure.locator('summary').click();
   assert.notEqual(await disclosure.getAttribute('open'),null,'the actual disclosure can be expanded');
   assert.equal(await reportCard.locator('.lxbr-item-content li').count(),20);
   await disclosure.locator('summary').click();
   assert.equal(await disclosure.getAttribute('open'),null,'disclosure can be closed again');
   await panel.locator('.lourex-ai-message-actions button').click();
   assert.equal(await page.evaluate(()=>window.lourexReportFixture.copyCount()),1,'original Copy action remains operational');
   assert.deepEqual(errors,[],'no client runtime exceptions');
   report.push({browser:spec.browser,width:spec.width,lang:spec.lang,measurements,passed:true});
  }finally{await browser.close();}
 }
 writeFileSync(output+'/results.json',JSON.stringify(report,null,2));
 console.log(JSON.stringify(report));
})().catch(e=>{console.error(e);process.exit(1);});
