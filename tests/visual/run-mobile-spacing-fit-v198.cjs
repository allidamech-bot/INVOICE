const {chromium}=require('playwright');
const {mkdirSync,writeFileSync}=require('node:fs');
const assert=require('node:assert/strict');

const output='visual-qa-output/mobile-spacing-fit-v198';
const base='http://127.0.0.1:4173/tests/visual';
const phones=[{width:320,height:568},{width:390,height:844},{width:430,height:932}];
const surfaces=[
  {name:'shell',file:'obsidian-shell.html',root:'.workspace-shell'},
  {name:'dashboard',file:'obsidian-dashboard.html',root:'.dashboard-page'},
  {name:'documents',file:'obsidian-documents.html',root:'.documents-workspace-v2'},
  {name:'editor',file:'obsidian-editor.html',root:'.editor-screen',extra:'&kind=invoice'},
  {name:'customers',file:'obsidian-directory.html',root:'.customers-page',extra:'&screen=customers'}
];

const isLight=color=>{
  const parts=String(color).match(/[\d.]+/g)?.map(Number)||[];
  if(parts.length<3)return false;
  if(parts.length>3&&parts[3]<.15)return false;
  return parts[0]>220&&parts[1]>220&&parts[2]>220;
};

(async()=>{
  mkdirSync(output,{recursive:true});
  const browser=await chromium.launch({headless:true});
  const results=[];
  const run=async({name,url,viewport,lang,root,auth=false})=>{
    const page=await browser.newPage({viewport,hasTouch:true,isMobile:true});
    page.setDefaultTimeout(12000);
    const failures=[];
    page.on('pageerror',error=>failures.push(`pageerror: ${error?.stack||error}`));
    try{
      await page.goto(url,{waitUntil:'load'});
      await page.locator(root).waitFor();
      await page.evaluate(()=>document.fonts.ready);
      await page.waitForTimeout(80);
      const state=await page.evaluate(({rootSelector,authMode})=>{
        const rect=el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};};
        const style=el=>getComputedStyle(el);
        const html=document.documentElement,body=document.body,rootNode=document.getElementById('root'),main=document.querySelector(rootSelector);
        const nav=document.querySelector('.mobile-bottom-nav');
        const topbar=document.querySelector('.workspace-topbar,.app-header,.editor-topbar');
        const content=document.querySelector('.workspace-content');
        const visibleNav=nav&&style(nav).display!=='none'&&style(nav).visibility!=='hidden'&&style(nav).opacity!=='0';
        const visibleTopbar=topbar&&style(topbar).display!=='none'&&style(topbar).visibility!=='hidden';
        const storyDescription=document.querySelector('.auth-story-copy>p:last-child');
        const storyKicker=document.querySelector('.auth-story-kicker');
        return {
          viewport:{width:innerWidth,height:innerHeight},
          docScrollWidth:html.scrollWidth,
          bodyScrollWidth:body.scrollWidth,
          docScrollHeight:html.scrollHeight,
          htmlBg:style(html).backgroundColor,
          bodyBg:style(body).backgroundColor,
          rootBg:rootNode?style(rootNode).backgroundColor:null,
          rootRect:rootNode?rect(rootNode):null,
          mainRect:main?rect(main):null,
          nav:visibleNav?{rect:rect(nav),height:rect(nav).height}:null,
          topbar:visibleTopbar?{rect:rect(topbar)}:null,
          contentPaddingBottom:content?parseFloat(style(content).paddingBottom)||0:null,
          authFrame:authMode&&document.querySelector('.auth-account-frame')?rect(document.querySelector('.auth-account-frame')):null,
          authPage:authMode&&document.querySelector('.auth-account-page')?rect(document.querySelector('.auth-account-page')):null,
          primary:authMode&&document.querySelector('.premium-auth-primary')?rect(document.querySelector('.premium-auth-primary')):null,
          shortStory:authMode?{
            description:storyDescription?style(storyDescription).display:null,
            kicker:storyKicker?style(storyKicker).display:null
          }:null
        };
      },{rootSelector:root,authMode:auth});

      if(state.docScrollWidth>viewport.width+1)failures.push(`document horizontal overflow ${state.docScrollWidth}px > ${viewport.width}px`);
      if(state.bodyScrollWidth>viewport.width+1)failures.push(`body horizontal overflow ${state.bodyScrollWidth}px > ${viewport.width}px`);
      for(const [label,r] of [['root',state.rootRect],['main',state.mainRect],['auth frame',state.authFrame],['auth page',state.authPage]]){
        if(r&&(r.left<-1||r.right>viewport.width+1||r.width>viewport.width+1))failures.push(`${label} escapes viewport ${JSON.stringify(r)}`);
      }
      for(const [label,color] of [['html',state.htmlBg],['body',state.bodyBg],['root',state.rootBg]]){
        if(color&&isLight(color))failures.push(`${label} exposes light mobile canvas ${color}`);
      }
      if(state.nav){
        const r=state.nav.rect;
        if(r.left<-1||r.right>viewport.width+1||Math.abs(r.width-viewport.width)>1.5)failures.push(`bottom navigation does not fit viewport ${JSON.stringify(r)}`);
        if(state.contentPaddingBottom!==null&&state.contentPaddingBottom+1<state.nav.height)failures.push(`workspace bottom clearance ${state.contentPaddingBottom}px < nav ${state.nav.height}px`);
      }
      if(state.topbar){
        const r=state.topbar.rect;
        if(r.left<-1||r.right>viewport.width+1||r.width>viewport.width+1)failures.push(`top command bar escapes viewport ${JSON.stringify(r)}`);
      }
      if(auth){
        if(state.bodyBg!=='rgb(5, 18, 27)')failures.push(`auth body fallback is not dark gateway canvas: ${state.bodyBg}`);
        if(!state.primary)failures.push('auth primary action missing');
        if(viewport.height<=700&&(state.shortStory?.description!=='none'||state.shortStory?.kicker!=='none'))failures.push(`short-phone redundant story copy not compacted ${JSON.stringify(state.shortStory)}`);
        if(state.primary){
          await page.locator('.premium-auth-primary').scrollIntoViewIfNeeded();
          const reachable=await page.locator('.premium-auth-primary').evaluate(el=>{const r=el.getBoundingClientRect();const hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,hit:Boolean(hit&&el.contains(hit))};});
          if(reachable.top<-1||reachable.bottom>viewport.height+1||reachable.left<-1||reachable.right>viewport.width+1||!reachable.hit)failures.push(`auth primary action not reachable ${JSON.stringify(reachable)}`);
        }
      }
      await page.screenshot({path:`${output}/${name}-${viewport.width}-${lang}.png`,fullPage:true,animations:'disabled'});
      results.push({name,viewport,lang,state,failures});
    }catch(error){
      failures.push(error?.stack||String(error));
      await page.screenshot({path:`${output}/${name}-${viewport.width}-${lang}-failure.png`,fullPage:true,animations:'disabled'}).catch(()=>{});
      results.push({name,viewport,lang,failures});
    }finally{await page.close();}
  };

  try{
    for(const viewport of phones)for(const lang of ['en','ar']){
      const mode=lang==='en'&&viewport.width===390?'create':'signin';
      await run({name:`auth-${mode}`,viewport,lang,root:'.auth-account-page',auth:true,url:`${base}/premium-auth-gateway-v187.html?lang=${lang}&mode=${mode}`});
    }
    for(const viewport of phones)for(const lang of ['en','ar'])for(const surface of surfaces){
      await run({name:surface.name,viewport,lang,root:surface.root,url:`${base}/${surface.file}?lang=${lang}${surface.extra||''}`});
    }
  }finally{await browser.close();}

  writeFileSync(`${output}/report.json`,JSON.stringify({caseCount:results.length,results},null,2));
  const failures=results.flatMap(result=>result.failures.map(failure=>`${result.name} ${result.viewport.width}x${result.viewport.height} ${result.lang}: ${failure}`));
  assert.equal(failures.length,0,failures.join('\n\n'));
  console.log(`Mobile spacing/fit v198: ${results.length} phone viewport cases passed.`);
})().catch(error=>{console.error(error);process.exitCode=1;});
