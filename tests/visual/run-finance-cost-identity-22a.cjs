const { chromium, webkit }=require('playwright');
const assert=require('node:assert/strict');
const { mkdirSync, writeFileSync }=require('node:fs');
const out='visual-qa-output/finance-cost-identity-22a';
const cases=[
  {scenario:'same-currency',expected:'8.00',complete:true},
  {scenario:'missing-currency',expected:'',complete:false}
];
const engines=[{name:'chromium',browser:chromium,viewport:{width:1280,height:900}},
  {name:'webkit',browser:webkit,viewport:{width:390,height:844}}];
const results=[];
(async()=>{
  mkdirSync(out,{recursive:true});
  for(const engine of engines){
    const browser=await engine.browser.launch({headless:true});
    try{
      for(const c of cases){
        const label=engine.name+'-'+c.scenario;
        const context=await browser.newContext({viewport:engine.viewport,
          isMobile:engine.name==='webkit',hasTouch:engine.name==='webkit'});
        const page=await context.newPage();
        const errors=[];
        page.on('pageerror',err=>errors.push(String(err)));
        page.setDefaultTimeout(18000);
        const url='http://127.0.0.1:4173/tests/visual/finance-cost-identity-22a.html?scenario='+c.scenario;
        try{
          await page.goto(url,{waitUntil:'load'});
          await page.locator('.editor-screen .item-card').first().waitFor({state:'visible'});
          assert.deepEqual(await page.evaluate(()=>window.qa22aInit),{id:'A',cost:'5.00',mismatched:!c.complete});
          const item=page.locator('.editor-screen .item-card').first();
          await item.locator('.item-description-autocomplete textarea').first().fill('QA B');
          const suggestion=page.locator('.item-suggestion-box button').filter({hasText:'QA B Product'}).first();
          await suggestion.waitFor({state:'visible'});
          await suggestion.click();
          await page.waitForFunction(()=>window.qa22aSaved?.items?.[0]?.savedItemId==='B',{timeout:15000});
          const afterSave=await page.evaluate(()=>({item:window.qa22aCurrent().items[0],summary:window.qa22aSummary(),saves:window.qa22aSaveCount}));
          assert.equal(afterSave.item.savedItemId,'B');
          assert.equal(afterSave.item.unitCost,c.expected, label+' saved B cost');
          assert.equal(afterSave.summary.complete,c.complete);
          if(!c.complete)assert.equal(afterSave.summary.marginPercent,'','unverified cost must blank margin');
          await page.screenshot({path:out+'/'+label+'-before-reload.png',animations:'disabled'});
          await page.reload({waitUntil:'load'});
          await page.locator('.editor-screen .item-card').first().waitFor({state:'visible'});
          const reopened=await page.evaluate(()=>({init:window.qa22aInit,item:window.qa22aCurrent().items[0],summary:window.qa22aSummary()}));
          assert.equal(reopened.init.id,'B',label+' reopens B');
          assert.equal(reopened.item.unitCost,c.expected,label+' reopens corrected unit cost');
          assert.equal(reopened.summary.complete,c.complete,label+' profit completeness');
          assert.equal(reopened.summary.itemCost,c.complete?'16.00':'0.00');
          const status=(await page.locator('.profitability-status').innerText()).trim();
          assert.equal(status,c.complete?'Cost complete':'1 costs missing');
          await page.locator('.profitability-toggle').click();
          const input=page.locator('.profitability-line input').first();
          assert.equal(await input.inputValue(),c.expected,label+' visible cost input after reload');
          const gross=(await page.locator('.profitability-profit strong').innerText()).trim();
          assert.equal(gross,c.complete?'12.00 USD':'—',label+' gross profit output');
          assert.deepEqual(errors,[],label+' browser page errors');
          await page.screenshot({path:out+'/'+label+'-reopened.png',animations:'disabled'});
          results.push({label,passed:true,reopenedId:reopened.item.savedItemId,cost:reopened.item.unitCost,
            complete:reopened.summary.complete,profit:reopened.summary.grossProfit,status});
        }finally{
          await context.close();
        }
      }
    }finally{await browser.close();}
  }
  writeFileSync(out+'/results.json',JSON.stringify({count:results.length,results},null,2));
  assert.equal(results.length,4);
  console.log(JSON.stringify({suite:'LOUREX 22-A real EditorPage browser fixture',count:results.length,failures:0,results},null,2));
})().catch(err=>{console.error(err);process.exit(1)});
