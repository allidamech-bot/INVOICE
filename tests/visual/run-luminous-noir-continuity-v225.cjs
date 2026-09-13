const { chromium } = require('playwright');
const fs = require('fs');

const output='visual-qa-output/luminous-noir-continuity-v225';
fs.mkdirSync(output,{recursive:true});

const lightness=rgb=>{
  const values=String(rgb).match(/[\d.]+/g)?.slice(0,3).map(Number)||[0,0,0];
  return Math.max(...values);
};

(async()=>{
  const browser=await chromium.launch({headless:true});
  const results=[];
  try{
    for(const viewport of [{width:390,height:844,label:'iphone'},{width:1440,height:1000,label:'desktop'}]){
      const page=await browser.newPage({viewport,hasTouch:viewport.width<=430,isMobile:viewport.width<=430});
      const errors=[];
      page.on('pageerror',error=>errors.push(String(error)));
      await page.goto('http://127.0.0.1:4173/dist/health.html',{waitUntil:'load'});
      await page.waitForFunction(()=>!document.querySelector('#summaryText')?.textContent?.includes('Checking'),null,{timeout:5000});
      const state=await page.evaluate(()=>{
        const sample=selector=>{
          const element=document.querySelector(selector);
          if(!element)return null;
          const style=getComputedStyle(element),rect=element.getBoundingClientRect();
          return {background:style.backgroundColor,color:style.color,width:Math.round(rect.width),height:Math.round(rect.height)};
        };
        return {
          overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth,
          summary:document.querySelector('#summaryText')?.textContent||'',
          body:sample('body'),
          card:sample('.card'),
          row:sample('.row'),
          primary:sample('.primary'),
          secondary:sample('.secondary')
        };
      });
      if(state.overflow)throw new Error(`${viewport.label}: health page overflows horizontally`);
      if(!state.card||lightness(state.card.background)>90)throw new Error(`${viewport.label}: health card returned to a light surface`);
      if(!state.row||lightness(state.row.background)>90)throw new Error(`${viewport.label}: health row returned to a light surface`);
      if(!state.secondary||lightness(state.secondary.background)>90)throw new Error(`${viewport.label}: secondary action returned to a light surface`);
      if(errors.length)throw new Error(`${viewport.label}: ${errors.join(' | ')}`);
      await page.screenshot({path:`${output}/${viewport.label}.png`,fullPage:true,animations:'disabled'});
      results.push({viewport:viewport.label,state});
      await page.close();
    }
    fs.writeFileSync(`${output}/results.json`,JSON.stringify(results,null,2));
    console.log(`Luminous Noir continuity v225: ${results.length} health flows passed.`);
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
