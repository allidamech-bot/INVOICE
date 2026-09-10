const {chromium}=require('playwright');
const {mkdirSync,writeFileSync}=require('node:fs');
const assert=require('node:assert/strict');
const output='visual-qa-output/obsidian-foundation';
const scenarios=[{width:1440,height:1000,touch:false},{width:820,height:1180,touch:true},{width:390,height:844,touch:true},{width:320,height:568,touch:true}];
(async()=>{
  mkdirSync(output,{recursive:true});
  const browser=await chromium.launch({headless:true});
  const results=[];
  try{
    for(const scenario of scenarios)for(const lang of ['en','ar']){
      const page=await browser.newPage({viewport:{width:scenario.width,height:scenario.height},hasTouch:scenario.touch,isMobile:scenario.touch});
      const errors=[];
      page.on('pageerror',error=>errors.push(String(error)));
      await page.goto(`http://127.0.0.1:4173/tests/visual/obsidian-foundation.html?lang=${lang}`,{waitUntil:'load'});
      await page.locator('#customer').waitFor();
      await page.evaluate(()=>document.fonts.ready);
      const inspect=()=>page.evaluate(()=>{
        const rgb=value=>value.match(/[\d.]+/g).slice(0,3).map(Number);
        const luminance=color=>rgb(color).map(x=>{x/=255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4}).reduce((sum,x,i)=>sum+x*[.2126,.7152,.0722][i],0);
        const background=el=>{for(let node=el;node;node=node.parentElement){const c=getComputedStyle(node).backgroundColor;if(c!=='rgba(0, 0, 0, 0)'&&c!=='transparent')return c;}return 'rgb(255, 255, 255)';};
        const selectors=['#primary','#secondary','#ghost','#danger','#icon','#customer','#reference','#currency','#notes','.field-label','.field-error','.document-total strong'];
        return {overflow:document.documentElement.scrollWidth>innerWidth+1,targets:selectors.map(selector=>{
          const el=document.querySelector(selector),style=getComputedStyle(el),box=el.getBoundingClientRect();
          const a=luminance(style.color),b=luminance(background(el));
          return {selector,contrast:(Math.max(a,b)+.05)/(Math.min(a,b)+.05),height:box.height,fontSize:parseFloat(style.fontSize),tracking:style.letterSpacing,background:background(el),outline:style.outlineStyle};
        }),canvas:getComputedStyle(document.querySelector('.app-ui')).backgroundColor};
      });
      const base=await inspect();
      const failures=[];
      if(errors.length)failures.push(...errors);
      if(base.overflow)failures.push('Horizontal page overflow');
      for(const target of base.targets.filter(t=>['#customer','#reference','#currency','#notes'].includes(t.selector))){if(target.background!=='rgb(12, 23, 28)')failures.push(`${target.selector}: incorrect input surface ${target.background}`);}
      if(base.canvas!=='rgb(9, 18, 24)')failures.push(`Canvas: ${base.canvas}`);
      for(const target of base.targets){
        if(target.contrast<4.5&&target.selector!=='#icon')failures.push(`${target.selector}: contrast ${target.contrast.toFixed(2)}`);
        if(scenario.touch&&target.selector.startsWith('#')&&target.height<43.75)failures.push(`${target.selector}: touch height ${target.height}`);
        if(scenario.width<=720&&['#customer','#reference','#currency','#notes'].includes(target.selector)&&target.fontSize<16)failures.push(`${target.selector}: phone font ${target.fontSize}`);
        if(lang==='ar'&&target.tracking!=='normal'&&target.tracking!=='0px')failures.push(`${target.selector}: Arabic letter spacing ${target.tracking}`);
      }
      await page.locator('#primary').hover();
      const hover=(await inspect()).targets.find(t=>t.selector==='#primary');
      if(hover.contrast<4.5)failures.push(`Primary hover contrast ${hover.contrast.toFixed(2)}`);
      await page.keyboard.press('Tab');
      await page.locator('#customer').focus();
      if((await inspect()).targets.find(t=>t.selector==='#customer').outline==='none')failures.push('Missing keyboard focus outline');
      const label=`${scenario.width}-${lang}`;
      await page.screenshot({path:`${output}/${label}.png`,fullPage:true});
      results.push({scenario,lang,base,failures});
      await page.close();
    }
  }finally{await browser.close();}
  writeFileSync(`${output}/report.json`,JSON.stringify(results,null,2));
  const failures=results.flatMap(r=>r.failures.map(f=>`${r.scenario.width}/${r.lang}: ${f}`));
  assert.equal(failures.length,0,failures.join('\n'));
  console.log(`Obsidian foundation: ${results.length} responsive/language cases passed.`);
})().catch(error=>{console.error(error);process.exitCode=1;});
