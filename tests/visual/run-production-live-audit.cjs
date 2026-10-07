/* LIVE Production audit: public, read-only, unauthenticated browser smoke.
   Never modifies user data, Vercel settings, or Production assets. */
const {chromium,webkit}=require('playwright');
const assert=require('node:assert/strict');
const {mkdirSync,writeFileSync}=require('node:fs');

const url=process.env.LOUREX_PRODUCTION_URL||'https://invoice-three-puce.vercel.app/';
const artifactDir='visual-qa-output/live-production';
mkdirSync(artifactDir,{recursive:true});

const report={url,at:new Date().toISOString(),scenarios:[],errors:[],limitations:[
  'No authenticated customer account was used: real document editing and menu navigation behind sign-in remain untested.',
  'An offscreen CSS probe validates styles loaded from actual Production, not the mounted document editor.'
]};
async function sampleGallery(page,duration=2600){
  await page.evaluate(()=>{
    const previous=document.querySelector('[data-lourex-live-qa-probe]');
    previous?.remove();
    const wrap=document.createElement('div');
    wrap.setAttribute('data-lourex-live-qa-probe','');
    wrap.className='app-ui';
    wrap.style.cssText='position:fixed;left:-10000px;top:10px;width:350px;pointer-events:none;z-index:-1;';
    const editor=document.createElement('div');editor.className='screen-editor';
    const gallery=document.createElement('div');gallery.className='template-selector';
    gallery.style.cssText='width:100%;min-height:100px;display:grid;';
    for(let i=0;i<2;i++){const item=document.createElement('div');item.textContent='QA '+i;gallery.appendChild(item);}
    editor.appendChild(gallery);wrap.appendChild(editor);document.body.appendChild(wrap);
    window.__liveGallerySamples=[];
    window.__liveGalleryTimer=setInterval(()=>{
      const st=getComputedStyle(gallery);
      const cols=st.gridTemplateColumns.trim().split(/\s+/).filter(Boolean);
      window.__liveGallerySamples.push({columns:cols.length,raw:st.gridTemplateColumns,at:Math.round(performance.now())});
    },75);
  });
  await page.waitForTimeout(duration);
  const data=await page.evaluate(()=>{
    clearInterval(window.__liveGalleryTimer);
    document.querySelector('[data-lourex-live-qa-probe]')?.remove();
    return window.__liveGallerySamples||[];
  });
  return data;
}
(async()=>{
  for(const engine of [chromium,webkit]){
    const browser=await engine.launch({headless:true});
    try{
      for(const width of [390,430,1440]){
        const height=width===1440?900:844;
        const context=await browser.newContext({viewport:{width,height},isMobile:width<600,hasTouch:width<600,ignoreHTTPSErrors:false});
        const page=await context.newPage(); const pageErrors=[];const resourceErrors=[];
        page.on('pageerror',error=>pageErrors.push(String(error).slice(0,350)));
        page.on('requestfailed',request=>resourceErrors.push({url:request.url().slice(0,160),reason:request.failure()?.errorText}));
        const label=engine.name()+'-'+width;
        const scenario={label};
        try{
          const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:35000});
          scenario.httpStatus=response?.status();
          assert.equal(scenario.httpStatus,200,'Production entry must return HTTP 200');
          await page.waitForSelector('#root',{timeout:18000});
          await page.waitForTimeout(1100);
          scenario.layout=await page.evaluate(()=>({
            title:document.title,
            rootChildren:document.getElementById('root')?.childElementCount||0,
            rootText:document.getElementById('root')?.textContent?.trim().slice(0,150)||'',
            scrollWidth:document.documentElement.scrollWidth,
            viewportWidth:innerWidth,
            stylesheetLinks:[...document.querySelectorAll('link[rel="stylesheet"]')].map(x=>new URL(x.href).pathname.split('/').pop())
          }));
          assert.ok(scenario.layout.rootChildren>0,'Production React root did not render');
          assert.ok(scenario.layout.stylesheetLinks.includes('app.bundle.css'),'Canonical CSS bundle not linked');
          const order=['app.bundle.css','v331-draft-scroll-recovery.css','v332-critical-documents-deep-closeout.css','v482-mobile-ux-repair.css'];
          for(const name of order)assert.ok(scenario.layout.stylesheetLinks.includes(name),'Missing stylesheet '+name);
          for(let i=1;i<order.length;i++)assert.ok(scenario.layout.stylesheetLinks.indexOf(order[i])>scenario.layout.stylesheetLinks.indexOf(order[i-1]),'Wrong production stylesheet cascade order '+order[i]);
          if(width<600)assert.ok(scenario.layout.scrollWidth<=width+2,'Horizontal page overflow '+scenario.layout.scrollWidth);
          const samples=await sampleGallery(page);
          scenario.samples={count:samples.length,uniqueColumns:[...new Set(samples.map(x=>x.columns))],first:samples[0],last:samples.at(-1)};
          assert.ok(samples.length>=18,'Not enough real time samples of CSS geometry');
          assert.ok(samples.every(x=>x.columns===2),'Retired single-column layout appeared in deployed CSS '+JSON.stringify(samples.filter(x=>x.columns!==2).slice(0,5)));
          if(width===390){
            const cssResponse=await page.request.get(new URL('/styles/v331-draft-scroll-recovery.css?v=365-1',url).href);
            scenario.documentCssStatus=cssResponse.status();
            assert.equal(cssResponse.status(),200,'Document recovery CSS not served');
            const css=await cssResponse.text();
            assert.ok(!/@import\b/.test(css),'Deployed v331 still contains late CSS imports');
            scenario.documentCssBytes=css.length;
            await page.reload({waitUntil:'domcontentloaded',timeout:35000});
            const reloadSamples=await sampleGallery(page,1800);
            scenario.reloadSamples={count:reloadSamples.length,uniqueColumns:[...new Set(reloadSamples.map(x=>x.columns))]};
            assert.ok(reloadSamples.length>=12&&reloadSamples.every(x=>x.columns===2),'Reload flashed stale mobile layout');
          }
          await page.screenshot({path:`${artifactDir}/${label}.png`,fullPage:false,animations:'disabled'});
          scenario.pageErrors=pageErrors;scenario.resourceErrors=resourceErrors.slice(0,10);
          assert.equal(pageErrors.length,0,'Uncaught browser JavaScript exceptions '+JSON.stringify(pageErrors));
          scenario.status='PASS';
          console.log('LIVE_PRODUCTION_PASS '+JSON.stringify(scenario));
        }catch(error){
          scenario.status='FAIL';scenario.error=String(error?.stack||error).slice(0,2000);
          scenario.pageErrors=pageErrors;scenario.resourceErrors=resourceErrors.slice(0,10);
          report.errors.push({label,error:scenario.error});
          console.error('LIVE_PRODUCTION_FAIL '+JSON.stringify(scenario));
        }finally{report.scenarios.push(scenario);await context.close();}
      }
    }finally{await browser.close();}
  }
  writeFileSync(artifactDir+'/report.json',JSON.stringify(report,null,2));
  if(report.errors.length)process.exitCode=1;
  console.log('LIVE_PRODUCTION_AUDIT_SUMMARY '+JSON.stringify({failures:report.errors.length,cases:report.scenarios.length,limitations:report.limitations,report:artifactDir+'/report.json'}));
})().catch(error=>{console.error(error);process.exitCode=1;});
