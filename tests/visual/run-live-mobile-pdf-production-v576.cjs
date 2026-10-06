const {webkit}=require('playwright');
const assert=require('node:assert/strict');
const {mkdirSync,writeFileSync}=require('node:fs');
const path=require('node:path');

const url='https://invoice-three-puce.vercel.app/';
const output=path.resolve('visual-qa-output/live-mobile-pdf-production-v576');
mkdirSync(output,{recursive:true});

const scenario={
  width:390,height:844,
  userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
};

async function pdfArtifact(page){
  const link=page.locator('.lourex-ios-output-primary[href^="blob:"]');
  await link.waitFor({state:'attached',timeout:60000});
  const href=await link.getAttribute('href');
  assert.ok(href&&href.startsWith('blob:'),'iPhone PDF output did not expose a blob download link');
  return await page.evaluate(async blobUrl=>{
    const response=await fetch(blobUrl);
    const buffer=await response.arrayBuffer();
    const bytes=new Uint8Array(buffer);
    let text='';
    for(let offset=0;offset<bytes.length;offset+=0x8000){
      text+=String.fromCharCode(...bytes.subarray(offset,Math.min(offset+0x8000,bytes.length)));
    }
    return {
      bytes:bytes.length,
      pageObjects:(text.match(/\/Type\s*\/Page\b/g)||[]).length,
      countMatches:Array.from(text.matchAll(/\/Count\s+(\d+)\b/g)).map(match=>Number(match[1])).filter(Number.isFinite)
    };
  },href);
}

async function fillItem(card,description,quantity,price){
  await card.locator('textarea').first().fill(description);
  await card.getByLabel('Quantity').fill(String(quantity));
  await card.getByLabel('Unit',{exact:true}).selectOption('PCS');
  await card.getByLabel(/Unit Price \(/).fill(String(price));
}

(async()=>{
  const browser=await webkit.launch({headless:true});
  const context=await browser.newContext({
    viewport:{width:scenario.width,height:scenario.height},
    hasTouch:true,isMobile:true,userAgent:scenario.userAgent
  });
  await context.addInitScript(()=>{
    try{Object.defineProperty(navigator,'platform',{configurable:true,get:()=> 'iPhone'});}catch{}
    try{Object.defineProperty(navigator,'maxTouchPoints',{configurable:true,get:()=>5});}catch{}
  });
  const page=await context.newPage();
  const pageErrors=[];
  const consoleErrors=[];
  page.on('pageerror',error=>pageErrors.push(String(error)));
  page.on('console',msg=>{if(msg.type()==='error')consoleErrors.push(msg.text());});

  try{
    await page.goto(url,{waitUntil:'networkidle',timeout:90000});

    const stamp=Date.now();
    const email=`lourex.mobile.pdf.${stamp}@example.com`;
    const password=`MobilePdfQA!${stamp}Aa`;

    await page.locator('#account-tab-create').click();
    await page.locator('input[type="email"]').fill(email);
    const authPasswords=page.locator('.ta-auth-card input[type="password"]');
    await authPasswords.nth(0).fill(password);
    await authPasswords.nth(1).fill(password);
    await page.locator('.ta-auth-primary').click();

    await page.locator('.ta-setup-card').waitFor({state:'visible',timeout:90000});
    await page.getByLabel('Company Name English').fill('LOUREX Mobile PDF QA');
    await page.getByLabel('Create PIN · 4–12 digits').fill('1234');
    await page.getByLabel('Confirm PIN').fill('1234');
    await page.locator('.ta-pin-recovery-setup input[type="checkbox"]').check();
    await page.getByRole('button',{name:'Create protected workspace'}).click();

    await page.locator('.app-ui .ta-mobile-nav').waitFor({state:'visible',timeout:90000});
    assert.equal(await page.evaluate(()=>innerWidth),390,'WebKit live QA did not run at iPhone width');

    await page.locator('.ta-mobile-create').click();
    await page.locator('.global-search-panel').waitFor({state:'visible'});
    await page.getByRole('button',{name:/New quotation/}).click();
    await page.locator('.editor-screen').waitFor({state:'visible',timeout:30000});

    const customerSearch=page.getByPlaceholder('Search customer');
    await customerSearch.click();
    await page.locator('.new-customer-option').click();
    const customerModal=page.locator('.modal-backdrop').last();
    await customerModal.getByLabel('Company Name English').fill('Mobile PDF Test Buyer');
    await customerModal.getByRole('button',{name:'Save & Select'}).click();
    await page.locator('.selected-customer').waitFor({state:'visible',timeout:30000});

    let cards=page.locator('.item-card');
    await fillItem(cards.nth(0),'Mobile PDF item 1',2,'10');
    for(let index=2;index<=3;index++){
      await page.getByRole('button',{name:'Add Item'}).click();
      cards=page.locator('.item-card');
      await fillItem(cards.nth(index-1),`Mobile PDF item ${index}`,index,String(10+index));
    }

    await page.getByRole('button',{name:'Preview'}).last().click();
    await page.locator('.mobile-preview-stage .invoice-page').first().waitFor({state:'visible',timeout:30000});
    const previewCount=await page.locator('.mobile-preview-stage .invoice-page').count();
    assert.equal(previewCount,1,`iPhone preview expected 1 page, got ${previewCount}`);
    const previewFooter=await page.locator('.mobile-preview-stage .invoice-page .doc-footer').last().innerText().catch(()=> '');
    await page.locator('.mobile-preview-overlay button[aria-label="Close"]').click();

    const results=[];
    for(let attempt=1;attempt<=2;attempt++){
      await page.locator('.mobile-editor-actionbar button').filter({hasText:/^PDF$/}).click();
      const review=page.locator('.modal-backdrop').last();
      if(await review.isVisible().catch(()=>false)){
        const confirm=review.getByRole('button',{name:/Confirm, Issue & PDF|Continue to PDF/});
        await confirm.waitFor({state:'visible',timeout:15000});
        await confirm.click();
      }
      const artifact=await pdfArtifact(page);
      assert.ok(artifact.bytes>10000,`attempt ${attempt}: generated PDF is unexpectedly small (${artifact.bytes} bytes)`);
      assert.equal(artifact.pageObjects,1,`attempt ${attempt}: iPhone downloaded PDF contains ${artifact.pageObjects} physical pages instead of 1`);
      assert.ok(artifact.countMatches.includes(1),`attempt ${attempt}: downloaded PDF page tree does not include Count 1`);
      results.push({attempt,...artifact});
      await page.screenshot({path:path.join(output,`iphone390-attempt-${attempt}.png`),fullPage:false,animations:'disabled'});
      const close=page.locator('.lourex-ios-output-cancel');
      if(await close.count())await close.last().click();
      await page.waitForTimeout(400);
    }

    const finalState=await page.evaluate(()=>({
      width:innerWidth,
      scrollWidth:document.documentElement.scrollWidth,
      editor:Boolean(document.querySelector('.editor-screen')),
      mobileActionbar:Boolean(document.querySelector('.mobile-editor-actionbar')),
      outputOverlay:Boolean(document.querySelector('.lourex-ios-output-fallback'))
    }));
    assert.ok(finalState.scrollWidth<=finalState.width+1,`iPhone editor has horizontal overflow ${finalState.scrollWidth} > ${finalState.width}`);
    assert.equal(finalState.editor,true,'PDF output navigated away from the editor');
    assert.equal(finalState.mobileActionbar,true,'mobile document action bar disappeared');
    assert.deepEqual(pageErrors,[],'page errors occurred during live iPhone PDF flow');

    const report={url,viewport:{width:390,height:844},engine:'webkit',previewCount,previewFooter,downloads:results,finalState,pageErrors,consoleErrors};
    writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));
    console.log('LIVE MOBILE PDF PASS',JSON.stringify(report));
  }finally{
    await context.close();
    await browser.close();
  }
})().catch(error=>{console.error(error);process.exit(1);});
