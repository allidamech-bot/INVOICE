// Browser-measured regression for the sign-in mark alignment reported on iPhone.
// Uses the real compiled production CSS and synthetic sign-in HTML. No auth or data.
const {chromium,webkit}=require('playwright');
const assert=require('node:assert/strict');
const {mkdirSync,writeFileSync}=require('node:fs');

const base='http://127.0.0.1:4173/tests/visual/premium-auth-gateway-v187.html';
const output='visual-qa-output/auth-mobile-logo-center';
const widths=[390,430,820];
const results=[];
(async()=>{
  mkdirSync(output,{recursive:true});
  for(const [engine,browserType] of [['chromium',chromium],['webkit',webkit]]){
    const browser=await browserType.launch({headless:true});
    try{
      for(const width of widths)for(const lang of ['en','ar'])for(const theme of ['light','dark']){
        const page=await browser.newPage({viewport:{width,height:932},hasTouch:width<=430,isMobile:width<=430});
        try{
          await page.goto(`${base}?mode=signin&lang=${lang}&theme=${theme}`,{waitUntil:'load'});
          await page.locator('.ta-auth-mobile-brand img').waitFor();
          const measurement=await page.evaluate(()=>{
            const rect=s=>document.querySelector(s).getBoundingClientRect();
            const center=r=>(r.left+r.right)/2;
            const card=rect('.ta-auth-card');
            const mark=rect('.ta-auth-mobile-brand .brand-mark img');
            const word=rect('.ta-auth-mobile-brand .brand-words strong');
            const brand=document.querySelector('.ta-auth-mobile-brand .brand.official-brand');
            const img=document.querySelector('.ta-auth-mobile-brand img');
            return {
              cardX:center(card),logoX:center(mark),wordX:center(word),
              logoLeft:mark.left,logoRight:mark.right,
              logoY:center({left:mark.top,right:mark.bottom}),
              wordLeft:word.left,wordRight:word.right,
              wordY:center({left:word.top,right:word.bottom}),
              display:getComputedStyle(brand).display,
              gridColumns:getComputedStyle(brand).gridTemplateColumns,
              logoLoaded:img.complete&&img.naturalWidth>0,
              overflow:document.documentElement.scrollWidth-innerWidth
            };
          });
          assert.equal(measurement.logoLoaded,true,'SVG logo not loaded');
          assert.equal(measurement.display,'grid','sign-in must preserve a horizontal logo+wordmark');
          assert.ok(Math.abs(measurement.logoX-measurement.cardX)<=2,
            `logo shifted from card center: ${JSON.stringify(measurement)}`);
          assert.ok(Math.abs(measurement.wordY-measurement.logoY)<=2,
            `wordmark should be aligned beside the logo: ${JSON.stringify(measurement)}`);
          if(lang==='en')assert.ok(measurement.wordLeft>=measurement.logoRight,
            'English wordmark must remain to the right of the centered logo');
          if(lang==='ar')assert.ok(measurement.wordRight<=measurement.logoLeft,
            'RTL wordmark must mirror to the left of the centered logo');
          assert.ok(measurement.overflow<=1,'horizontal overflow');
          if(width===390&&lang==='en'&&theme==='dark')
            await page.screenshot({path:`${output}/${engine}-390-signin.png`,fullPage:false});
          results.push({engine,width,lang,theme,measurement});
        }finally{await page.close();}
      }
      // The correction must NOT reformat desktop branding or account creation.
      const page=await browser.newPage({viewport:{width:390,height:844}});
      try{
        await page.goto(`${base}?mode=create&lang=en&theme=light`,{waitUntil:'load'});
        const direction=await page.locator('.ta-auth-mobile-brand .brand.official-brand').evaluate(el=>getComputedStyle(el).flexDirection);
        assert.equal(direction,'row','account creation branding must remain unchanged');
      }finally{await page.close();}
    }finally{await browser.close();}
  }
  writeFileSync(`${output}/results.json`,JSON.stringify({cases:results.length,results},null,2));
  console.log('AUTH_MOBILE_BRAND_CENTER_PASS '+results.length+' horizontal-layout Chromium/WebKit iPhone/tablet cases; account creation unchanged');
})().catch(error=>{console.error(error);process.exitCode=1;});
