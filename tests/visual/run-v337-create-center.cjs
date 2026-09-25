const {chromium,webkit}=require('playwright');
const assert=require('node:assert/strict');
const {mkdirSync,writeFileSync}=require('node:fs');

const output='visual-qa-output/v337-create-center';
const cases=[
  ['chromium-mobile',chromium,{width:390,height:844,isMobile:true,hasTouch:true}],
  ['webkit-mobile',webkit,{width:390,height:844,isMobile:true,hasTouch:true}],
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
      const box=await target.boundingBox();
      if(!box||box.height<43.5)failures.push(`item ${index+1} touch target ${box?box.height.toFixed(1):'missing'}px`);
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
  console.log(`v337 Create Center interaction QA: ${rows.length} Chromium/WebKit cases passed; all 10 document actions dispatched.`);
})().catch(error=>{console.error(error);process.exitCode=1;});
