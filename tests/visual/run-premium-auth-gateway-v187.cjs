const { chromium } = require('playwright');
const { mkdirSync, writeFileSync } = require('node:fs');

const baseUrl='http://127.0.0.1:4173/tests/visual/premium-auth-gateway-v187.html';
const reportDir='visual-qa-output';
const reportPath=`${reportDir}/premium-auth-gateway-v187.json`;
const cases=[
  {width:1440,height:900,lang:'en',mode:'signin',label:'desktop EN sign in'},
  {width:1280,height:800,lang:'ar',mode:'create',label:'desktop AR create'},
  {width:820,height:1180,lang:'ar',mode:'signin',label:'tablet AR sign in'},
  {width:430,height:932,lang:'ar',mode:'signin',label:'large iPhone AR sign in'},
  {width:390,height:844,lang:'en',mode:'create',label:'iPhone EN create'},
  {width:320,height:568,lang:'ar',mode:'signin',label:'small phone AR sign in'}
];

const intersects=(a,b)=>Boolean(a&&b&&Math.min(a.right,b.right)-Math.max(a.left,b.left)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1);

(async()=>{
  mkdirSync(reportDir,{recursive:true});
  const browser=await chromium.launch({headless:true});
  const failures=[];
  const scenarios=[];
  try{
    for(const scenario of cases){
      const mobile=scenario.width<=600;
      const page=await browser.newPage({viewport:{width:scenario.width,height:scenario.height},hasTouch:mobile,isMobile:mobile});
      const url=`${baseUrl}?lang=${scenario.lang}&mode=${scenario.mode}`;
      await page.goto(url,{waitUntil:'networkidle'});
      await page.waitForTimeout(80);
      const result=await page.evaluate(({mode,lang})=>{
        const rectData=r=>({left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height});
        const box=selector=>{
          const el=document.querySelector(selector);if(!el)return null;
          const r=el.getBoundingClientRect(),s=getComputedStyle(el);
          return {...rectData(r),display:s.display,visibility:s.visibility};
        };
        const textRects=selectors=>selectors.flatMap(selector=>{
          const el=document.querySelector(selector);if(!el||!el.textContent?.trim())return [];
          const range=document.createRange();range.selectNodeContents(el);
          return Array.from(range.getClientRects()).filter(r=>r.width>0&&r.height>0).map(rectData);
        });
        const fields=Array.from(document.querySelectorAll('.account-entry-fields input')).map(el=>rectData(el.getBoundingClientRect()));
        return {
          dir:document.documentElement.dir,
          lang:document.documentElement.lang,
          viewport:{width:innerWidth,height:innerHeight},
          scrollWidth:document.documentElement.scrollWidth,
          scrollHeight:document.documentElement.scrollHeight,
          frame:box('.auth-account-frame'),story:box('.auth-account-story'),card:box('.auth-account-card'),
          languageButton:box('.premium-auth-language'),heading:box('.auth-card-heading'),
          headingTextRects:textRects(['.auth-card-heading .eyebrow','.auth-card-heading h1','.auth-card-heading .subtle']),
          google:box('.google-auth-button'),providerDivider:box('.auth-provider-divider'),
          tabs:box('.account-entry-tabs'),signinTab:box('#signin-tab'),createTab:box('#create-tab'),primary:box('.premium-auth-primary'),forgot:box('.account-forgot'),
          confirm:box('#confirm-field'),security:box('.auth-card-security'),fields,
          storyTrustDisplay:getComputedStyle(document.querySelector('.auth-story-trust')).display,
          mode,expectedLang:lang
        };
      },{mode:scenario.mode,lang:scenario.lang});
      scenarios.push({scenario,result});
      const p=`${scenario.label} ${scenario.width}x${scenario.height}`;
      if(result.dir!==(scenario.lang==='ar'?'rtl':'ltr'))failures.push(`${p}: wrong direction ${result.dir}`);
      if(result.lang!==scenario.lang)failures.push(`${p}: wrong lang ${result.lang}`);
      if(result.scrollWidth>scenario.width+1)failures.push(`${p}: horizontal overflow ${result.scrollWidth}px > ${scenario.width}px`);
      for(const key of ['frame','story','card','languageButton','heading','google','providerDivider','tabs','signinTab','createTab','primary','security'])if(!result[key]||result[key].display==='none'||result[key].visibility==='hidden')failures.push(`${p}: missing/hidden ${key}`);
      if(result.frame&&(result.frame.left<-1||result.frame.right>scenario.width+1))failures.push(`${p}: gateway frame clips horizontally`);
      if(result.card&&result.card.width<Math.min(280,scenario.width-20))failures.push(`${p}: auth card too narrow (${result.card.width}px)`);
      if(result.headingTextRects.some(rect=>intersects(result.languageButton,rect)))failures.push(`${p}: language switch overlaps visible heading text`);
      if(result.fields.some(field=>field.width<240&&scenario.width>=320))failures.push(`${p}: input field too narrow`);
      if(result.fields.some(field=>field.height<44-.25))failures.push(`${p}: input target below 44px`);
      if(scenario.mode==='create'&&!result.confirm)failures.push(`${p}: confirm-password field missing in create mode`);
      if(scenario.mode==='signin'&&result.confirm)failures.push(`${p}: confirm-password field visible in sign-in mode`);
      if(scenario.mode==='create'&&result.forgot)failures.push(`${p}: forgot-password action visible in create mode`);
      if(scenario.mode==='signin'&&!result.forgot)failures.push(`${p}: forgot-password action missing in sign-in mode`);
      if(mobile){
        for(const [name,b] of [['language',result.languageButton],['Google',result.google],['signin tab',result.signinTab],['create tab',result.createTab],['primary',result.primary],['forgot',result.forgot]]){
          if(b&&b.height<44-.25)failures.push(`${p}: ${name} target ${b.height}px (<44px)`);
        }
        if(result.storyTrustDisplay!=='none')failures.push(`${p}: dense trust cards should collapse on phone`);
      }else if(scenario.width>=901&&intersects(result.story,result.card))failures.push(`${p}: desktop story and form overlap`);
      if(result.card&&result.languageButton){
        const midpoint=result.card.left+result.card.width/2;
        if(scenario.lang==='ar'&&result.languageButton.left>midpoint)failures.push(`${p}: RTL language switch is not on logical opposite edge`);
        if(scenario.lang==='en'&&result.languageButton.right<midpoint)failures.push(`${p}: LTR language switch is not on logical opposite edge`);
      }
      await page.screenshot({path:`${reportDir}/premium-auth-${scenario.width}-${scenario.lang}-${scenario.mode}.png`,fullPage:true});
      await page.close();
    }
  }finally{await browser.close();}
  const report={caseCount:cases.length,failures,scenarios};
  writeFileSync(reportPath,JSON.stringify(report,null,2));
  if(failures.length){console.error(JSON.stringify({caseCount:cases.length,failures},null,2));process.exit(1);}
  console.log(JSON.stringify({caseCount:cases.length,failures:0},null,2));
})().catch(error=>{
  mkdirSync(reportDir,{recursive:true});
  writeFileSync(reportPath,JSON.stringify({caseCount:cases.length,error:String(error&&error.stack||error)},null,2));
  console.error(error);process.exit(1);
});
