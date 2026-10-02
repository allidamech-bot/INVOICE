const {chromium}=require('playwright');
const {mkdirSync,writeFileSync}=require('node:fs');
const assert=require('node:assert/strict');

const output='visual-qa-output/visual-foundation';
const scenarios=[
  {name:'phone320-dark-ar',width:320,height:700,theme:'dark',lang:'ar',touch:true,kind:'phone'},
  {name:'phone390-dark-ar',width:390,height:844,theme:'dark',lang:'ar',touch:true,kind:'phone'},
  {name:'phone390-light-ar',width:390,height:844,theme:'light',lang:'ar',touch:true,kind:'phone'},
  {name:'phone390-dark-en',width:390,height:844,theme:'dark',lang:'en',touch:true,kind:'phone'},
  {name:'ipad768-portrait-dark-ar',width:768,height:1024,theme:'dark',lang:'ar',touch:true,kind:'tablet'},
  {name:'ipad820-portrait-dark-ar',width:820,height:1180,theme:'dark',lang:'ar',touch:true,kind:'tablet'},
  {name:'ipad1024-landscape-dark-ar',width:1024,height:768,theme:'dark',lang:'ar',touch:true,kind:'tablet'},
  {name:'ipad1180-landscape-dark-ar',width:1180,height:820,theme:'dark',lang:'ar',touch:true,kind:'tablet'},
  {name:'desktop-dark-ar',width:1440,height:900,theme:'dark',lang:'ar',touch:false,kind:'desktop'},
  {name:'desktop-light-ar',width:1440,height:900,theme:'light',lang:'ar',touch:false,kind:'desktop'},
  {name:'desktop-dark-en',width:1440,height:900,theme:'dark',lang:'en',touch:false,kind:'desktop'}
];

const surfaces=[
  {name:'dashboard',fixture:'obsidian-dashboard.html',selector:'.ta-finance-dashboard'},
  {name:'documents',fixture:'obsidian-documents.html',selector:'.ta-documents-page'},
  {name:'customers',fixture:'obsidian-directory.html',query:'screen=customers',selector:'.ta-customers-page'},
  {name:'operations',fixture:'obsidian-financial.html',query:'screen=operations',selector:'.ta-operations-page'},
  {name:'shell',fixture:'obsidian-shell.html',selector:'.ta-shell'}
];

async function applyProductionFoundation(page){
  await page.evaluate(async()=>{
    document.querySelectorAll('link[data-lourex-foundation-qa]').forEach(node=>node.remove());
    for(const href of ['styles/v332-critical-documents-deep-closeout.css?v=332-1','styles/lourex-visual-foundation.css?v=foundation-1']){
      await new Promise((resolve,reject)=>{
        const link=document.createElement('link');
        link.rel='stylesheet';
        link.href=href;
        link.setAttribute('data-lourex-foundation-qa',href);
        link.addEventListener('load',resolve,{once:true});
        link.addEventListener('error',()=>reject(new Error(`failed to load ${href}`)),{once:true});
        document.head.appendChild(link);
      });
    }
    if(document.fonts?.ready)await document.fonts.ready;
  });
}

function nearBlack(value){
  const m=String(value||'').match(/rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?/i);
  if(!m)return false;
  const alpha=m[4]===undefined?1:Number(m[4]);
  if(!Number.isFinite(alpha)||alpha<0.2)return false;
  const [r,g,b]=m.slice(1,4).map(Number);
  return r<7&&g<7&&b<7;
}

function queryString(surface,scenario){
  const params=new URLSearchParams(surface.query||'');
  params.set('lang',scenario.lang);
  return params.toString();
}

(async()=>{
  mkdirSync(output,{recursive:true});
  const browser=await chromium.launch({headless:true});
  const results=[];
  try{
    for(const scenario of scenarios){
      for(const surface of surfaces){
        const page=await browser.newPage({
          viewport:{width:scenario.width,height:scenario.height},
          hasTouch:scenario.touch,
          isMobile:scenario.kind==='phone'
        });
        const failures=[];
        page.on('pageerror',error=>failures.push(`pageerror: ${String(error)}`));
        page.on('console',message=>{if(message.type()==='error')failures.push(`console: ${message.text()}`);});
        await page.addInitScript(({theme})=>{try{localStorage.setItem('lourex-ui-theme',theme);}catch{}},{theme:scenario.theme});
        const url=`http://127.0.0.1:4173/tests/visual/${surface.fixture}?${queryString(surface,scenario)}`;
        await page.goto(url,{waitUntil:'load'});
        await applyProductionFoundation(page);
        await page.evaluate(({theme,lang})=>{
          document.documentElement.dataset.uiTheme=theme;
          document.documentElement.dataset.uiThemePreference=theme;
          document.documentElement.style.colorScheme=theme;
          document.documentElement.lang=lang;
          document.documentElement.dir=lang==='ar'?'rtl':'ltr';
        },scenario);
        await page.locator(surface.selector).waitFor({state:'visible',timeout:10000});
        await page.waitForTimeout(120);

        const common=await page.evaluate(({selector,width,kind,lang})=>{
          const root=getComputedStyle(document.documentElement);
          const target=document.querySelector(selector);
          const targetStyle=target?getComputedStyle(target):null;
          const main=document.querySelector('.ta-main');
          const sidebar=document.querySelector('.ta-sidebar');
          const nav=document.querySelector('.ta-mobile-nav');
          const rect=node=>node?(()=>{const r=node.getBoundingClientRect();return{left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};})():null;
          return {
            clientWidth:document.documentElement.clientWidth,
            scrollWidth:document.documentElement.scrollWidth,
            dir:document.documentElement.dir,
            canvas:root.getPropertyValue('--app-canvas').trim(),
            surface:root.getPropertyValue('--app-surface').trim(),
            card:root.getPropertyValue('--app-card').trim(),
            targetBackground:targetStyle?.backgroundColor||'',
            mainBackground:main?getComputedStyle(main).backgroundColor:'',
            targetRect:rect(target),
            sidebarDisplay:sidebar?getComputedStyle(sidebar).display:'missing',
            navDisplay:nav?getComputedStyle(nav).display:'missing',
            navRect:rect(nav),
            width,kind,lang
          };
        },{selector:surface.selector,width:scenario.width,kind:scenario.kind,lang:scenario.lang});

        if(common.scrollWidth>common.clientWidth+2)failures.push(`horizontal overflow ${common.scrollWidth}>${common.clientWidth}`);
        if(scenario.lang==='ar'&&common.dir!=='rtl')failures.push(`Arabic direction=${common.dir}`);
        if(scenario.lang==='en'&&common.dir!=='ltr')failures.push(`English direction=${common.dir}`);
        if(!common.canvas||!common.surface||!common.card)failures.push('semantic visual tokens missing at runtime');
        if(scenario.theme==='dark'&&(nearBlack(common.mainBackground)||nearBlack(common.targetBackground)))failures.push(`near-black well detected main=${common.mainBackground} target=${common.targetBackground}`);
        if(common.targetRect&&(common.targetRect.left<-2||common.targetRect.right>scenario.width+2))failures.push(`surface escaped viewport ${JSON.stringify(common.targetRect)}`);

        if(scenario.kind==='desktop'){
          if(common.sidebarDisplay==='none'||common.sidebarDisplay==='missing')failures.push('desktop sidebar not visible');
          if(common.navDisplay!=='none'&&common.navDisplay!=='missing')failures.push(`desktop mobile nav visible (${common.navDisplay})`);
        }else{
          if(common.sidebarDisplay!=='none')failures.push(`${scenario.kind} sidebar must be hidden, display=${common.sidebarDisplay}`);
          if(common.navDisplay==='none'||common.navDisplay==='missing')failures.push(`${scenario.kind} bottom nav missing`);
          if(common.navRect&&(common.navRect.left<-1||common.navRect.right>scenario.width+1||common.navRect.bottom>scenario.height+1))failures.push(`bottom nav outside viewport ${JSON.stringify(common.navRect)}`);
        }

        if(surface.name==='documents'){
          const metrics=await page.evaluate(()=>{
            const hero=document.querySelector('.ta-documents-header');
            const actions=document.querySelector('.ta-documents-header-actions');
            const tabs=document.querySelector('.ta-doc-type-tabs');
            const register=document.querySelector('.ta-doc-register-card');
            const r=node=>{const x=node?.getBoundingClientRect();return x?{left:x.left,right:x.right,top:x.top,bottom:x.bottom,width:x.width,height:x.height}:null;};
            return {
              hero:r(hero),actions:r(actions),tabs:r(tabs),register:r(register),
              tabButtons:Array.from(document.querySelectorAll('.ta-doc-type-tabs>button')).map(r),
              registerStyle:register?{background:getComputedStyle(register).backgroundColor,border:getComputedStyle(register).borderTopWidth,shadow:getComputedStyle(register).boxShadow}:null
            };
          });
          if(!(metrics.hero&&metrics.actions))failures.push('Documents hero/action metrics unavailable');
          else{
            const left=metrics.actions.left-metrics.hero.left;
            const right=metrics.hero.right-metrics.actions.right;
            if(Math.abs(left-right)>3)failures.push(`Documents create group not geometrically centered: left=${left.toFixed(1)} right=${right.toFixed(1)}`);
            if(metrics.actions.left<metrics.hero.left-1||metrics.actions.right>metrics.hero.right+1)failures.push('Documents create group escapes hero');
          }
          if(metrics.tabs){
            if(metrics.tabs.left<-1||metrics.tabs.right>scenario.width+1)failures.push(`Documents tabs escape viewport ${JSON.stringify(metrics.tabs)}`);
            metrics.tabButtons.forEach((button,index)=>{
              if(button&&(button.left<-1||button.right>scenario.width+1))failures.push(`Document filter ${index} half-visible/outside viewport ${JSON.stringify(button)}`);
            });
          }
          if(metrics.registerStyle){
            if(metrics.registerStyle.border!=='0px')failures.push(`Document register wrapper still has decorative border ${metrics.registerStyle.border}`);
            if(metrics.registerStyle.shadow!=='none')failures.push(`Document register wrapper still has shadow ${metrics.registerStyle.shadow}`);
          }
        }

        if(surface.name==='shell'&&scenario.kind!=='desktop'){
          const more=page.locator('.ta-mobile-nav button[aria-controls="ta-mobile-more"]');
          if(!(await more.isVisible()))failures.push('More trigger not visible');
          else{
            await more.click();
            const sheet=page.locator('#ta-mobile-more');
            await sheet.waitFor({state:'visible',timeout:3000}).catch(()=>{});
            if(!(await sheet.isVisible()))failures.push('More sheet did not open');
            else{
              const sheetMetrics=await page.evaluate(()=>{
                const sheet=document.querySelector('#ta-mobile-more');
                const sr=sheet.getBoundingClientRect();
                const targets=Array.from(sheet.querySelectorAll('button,a')).filter(node=>getComputedStyle(node).display!=='none').map(node=>{const r=node.getBoundingClientRect();return{height:r.height,width:r.width};});
                const groups=Array.from(sheet.querySelectorAll('.ta-sheet-group')).map(node=>({background:getComputedStyle(node).backgroundColor,borderRadius:getComputedStyle(node).borderRadius,shadow:getComputedStyle(node).boxShadow}));
                return{rect:{left:sr.left,right:sr.right,top:sr.top,bottom:sr.bottom},targets,groups};
              });
              if(sheetMetrics.rect.left<-1||sheetMetrics.rect.right>scenario.width+1||sheetMetrics.rect.top<-1||sheetMetrics.rect.bottom>scenario.height+1)failures.push(`More sheet outside viewport ${JSON.stringify(sheetMetrics.rect)}`);
              sheetMetrics.targets.forEach((target,index)=>{if(target.height<43.5)failures.push(`More touch target ${index} below 44px: ${target.height}`);});
              for(const [index,group] of sheetMetrics.groups.entries()){
                if(group.shadow!=='none')failures.push(`More group ${index} has nested shadow ${group.shadow}`);
              }
              await page.screenshot({path:`${output}/more-${scenario.name}.png`,fullPage:false});
            }
          }
        }

        await page.screenshot({path:`${output}/${surface.name}-${scenario.name}.png`,fullPage:surface.name!=='shell'});
        results.push({scenario:scenario.name,surface:surface.name,failures});
        await page.close();
      }
    }
  }finally{
    await browser.close();
  }

  writeFileSync(`${output}/results.json`,JSON.stringify(results,null,2));
  const failed=results.filter(item=>item.failures.length);
  if(failed.length){
    for(const item of failed)console.error(`${item.scenario}/${item.surface}:\n - ${item.failures.join('\n - ')}`);
    assert.fail(`${failed.length} visual-foundation scenario(s) failed. See ${output}/results.json and screenshots.`);
  }
  console.log(`LOUREX visual foundation QA passed: ${results.length} page/scenario checks + More-sheet evidence.`);
})().catch(error=>{console.error(error);process.exitCode=1;});
