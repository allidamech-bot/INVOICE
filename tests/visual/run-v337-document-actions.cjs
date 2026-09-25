const {chromium,webkit}=require('playwright');
const assert=require('node:assert/strict');
const {mkdirSync,writeFileSync}=require('node:fs');

const output='visual-qa-output/v337-document-actions';
const cases=[
  ['chromium-320',chromium,{width:320,height:700,isMobile:true,hasTouch:true}],
  ['webkit-320',webkit,{width:320,height:700,isMobile:true,hasTouch:true}],
  ['chromium-390',chromium,{width:390,height:844,isMobile:true,hasTouch:true}],
  ['webkit-390',webkit,{width:390,height:844,isMobile:true,hasTouch:true}],
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
    if(!triggerBox||triggerBox.width<43.5||triggerBox.height<43.5)failures.push(`document action trigger below 44px: ${triggerBox?`${triggerBox.width}x${triggerBox.height}`:'missing'}`);

    await trigger.click();
    const menu=page.locator(menuSelector).first();
    await menu.waitFor({state:'visible'});
    const menuBox=await menu.boundingBox();
    if(!menuBox)failures.push('document action menu has no visible box');
    else if(outsideViewport(menuBox,viewport))failures.push(`document action menu leaves viewport: ${JSON.stringify({...menuBox,right:menuBox.x+menuBox.width,bottom:menuBox.y+menuBox.height})}`);
    const menuMetrics=await menu.evaluate(el=>{const s=getComputedStyle(el);return{scrollHeight:el.scrollHeight,clientHeight:el.clientHeight,overflowY:s.overflowY};});
    if(menuMetrics.scrollHeight>menuMetrics.clientHeight+2&&!['auto','scroll'].includes(menuMetrics.overflowY))failures.push(`document action menu hides ${menuMetrics.scrollHeight-menuMetrics.clientHeight}px without scrolling`);

    const buttons=page.locator(`${menuSelector} button[role="menuitem"]`);
    const count=await buttons.count();
    if(count<3)failures.push(`document action menu only has ${count} items`);
    for(let index=0;index<Math.min(count,8);index+=1){
      const button=buttons.nth(index);
      await button.scrollIntoViewIfNeeded();
      const b=await button.boundingBox();
      if(!b||b.height<43.5)failures.push(`menu item ${index+1} below 44px: ${b?b.height:'missing'}`);
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
  console.log(`v337 document action menus: ${rows.length} Chromium/WebKit mobile/desktop cases passed down to 320px.`);
})().catch(error=>{console.error(error);process.exitCode=1;});
