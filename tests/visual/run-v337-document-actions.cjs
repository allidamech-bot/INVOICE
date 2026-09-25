const {chromium,webkit}=require('playwright');
const assert=require('node:assert/strict');
const {mkdirSync,writeFileSync}=require('node:fs');

const output='visual-qa-output/v337-document-actions';
const cases=[
  ['chromium-320',chromium,{width:320,height:700,isMobile:true,hasTouch:true}],
  ['webkit-320',webkit,{width:320,height:700,isMobile:true,hasTouch:true}],
  ['chromium-390',chromium,{width:390,height:844,isMobile:true,hasTouch:true}],
  ['webkit-390',webkit,{width:390,height:844,isMobile:true,hasTouch:true}],
  ['webkit-ipad820',webkit,{width:820,height:1180,isMobile:true,hasTouch:true}],
  ['webkit-ipad1024-landscape',webkit,{width:1024,height:768,isMobile:false,hasTouch:true}],
  ['chromium-desktop',chromium,{width:1440,height:900,isMobile:false,hasTouch:false}],
  ['webkit-desktop',webkit,{width:1280,height:900,isMobile:false,hasTouch:false}]
];

function outsideViewport(box,viewport){
  if(!box)return true;
  const right=box.x+box.width,bottom=box.y+box.height;
  return box.x<-2||right>viewport.width+2||box.y<-2||bottom>viewport.height+2;
}

async function runCase(name,browserType,viewport,lang){
  const browser=await browserType.launch({headless:true});
  try{
    const context=await browser.newContext({viewport:{width:viewport.width,height:viewport.height},isMobile:viewport.isMobile,hasTouch:viewport.hasTouch});
    const page=await context.newPage();
    const failures=[];
    page.on('pageerror',error=>failures.push(`pageerror: ${String(error)}`));
    await page.goto(`http://127.0.0.1:4173/tests/visual/obsidian-documents.html?lang=${lang}`,{waitUntil:'load'});
    await page.locator('.ta-documents-page').waitFor({state:'visible'});

    const menuSelector=viewport.width<=900?'.ta-doc-mobile-action-sheet':'.ta-doc-action-popover';
    const triggers=page.locator('.ta-doc-actions .icon-btn');
    const triggerCount=await triggers.count();
    if(triggerCount<1)failures.push('document action trigger missing');
    const trigger=triggers.first();
    const triggerBox=await trigger.boundingBox();
    if(!triggerBox)failures.push('document action trigger missing visible box');
    else if(viewport.hasTouch&&(triggerBox.width<43.5||triggerBox.height<43.5))failures.push(`touch document action trigger below 44px: ${triggerBox.width}x${triggerBox.height}`);

    await trigger.click();
    const menu=page.locator(menuSelector).first();
    await menu.waitFor({state:'visible'});
    const menuBox=await menu.boundingBox();
    if(!menuBox)failures.push('document action menu has no visible box');
    else if(outsideViewport(menuBox,viewport))failures.push(`document action menu leaves viewport: ${JSON.stringify({...menuBox,right:menuBox.x+menuBox.width,bottom:menuBox.y+menuBox.height})}`);
    const menuMetrics=await menu.evaluate(el=>{
      const s=getComputedStyle(el),before=el.scrollTop,max=Math.max(0,el.scrollHeight-el.clientHeight);
      el.scrollTop=max;const after=el.scrollTop;
      const last=el.querySelector('button[role="menuitem"]:last-of-type');
      const mr=el.getBoundingClientRect(),lr=last?.getBoundingClientRect()||null;
      el.scrollTop=before;
      return{scrollHeight:el.scrollHeight,clientHeight:el.clientHeight,overflowY:s.overflowY,touchAction:s.touchAction,max,after,lastReachable:!lr||lr.bottom<=mr.bottom+2,lastBottom:lr?.bottom??null,menuBottom:mr.bottom};
    });
    if(menuMetrics.scrollHeight>menuMetrics.clientHeight+2&&!['auto','scroll'].includes(menuMetrics.overflowY))failures.push(`document action menu hides ${menuMetrics.scrollHeight-menuMetrics.clientHeight}px without scrolling`);
    if(viewport.width<=900&&menuMetrics.touchAction!=='pan-y')failures.push(`document action sheet touch-action=${menuMetrics.touchAction||'missing'}, expected pan-y`);
    if(menuMetrics.max>2&&menuMetrics.after<menuMetrics.max-2)failures.push(`document action sheet cannot reach scroll end ${menuMetrics.after}/${menuMetrics.max}`);
    if(!menuMetrics.lastReachable)failures.push(`document action last item clipped ${menuMetrics.lastBottom} > ${menuMetrics.menuBottom}`);

    const buttons=page.locator(`${menuSelector} button[role="menuitem"]`);
    const count=await buttons.count();
    if(count<3)failures.push(`document action menu only has ${count} items`);
    for(let index=0;index<count;index+=1){
      const button=buttons.nth(index);
      await button.scrollIntoViewIfNeeded();
      const b=await button.boundingBox();
      if(!b)failures.push(`menu item ${index+1} missing visible box`);
      else if(viewport.hasTouch&&b.height<43.5)failures.push(`touch menu item ${index+1} below 44px: ${b.height}`);
      else if(outsideViewport(b,viewport))failures.push(`menu item ${index+1} is not reachable: ${JSON.stringify({...b,right:b.x+b.width,bottom:b.y+b.height})}`);
    }

    if(count>=3){
      await buttons.nth(2).click();
      await page.waitForTimeout(40);
      const action=await page.evaluate(()=>window.lastAction||'');
      if(!String(action).startsWith('duplicate:'))failures.push(`Duplicate did not dispatch: ${action||'nothing'}`);
    }

    await trigger.click();
    await menu.waitFor({state:'visible'});
    await page.keyboard.press('Escape');
    await page.waitForTimeout(30);
    if(await menu.isVisible().catch(()=>false))failures.push('Escape did not close document action menu');

    await trigger.click();
    await menu.waitFor({state:'visible'});
    await page.locator(`${menuSelector} button[role="menuitem"]`).first().click();
    await page.locator('.ta-doc-detail-page').waitFor({state:'visible'});
    const detail=await page.locator('.ta-doc-detail-page').boundingBox();
    if(!detail||detail.x<-2||detail.x+detail.width>viewport.width+2)failures.push(`document detail leaves viewport: ${JSON.stringify(detail)}`);

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
  const failures=rows.flatMap(row=>row.failures.map(f=>`${row.name}/${row.lang}: ${f}`));
  assert.equal(failures.length,0,failures.join('\n'));
  console.log(`v337 document action menus: ${rows.length} Chromium/WebKit phone+iPad+desktop cases passed; every action remains reachable and coarse-pointer actions keep a 44px floor.`);
})().catch(error=>{console.error(error);process.exitCode=1;});