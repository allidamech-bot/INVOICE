const {chromium,webkit}=require('playwright');
const assert=require('node:assert/strict');
const {mkdirSync}=require('node:fs');

const output='visual-qa-output/tax-vat-batch10';
mkdirSync(output,{recursive:true});
const scenarios=[
  {engine:'chromium',browser:chromium,width:390,height:844,theme:'light',lang:'en'},
  {engine:'webkit',browser:webkit,width:320,height:700,theme:'light',lang:'ar'},
  {engine:'webkit',browser:webkit,width:430,height:932,theme:'dark',lang:'en'}
];

(async()=>{
  const failures=[];
  for(const scenario of scenarios){
    const browser=await scenario.browser.launch({headless:true});
    try{
      const page=await browser.newPage({viewport:{width:scenario.width,height:scenario.height}});
      await page.addInitScript(({theme})=>{try{localStorage.setItem('lourex-ui-theme',theme);}catch{}},{theme:scenario.theme});
      const url=`http://127.0.0.1:4173/tests/visual/obsidian-financial.html?screen=reports&lang=${scenario.lang}`;
      await page.goto(url,{waitUntil:'networkidle'});
      await page.locator('.ta-reports-page').waitFor({state:'visible',timeout:7000});
      const tab=page.getByRole('tab',{name:scenario.lang==='ar'?/الضريبة \/ VAT/:/Tax \/ VAT/});
      await tab.click();
      await page.locator('.lx-tax-center').waitFor({state:'visible',timeout:5000});
      const result=await page.evaluate(({width,lang})=>{
        const failures=[];
        const visible=el=>{if(!el)return false;const s=getComputedStyle(el),r=el.getBoundingClientRect();return s.display!=='none'&&s.visibility!=='hidden'&&r.width>0&&r.height>0;};
        const root=document.querySelector('.lx-tax-center');
        if(!root){failures.push('Tax VAT Center missing');return{failures};}
        if(document.documentElement.scrollWidth>width+2)failures.push(`horizontal overflow ${document.documentElement.scrollWidth}>${width}`);
        const r=root.getBoundingClientRect();if(r.left<-2||r.right>width+2)failures.push(`tax center outside viewport ${r.left}/${r.right}`);
        if(lang==='ar'&&document.documentElement.dir!=='rtl')failures.push(`Arabic dir=${document.documentElement.dir}`);
        if(lang==='en'&&document.documentElement.dir==='rtl')failures.push('English remained rtl');
        const tabs=[...document.querySelectorAll('.ta-report-workspace-tabs button')].filter(visible);
        if(tabs.length!==2)failures.push(`report tabs count=${tabs.length}`);
        for(const el of tabs){const b=el.getBoundingClientRect();if(b.height<43.5||b.width<43.5)failures.push(`tab touch target ${b.width}x${b.height}`);}
        for(const el of document.querySelectorAll('.lx-tax-center .btn,.lx-tax-center input,.lx-tax-center select')){if(!visible(el))continue;const b=el.getBoundingClientRect();if(b.height<43.5)failures.push(`control height ${b.height}`);}
        const scope=document.querySelector('.lx-tax-scope');
        if(!visible(scope))failures.push('Output VAT scope warning missing');
        const scopeText=(scope?.textContent||'').replace(/\s+/g,' ').trim();
        if(lang==='en'&&!scopeText.includes('Output VAT only'))failures.push('English Output VAT scope label missing');
        if(lang==='en'&&!scopeText.includes('Input VAT'))failures.push('English Input VAT limitation missing');
        if(lang==='ar'&&!scopeText.includes('ضريبة المخرجات فقط'))failures.push('Arabic Output VAT scope label missing');
        if(lang==='ar'&&!scopeText.includes('ضريبة المدخلات'))failures.push('Arabic Input VAT limitation missing');
        const main=document.querySelector('.ta-main');
        if(main){const max=Math.max(0,main.scrollHeight-main.clientHeight);main.scrollTop=max;if(max>2&&main.scrollTop<max-2)failures.push(`main cannot reach scroll end ${main.scrollTop}/${max}`);}
        return{failures,scrollWidth:document.documentElement.scrollWidth,dir:document.documentElement.dir};
      },{width:scenario.width,lang:scenario.lang});
      failures.push(...result.failures.map(msg=>`${scenario.engine}-${scenario.width}-${scenario.lang}-${scenario.theme}: ${msg}`));
      await page.screenshot({path:`${output}/${scenario.engine}-${scenario.width}-${scenario.lang}-${scenario.theme}.png`,fullPage:false});
    }catch(error){failures.push(`${scenario.engine}-${scenario.width}-${scenario.lang}-${scenario.theme}: ${error.stack||error}`);}
    finally{await browser.close();}
  }
  assert.deepEqual(failures,[],`Batch 10 Tax VAT browser QA failures:\n${failures.join('\n')}`);
  console.log('Batch 10 Tax VAT browser QA passed');
})().catch(error=>{console.error(error);process.exit(1);});
