const {chromium,webkit}=require('playwright');
const assert=require('node:assert/strict');
const {mkdirSync}=require('node:fs');

const output='visual-qa-output/secure-share-batch11';mkdirSync(output,{recursive:true});
const scenarios=[
  {engine:'chromium',width:390,height:844,lang:'en',theme:'light'},
  {engine:'webkit',width:320,height:700,lang:'ar',theme:'light'},
  {engine:'webkit',width:430,height:932,lang:'en',theme:'dark'}
];

(async()=>{
  for(const scenario of scenarios){
    const type=scenario.engine==='webkit'?webkit:chromium,browser=await type.launch({headless:true});
    const page=await browser.newPage({viewport:{width:scenario.width,height:scenario.height}});
    await page.addInitScript(({theme})=>{try{localStorage.setItem('lourex-ui-theme',theme);}catch{}},{theme:scenario.theme});
    const url=`http://127.0.0.1:4173/tests/visual/secure-share-batch11.html?lang=${scenario.lang}`;
    await page.goto(url,{waitUntil:'networkidle'});
    await page.locator('#portal').waitFor({state:'visible'});
    const result=await page.evaluate(({width,lang})=>{
      const failures=[];const visible=el=>{const s=getComputedStyle(el),r=el.getBoundingClientRect();return s.display!=='none'&&s.visibility!=='hidden'&&r.width>0&&r.height>0;};
      if(document.documentElement.scrollWidth>width+2)failures.push(`horizontal overflow ${document.documentElement.scrollWidth}>${width}`);
      if(lang==='ar'&&document.documentElement.dir!=='rtl')failures.push(`Arabic direction=${document.documentElement.dir}`);
      if(lang==='en'&&document.documentElement.dir==='rtl')failures.push('English remained RTL');
      for(const el of document.querySelectorAll('button,textarea')){if(!visible(el))continue;const r=el.getBoundingClientRect();if(r.height<43.5)failures.push(`${el.tagName} height ${r.height}`);if(el.tagName==='BUTTON'&&r.width<43.5)failures.push(`button width ${r.width}`);}
      const portal=document.querySelector('#portal'),response=document.querySelector('.lx-public-response'),doc=document.querySelector('.lx-public-document-shell');
      if(!portal||!response||!doc)failures.push('portal surfaces missing');
      const textarea=document.querySelector('textarea');if(textarea&&parseFloat(getComputedStyle(textarea).fontSize)<15.5)failures.push('textarea may trigger Safari zoom');
      return{failures,scrollWidth:document.documentElement.scrollWidth,dir:document.documentElement.dir};
    },{width:scenario.width,lang:scenario.lang});
    await page.screenshot({path:`${output}/${scenario.engine}-${scenario.width}-${scenario.lang}-${scenario.theme}.png`,fullPage:true});
    assert.deepEqual(result.failures,[],`${scenario.engine} ${scenario.width} ${scenario.lang}: ${result.failures.join('; ')}`);
    const main=page.locator('main');await main.evaluate(el=>window.scrollTo(0,document.documentElement.scrollHeight));await page.waitForTimeout(50);
    assert.equal(await page.locator('.lx-public-response').isVisible(),true,'customer response must remain reachable');
    await browser.close();
  }
  console.log('Batch 11 secure share visual QA passed.');
})().catch(error=>{console.error(error);process.exit(1);});
