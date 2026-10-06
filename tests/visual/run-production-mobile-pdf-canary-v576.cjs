const {chromium,webkit}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const base='https://invoice-three-puce.vercel.app/';
const output=path.resolve('visual-qa-output/production-mobile-pdf-v576');
fs.mkdirSync(output,{recursive:true});

const cases=[
  {name:'webkit-iphone390',type:webkit,userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1'},
  {name:'chromium-mobile390',type:chromium,userAgent:'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36'}
];

async function pdfBlobInfo(page){
  const link=page.locator('.lourex-ios-output-primary[href^="blob:"]');
  await link.waitFor({state:'attached',timeout:45000});
  const href=await link.getAttribute('href');
  assert.ok(href&&href.startsWith('blob:'),'mobile output did not expose a PDF blob');
  return page.evaluate(async url=>{
    const response=await fetch(url);
    const buffer=await response.arrayBuffer();
    const bytes=new Uint8Array(buffer);
    let text='';
    for(let offset=0;offset<bytes.length;offset+=0x8000)text+=String.fromCharCode(...bytes.subarray(offset,Math.min(offset+0x8000,bytes.length)));
    return{bytes:bytes.length,pageObjects:(text.match(/\/Type\s*\/Page\b/g)||[]).length,hasSingleCount:/\/Count\s+1\b/.test(text)};
  },href);
}

async function createWorkspace(page,name){
  await page.goto(base,{waitUntil:'domcontentloaded',timeout:60000});
  await page.getByRole('tab',{name:/Create Account/i}).click();
  const stamp=Date.now()+'-'+Math.random().toString(36).slice(2,8);
  const email=`mobile-pdf-v576-${name}-${stamp}@example.com`;
  const password='QA-Mobile-PDF-v576!'+stamp;
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password',{exact:true}).fill(password);
  await page.getByLabel('Confirm Password',{exact:true}).fill(password);
  await page.getByRole('button',{name:'Create Account',exact:true}).last().click();
  await page.getByRole('heading',{name:/Set up your protected workspace/i}).waitFor({timeout:45000});
  await page.getByLabel('Company Name English').fill('LOUREX Mobile PDF QA');
  await page.getByLabel(/Create PIN/).fill('2468');
  await page.getByLabel('Confirm PIN').fill('2468');
  await page.getByLabel(/I saved this key somewhere private/i).check();
  await page.getByRole('button',{name:/Create protected workspace/i}).click();
  await page.locator('.ta-mobile-nav').waitFor({state:'visible',timeout:60000});
}

async function createQuote(page){
  await page.locator('.ta-mobile-create').click();
  await page.getByRole('button',{name:/New quotation/i}).waitFor({state:'visible',timeout:15000});
  await page.getByRole('button',{name:/New quotation/i}).click();
  await page.locator('.editor-screen').waitFor({state:'visible',timeout:30000});

  const search=page.locator('input[placeholder="Search customer"]');
  await search.fill('Mobile PDF Buyer');
  await search.focus();
  await page.locator('.new-customer-option').click();
  await page.getByRole('heading',{name:'New Customer'}).waitFor({timeout:15000});
  await page.getByLabel('Company Name English').last().fill('Mobile PDF Buyer');
  await page.getByRole('button',{name:/Save & Select/i}).click();
  await page.locator('.selected-customer').waitFor({timeout:15000});

  async function fillItem(index,desc,qty,price){
    const card=page.locator('.item-card').nth(index);
    await card.locator('textarea').first().fill(desc);
    await card.getByLabel('Quantity',{exact:true}).fill(String(qty));
    await card.getByLabel('Unit',{exact:true}).selectOption({label:'PCS'}).catch(async()=>card.getByLabel('Unit',{exact:true}).selectOption('PCS'));
    await card.getByLabel(/Unit Price/).fill(String(price));
  }
  await fillItem(0,'Mobile Test Item 1',1,25);
  await page.locator('.add-item-button').click();
  await fillItem(1,'Mobile Test Item 2',2,15);
  await page.locator('.add-item-button').click();
  await fillItem(2,'Mobile Test Item 3',3,10);

  const save=page.locator('.mobile-editor-actionbar').getByRole('button',{name:/Save/i});
  if(await save.count())await save.click();
  await page.waitForTimeout(800);
}

async function previewMetrics(page){
  await page.locator('.mobile-editor-actionbar').getByRole('button',{name:/Preview/i}).click();
  const overlay=page.locator('.mobile-preview-overlay');
  await overlay.waitFor({state:'visible',timeout:15000});
  await page.waitForFunction(()=>document.querySelector('.mobile-preview-stage .invoice-pages')?.getAttribute('data-pagination-ready')==='true');
  const result=await page.evaluate(()=>({
    count:document.querySelectorAll('.mobile-preview-stage .invoice-page').length,
    footer:Array.from(document.querySelectorAll('.mobile-preview-stage .doc-footer')).map(node=>node.textContent||'').join(' | '),
    finalDetails:document.querySelectorAll('.mobile-preview-stage .final-details').length
  }));
  await overlay.getByRole('button',{name:/Close/i}).click();
  return result;
}

async function generatePdf(page){
  await page.locator('.mobile-editor-actionbar').getByRole('button',{name:'PDF',exact:true}).click();
  const review=page.getByRole('button',{name:/Confirm, Issue & PDF|Continue to PDF/i});
  if(await review.count()){
    await review.first().waitFor({state:'visible',timeout:15000});
    await review.first().click();
  }
  const info=await pdfBlobInfo(page);
  const card=page.locator('.lourex-ios-output-card');
  await card.screenshot({path:path.join(output,`pdf-ready-${Date.now()}.png`)});
  const close=page.locator('.lourex-ios-output-cancel');
  if(await close.count())await close.last().click();
  return info;
}

async function runCase(config){
  const browser=await config.type.launch({headless:true});
  const context=await browser.newContext({
    viewport:{width:390,height:844},
    screen:{width:390,height:844},
    isMobile:true,
    hasTouch:true,
    deviceScaleFactor:3,
    userAgent:config.userAgent,
    locale:'en-US'
  });
  const page=await context.newPage();
  const errors=[];
  page.on('pageerror',error=>errors.push('pageerror: '+error.message));
  page.on('console',msg=>{if(msg.type()==='error')errors.push('console: '+msg.text());});
  try{
    await createWorkspace(page,config.name);
    await createQuote(page);
    const mobile=await page.evaluate(()=>({width:innerWidth,height:innerHeight,mobile:matchMedia('(max-width:900px)').matches,dock:!!document.querySelector('.mobile-editor-actionbar')}));
    assert.equal(mobile.width,390,`${config.name}: viewport width drifted`);
    assert.equal(mobile.mobile,true,`${config.name}: app is not in mobile breakpoint`);
    assert.equal(mobile.dock,true,`${config.name}: mobile editor action dock missing`);
    const preview=await previewMetrics(page);
    assert.equal(preview.count,1,`${config.name}: 3-item mobile preview must be exactly one page`);
    assert.match(preview.footer,/1\s*\/\s*1/,`${config.name}: mobile preview footer is not 1 / 1`);
    assert.ok(preview.finalDetails>=1,`${config.name}: totals/footer details are detached from the single preview page`);

    const first=await generatePdf(page);
    assert.ok(first.bytes>10000,`${config.name}: first mobile PDF blob is too small`);
    assert.equal(first.pageObjects,1,`${config.name}: first mobile PDF contains ${first.pageObjects} physical pages`);
    assert.equal(first.hasSingleCount,true,`${config.name}: first mobile PDF page tree is not Count 1`);

    const second=await generatePdf(page);
    assert.ok(second.bytes>10000,`${config.name}: second mobile PDF blob is too small`);
    assert.equal(second.pageObjects,1,`${config.name}: repeated mobile PDF contains ${second.pageObjects} physical pages`);
    assert.equal(second.hasSingleCount,true,`${config.name}: repeated mobile PDF page tree is not Count 1`);

    await page.screenshot({path:path.join(output,`${config.name}-editor.png`),fullPage:false,animations:'disabled'});
    assert.deepEqual(errors,[],`${config.name}: browser errors: ${errors.join(' | ')}`);
    return{name:config.name,mobile,preview,first,second,errors};
  }finally{
    await context.close();
    await browser.close();
  }
}

(async()=>{
  const results=[];
  for(const config of cases)results.push(await runCase(config));
  fs.writeFileSync(path.join(output,'production-mobile-pdf-v576.json'),JSON.stringify({base,results},null,2));
  console.log('Production mobile PDF canary PASS for WebKit iPhone 390 and Chromium mobile 390.');
})().catch(error=>{console.error(error);process.exit(1);});
