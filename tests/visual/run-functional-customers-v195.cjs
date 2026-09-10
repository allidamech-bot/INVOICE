const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const BASE='http://127.0.0.1:4173/tests/visual/obsidian-functional-customers.html';

async function doubleClickByLabel(page,label){
  await page.evaluate((text)=>{
    const button=[...document.querySelectorAll('button')].find(node=>node.textContent?.trim()===text);
    if(!button)throw new Error(`button missing: ${text}`);
    button.click();button.click();
  },label);
}

async function runLanguage(browser,lang){
  const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1});
  await page.goto(`${BASE}?lang=${lang}`,{waitUntil:'networkidle'});
  await doubleClickByLabel(page,lang==='ar'?'عرض سعر':'Quote');
  await page.waitForTimeout(220);
  let calls=await page.evaluate(()=>window.customerDocumentCalls.slice());
  assert.deepEqual(calls,['customer-v195:proforma'],`${lang}: list quote action must be single-flight`);

  await page.locator('.customer-card-main').click();
  await doubleClickByLabel(page,lang==='ar'?'فاتورة جديدة':'New Invoice');
  await page.waitForTimeout(220);
  calls=await page.evaluate(()=>window.customerDocumentCalls.slice());
  assert.deepEqual(calls,['customer-v195:proforma','customer-v195:invoice'],`${lang}: profile invoice action must be single-flight`);
  await page.close();
}

(async()=>{
  const browser=await chromium.launch({headless:true});
  try{await runLanguage(browser,'en');await runLanguage(browser,'ar');console.log('Functional customers v195: 4/4 actions passed');}
  finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
