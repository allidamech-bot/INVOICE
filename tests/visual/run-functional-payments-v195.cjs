const {chromium}=require('playwright');
const assert=require('node:assert/strict');

const BASE='http://127.0.0.1:4173/tests/visual/obsidian-functional-payments.html';

async function runLanguage(browser,lang){
  const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1});
  await page.goto(`${BASE}?lang=${lang}`,{waitUntil:'networkidle'});
  const record=page.getByRole('button',{name:lang==='ar'?'تسجيل دفعة':'Record Payment'});
  await record.click();
  const save=page.getByRole('button',{name:lang==='ar'?'حفظ الدفعة':'Save Payment'});
  await save.waitFor({state:'visible'});
  await page.evaluate((label)=>{
    const button=[...document.querySelectorAll('button')].find(node=>node.textContent?.includes(label));
    if(!button)throw new Error('save payment button missing');
    button.click();button.click();
  },lang==='ar'?'حفظ الدفعة':'Save Payment');
  await page.waitForTimeout(220);
  assert.equal(await page.evaluate(()=>window.paymentSaveCalls),1,`${lang}: payment save must be single-flight`);

  await page.evaluate((label)=>{
    const button=[...document.querySelectorAll('button')].find(node=>node.textContent?.trim()===label);
    if(!button)throw new Error('delete payment button missing');
    button.click();button.click();
  },lang==='ar'?'حذف':'Delete');
  await page.waitForTimeout(220);
  assert.equal(await page.evaluate(()=>window.paymentDeleteCalls),1,`${lang}: payment delete must be single-flight`);
  await page.close();
}

(async()=>{
  const browser=await chromium.launch({headless:true});
  try{
    await runLanguage(browser,'en');
    await runLanguage(browser,'ar');
    console.log('Functional payments v195: 2/2 scenarios passed');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
