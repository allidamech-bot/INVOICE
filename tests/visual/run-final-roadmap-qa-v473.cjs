const {chromium,webkit}=require('playwright');
const assert=require('node:assert/strict');
const {mkdirSync}=require('node:fs');
const out='visual-qa-output/final-roadmap-v473';mkdirSync(out,{recursive:true});
const scenarios=[
  {mode:'treasury',engine:'chromium',width:390,height:844,lang:'en'},
  {mode:'fx',engine:'webkit',width:320,height:700,lang:'ar'},
  {mode:'stock',engine:'webkit',width:430,height:932,lang:'en'}
];
(async()=>{
  for(const s of scenarios){
    const browser=await (s.engine==='webkit'?webkit:chromium).launch({headless:true});
    const page=await browser.newPage({viewport:{width:s.width,height:s.height}});
    await page.goto(`http://127.0.0.1:4173/tests/visual/final-roadmap-qa-v473.html?mode=${s.mode}&lang=${s.lang}`,{waitUntil:'networkidle'});
    const result=await page.evaluate(({width,lang})=>{
      const failures=[];const root=document.documentElement;
      if(root.scrollWidth>width+2)failures.push(`horizontal overflow ${root.scrollWidth}>${width}`);
      if(lang==='ar'&&root.dir!=='rtl')failures.push(`Arabic direction=${root.dir}`);
      if(lang!=='ar'&&root.dir==='rtl')failures.push('English remained RTL');
      const visible=el=>{const cs=getComputedStyle(el),r=el.getBoundingClientRect();return cs.display!=='none'&&cs.visibility!=='hidden'&&r.width>0&&r.height>0;};
      for(const el of document.querySelectorAll('button,input,select,textarea')){if(!visible(el))continue;const r=el.getBoundingClientRect();if(r.height<43.5)failures.push(`${el.tagName} height ${r.height}`);if(el.tagName==='BUTTON'&&r.width<43.5)failures.push(`button width ${r.width}`);if(['INPUT','SELECT','TEXTAREA'].includes(el.tagName)&&parseFloat(getComputedStyle(el).fontSize)<15.5)failures.push(`${el.tagName} font ${getComputedStyle(el).fontSize}`);}
      return failures;
    },{width:s.width,lang:s.lang});
    assert.deepEqual(result,[],`${s.mode}/${s.engine}/${s.width}: ${result.join('; ')}`);
    await page.screenshot({path:`${out}/${s.mode}-${s.engine}-${s.width}-${s.lang}.png`,fullPage:true});
    await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));
    await page.waitForTimeout(50);
    assert.equal(await page.locator('main').isVisible(),true);
    await browser.close();
  }
  console.log('Final roadmap visual QA passed.');
})().catch(error=>{console.error(error);process.exit(1);});
