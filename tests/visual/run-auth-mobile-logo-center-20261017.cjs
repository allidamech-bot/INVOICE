// Browser-measured regression for the sign-in mark alignment reported on iPhone.
// Uses the real compiled production CSS and synthetic sign-in HTML. No auth or data.
const {chromium,webkit}=require('playwright');
const assert=require('node:assert/strict');
const {mkdirSync,writeFileSync}=require('node:fs');

const base='http://127.0.0.1:4173/tests/visual/premium-auth-gateway-v187.html';
const output='visual-qa-output/auth-mobile-logo-center';
const widths=[320,390,430,820];
const results=[];
(async()=>{
  mkdirSync(output,{recursive:true});
  for(const [engine,browserType] of [['chromium',chromium],['webkit',webkit]]){
    const browser=await browserType.launch({headless:true});
    try{
      for(const width of widths)for(const lang of ['en','ar'])for(const theme of ['light','dark'])for(const mode of ['signin','create']){
        const page=await browser.newPage({viewport:{width,height:932},hasTouch:width<=430,isMobile:width<=430});
        try{
          await page.goto(`${base}?mode=${mode}&lang=${lang}&theme=${theme}`,{waitUntil:'load'});
          await page.locator('.ta-auth-mobile-brand img').waitFor();
          const measurement=await page.evaluate(()=>{
            const rect=s=>document.querySelector(s).getBoundingClientRect();
            const center=r=>(r.left+r.right)/2;
            const card=rect('.ta-auth-card');
            const mark=rect('.ta-auth-mobile-brand .brand-mark img');
            const word=rect('.ta-auth-mobile-brand .brand-words strong');
            const brand=document.querySelector('.ta-auth-mobile-brand .brand.official-brand');
            const img=document.querySelector('.ta-auth-mobile-brand img');
            const luminance=color=>{const channels=color.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});return channels[0]*.2126+channels[1]*.7152+channels[2]*.0722;};
            const contrast=selector=>{const style=getComputedStyle(document.querySelector(selector));const a=luminance(style.color),b=luminance(style.backgroundColor);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);};
            return {
              cardX:center(card),logoX:center(mark),wordX:center(word),
              logoLeft:mark.left,logoRight:mark.right,
              logoY:center({left:mark.top,right:mark.bottom}),
              wordLeft:word.left,wordRight:word.right,
              wordY:center({left:word.top,right:word.bottom}),
              display:getComputedStyle(brand).display,
              gridColumns:getComputedStyle(brand).gridTemplateColumns,
              logoLoaded:img.complete&&img.naturalWidth>0,
              frameBackground:getComputedStyle(document.querySelector('.ta-auth-frame')).backgroundColor,
              mainBackground:getComputedStyle(document.querySelector('.ta-auth-main')).backgroundColor,
              logoSource:img.currentSrc,
              clip:getComputedStyle(img).clipPath,
              markBorder:getComputedStyle(document.querySelector('.ta-auth-mobile-brand .brand-mark')).borderTopWidth,
              inputContrast:contrast('.ta-auth-fields input'),
              primaryContrast:contrast('.ta-auth-primary'),
              overflow:document.documentElement.scrollWidth-innerWidth
            };
          });
          assert.equal(measurement.logoLoaded,true,'Original logo not loaded');
          assert.ok(measurement.logoSource.endsWith('/brand/lourex-header-logo.jpeg'),'must test the production artwork');
          assert.ok(measurement.clip.startsWith('polygon('),'rectangular photograph backdrop must be clipped');
          assert.equal(measurement.markBorder,'0px','logo must float without a framed tile');
          assert.equal(measurement.frameBackground,'rgba(0, 0, 0, 0)','frame must blend with page');
          assert.equal(measurement.mainBackground,'rgba(0, 0, 0, 0)','main must blend with page');
          assert.ok(measurement.inputContrast>=4.5,'input text contrast must meet 4.5:1');
          assert.ok(measurement.primaryContrast>=4.5,'primary button contrast must meet 4.5:1');
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
          if(width===390&&lang==='en'&&theme==='dark'&&mode==='signin')
            await page.screenshot({path:`${output}/${engine}-390-signin.png`,fullPage:false});
          results.push({engine,width,lang,theme,mode,measurement});
        }finally{await page.close();}
      }
    }finally{await browser.close();}
  }
  writeFileSync(`${output}/results.json`,JSON.stringify({cases:results.length,results},null,2));
  console.log('AUTH_MOBILE_BRAND_CENTER_PASS '+results.length+' Chromium/WebKit iPhone/tablet sign-in and account-creation layouts');
})().catch(error=>{console.error(error);process.exitCode=1;});
