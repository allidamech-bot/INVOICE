const {chromium,webkit}=require('playwright');
const assert=require('node:assert/strict');
const {mkdirSync,writeFileSync}=require('node:fs');

const output='visual-qa-output/finance-privacy-disclosure-35a';
const suites=[
  {name:'chromium',type:chromium,viewport:{width:1280,height:900}},
  {name:'webkit',type:webkit,viewport:{width:390,height:844}}
];
const locales=[
  {lang:'en',include:['not end-to-end encrypted by LOUREX','customer-facing invoices','cloud security rules'],exclude:['encrypted LOUREX vault']},
  {lang:'ar',include:['لا تكون بيانات مساحة العمل مشفّرة من طرف إلى طرف','الفواتير الموجهة للعملاء','قواعد أمان الخدمة السحابية'],exclude:['خزنة LOUREX المشفّرة']}
];

(async()=>{
  mkdirSync(output,{recursive:true});
  const results=[];
  for(const suite of suites){
    const browser=await suite.type.launch({headless:true});
    try{
      for(const locale of locales){
        const context=await browser.newContext({
          viewport:suite.viewport,hasTouch:suite.name==='webkit',isMobile:suite.name==='webkit'
        });
        const page=await context.newPage();
        const errors=[];
        page.on('pageerror',error=>errors.push(String(error)));
        page.setDefaultTimeout(18000);
        try{
          await page.goto('http://127.0.0.1:4173/tests/visual/obsidian-editor.html?kind=invoice&lang='+locale.lang,{waitUntil:'load'});
          const toggle=page.locator('.profitability-toggle');
          await toggle.waitFor({state:'visible'});
          await toggle.click();
          const notice=page.locator('.profitability-privacy');
          await notice.waitFor({state:'visible'});
          const disclosure=(await notice.innerText()).trim();
          for(const word of locale.include)assert.ok(disclosure.includes(word),suite.name+' '+locale.lang+': missing '+word);
          for(const word of locale.exclude)assert.ok(!disclosure.includes(word),suite.name+' '+locale.lang+': misleading old assurance');
          assert.deepEqual(errors,[],suite.name+' '+locale.lang+' browser errors');
          await notice.screenshot({path:output+'/'+suite.name+'-'+locale.lang+'.png',animations:'disabled'});
          results.push({engine:suite.name,lang:locale.lang,pass:true,disclosure});
        }finally{await context.close();}
      }
    }finally{await browser.close();}
  }
  assert.equal(results.length,4);
  writeFileSync(output+'/results.json',JSON.stringify({count:results.length,failures:0,results},null,2));
  console.log(JSON.stringify({suite:'Finance 35-A bilingual browser disclosure',count:results.length,failures:0},null,2));
})().catch(error=>{console.error(error);process.exit(1)});
