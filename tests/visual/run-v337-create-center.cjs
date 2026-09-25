const {chromium,webkit}=require('playwright');
const assert=require('node:assert/strict');
const {mkdirSync,writeFileSync}=require('node:fs');

const output='visual-qa-output/v337-create-center';
const cases=[
  ['chromium-320',chromium,{width:320,height:700,isMobile:true,hasTouch:true}],
  ['webkit-320',webkit,{width:320,height:700,isMobile:true,hasTouch:true}],
  ['chromium-390',chromium,{width:390,height:844,isMobile:true,hasTouch:true}],
  ['webkit-390',webkit,{width:390,height:844,isMobile:true,hasTouch:true}],
  ['chromium-desktop',chromium,{width:1440,height:900,isMobile:false,hasTouch:false}]
];
const kinds=['draft','rfq','proforma','proforma-invoice','purchase-order','invoice','delivery-note','payment-receipt'];

async function runCase(name,browserType,viewport,lang){
  const browser=await browserType.launch({headless:true});
  try{
    const context=await browser.newContext({viewport:{width:viewport.width,height:viewport.height},isMobile:viewport.isMobile,hasTouch:viewport.hasTouch});
    const page=await context.newPage();
    const failures=[];
    page.on('pageerror',error=>failures.push(`pageerror: ${String(error)}`));
    await page.goto(`http://127.0.0.1:4173/tests/visual/obsidian-shell.html?lang=${lang}`,{waitUntil:'load'});
    await page.locator('.ta-shell').waitFor({state:'visible'});

    const openMenu=async()=>{
      const trigger=viewport.width<=900?page.locator('.ta-mobile-create'):page.locator('.ta-create-button');
      await trigger.click();
      const menu=page.locator(viewport.width<=900?'#ta-mobile-create-menu':'#ta-desktop-create-menu');
      await menu.waitFor({state:'visible'});
      const geometry=await menu.evaluate(el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return{left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height,scrollHeight:el.scrollHeight,clientHeight:el.clientHeight,overflowY:s.overflowY};});
      if(geometry.left<-2||geometry.right>viewport.width+2||geometry.top<-2||geometry.bottom>viewport.height+2)failures.push(`Create menu leaves viewport: ${JSON.stringify(geometry)}`);
      if(geometry.scrollHeight>geometry.clientHeight+2&&!['auto','scroll'].includes(geometry.overflowY))failures.push(`Create menu hides ${geometry.scrollHeight-geometry.clientHeight}px without vertical scrolling`);
      return menu;
    };

    for(let index=0;index<10;index+=1){
      await page.evaluate(()=>{window.shellQa.newKind='';});
      const before=await page.evaluate(()=>({credit:window.shellQa.credit,statement:window.shellQa.statement}));
      const menu=await openMenu();
      const items=menu.locator('button[role="menuitem"]');
      const count=await items.count();
      if(count!==10){failures.push(`expected 10 create items, found ${count}`);break;}
      const target=items.nth(index);
      await target.scrollIntoViewIfNeeded();
      const box=await target.boundingBox();
      if(!box||box.height<43.5)failures.push(`item ${index+1} touch target ${box?box.height.toFixed(1):'missing'}px`);
      if(box){
        const right=box.x+box.width,bottom=box.y+box.height;
        if(box.x<-2||right>viewport.width+2||box.y<-2||bottom>viewport.height+2)failures.push(`item ${index+1} is not reachable inside viewport: ${JSON.stringify({...box,right,bottom})}`);
      }
      await target.click();
      await page.waitForTimeout(30);
      const after=await page.evaluate(()=>({newKind:window.shellQa.newKind,credit:window.shellQa.credit,statement:window.shellQa.statement,open:Boolean(document.querySelector('.ta-create-menu'))}));
      if(index<8){if(after.newKind!==kinds[index])failures.push(`item ${index+1} dispatched ${after.newKind||'nothing'}, expected ${kinds[index]}`);}
      else if(index===8){if(after.credit!==before.credit+1)failures.push('Credit Note did not dispatch onCreditNote');}
      else if(after.statement!==before.statement+1)failures.push('Statement of Account did not dispatch onStatementAccount');
      if(after.open)failures.push(`item ${index+1} left Create menu open after action`);
    }

    const shot=`${output}/${name}-${lang}.png`;
    await page.screenshot({path:shot,fullPage:false});
    await context.close();
    return{name,lang,failures,screenshot:shot};
  }finally{await browser.close();}
}

(async()=>{
  mkdirSync(output,{recursive:true});
  const rows=[];
  for(const [name,browserType,viewport] of cases)for(const lang of ['en','ar'])rows.push(await runCase(name,browserType,viewport,lang));
  writeFileSync(`${output}/report.json`,JSON.stringify(rows,null,2));
  const failures=rows.flatMap(row=>row.failures.map(failure=>`${row.name}/${row.lang}: ${failure}`));
  assert.equal(failures.length,0,failures.join('\n'));
  console.log(`v337 Create Center interaction QA: ${rows.length} Chromium/WebKit cases passed; all 10 actions remain reachable and dispatch correctly down to 320px.`);
})().catch(error=>{console.error(error);process.exitCode=1;});
