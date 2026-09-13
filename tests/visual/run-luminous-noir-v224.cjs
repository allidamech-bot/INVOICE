const {chromium}=require('playwright');
const {mkdirSync,writeFileSync}=require('node:fs');
const assert=require('node:assert/strict');

const output='visual-qa-output/luminous-noir-v224';
const cases=[
  {name:'auth-desktop-en',path:'premium-auth-gateway-v187.html?lang=en&mode=signin',viewport:{width:1440,height:1000},ready:'.auth-account-frame'},
  {name:'auth-phone-ar',path:'premium-auth-gateway-v187.html?lang=ar&mode=signin',viewport:{width:390,height:844},ready:'.auth-account-frame'},
  {name:'dashboard-desktop-en',path:'obsidian-dashboard.html?lang=en',viewport:{width:1440,height:1000},ready:'.dashboard-page'},
  {name:'dashboard-phone-ar',path:'obsidian-dashboard.html?lang=ar',viewport:{width:390,height:844},ready:'.dashboard-page'},
  {name:'dashboard-phone-en',path:'obsidian-dashboard.html?lang=en',viewport:{width:430,height:932},ready:'.dashboard-page'},
  {name:'documents-phone-ar',path:'obsidian-documents.html?lang=ar',viewport:{width:390,height:844},ready:'.documents-workspace-v2'},
  {name:'editor-phone-ar',path:'obsidian-editor.html?lang=ar&kind=proforma',viewport:{width:390,height:844},ready:'.editor-screen'},
  {name:'catalog-phone-en',path:'obsidian-directory.html?lang=en&screen=catalog',viewport:{width:430,height:932},ready:'.product-library-page'},
  {name:'reports-phone-ar',path:'obsidian-financial.html?lang=ar&screen=reports',viewport:{width:390,height:844},ready:'.reports-page'},
  {name:'settings-phone-en',path:'obsidian-settings.html?lang=en&scope=settings',viewport:{width:390,height:844},ready:'.settings-workspace-v2'},
  {name:'recovery-phone-ar',path:'obsidian-overlays.html?lang=ar&screen=recovery',viewport:{width:390,height:844},ready:'.app-recovery'}
];

function luminance([r,g,b]){
  const channels=[r,g,b].map(value=>{const x=value/255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4;});
  return channels[0]*.2126+channels[1]*.7152+channels[2]*.0722;
}

(async()=>{
  mkdirSync(output,{recursive:true});
  const browser=await chromium.launch({headless:true});
  const results=[];
  try{
    for(const scenario of cases){
      const page=await browser.newPage({viewport:scenario.viewport,hasTouch:scenario.viewport.width<=820,isMobile:scenario.viewport.width<=820});
      page.setDefaultTimeout(12000);
      const failures=[];
      page.on('pageerror',error=>failures.push(`pageerror: ${String(error)}`));
      try{
        await page.goto(`http://127.0.0.1:4173/tests/visual/${scenario.path}`,{waitUntil:'load'});
        await page.locator(scenario.ready).first().waitFor();
        await page.evaluate(()=>document.fonts.ready);
        await page.waitForTimeout(120);
        const state=await page.evaluate(()=>{
          const parse=color=>(color.match(/[\d.]+/g)||[]).slice(0,4).map(Number);
          const visible=element=>{const rect=element.getBoundingClientRect(),style=getComputedStyle(element);return rect.width>0&&rect.height>0&&rect.bottom>0&&rect.top<innerHeight&&style.display!=='none'&&style.visibility!=='hidden'&&Number(style.opacity)!==0;};
          const ignored=element=>Boolean(element.closest('.invoice-pages,.invoice-page,.template-mini,.brand-mark,.google-auth-mark,.toggle>span'));
          const light=[];
          for(const element of document.querySelectorAll('body *')){
            if(!visible(element)||ignored(element))continue;
            const rect=element.getBoundingClientRect(),style=getComputedStyle(element),rgba=parse(style.backgroundColor);
            if(rect.width*rect.height<1800||rgba.length<3||(rgba[3]!==undefined&&rgba[3]<.82))continue;
            const [r,g,b]=rgba;
            if(r>210&&g>210&&b>210)light.push(`${element.tagName}.${String(element.className).slice(0,100)} ${style.backgroundColor}`);
          }
          const root=document.querySelector('.app-ui,.auth-account-page');
          const rootStyle=root?getComputedStyle(root):null;
          const primary=[...document.querySelectorAll('.btn-primary,.premium-auth-primary,.mobile-create-button')].find(visible);
          const primaryStyle=primary?getComputedStyle(primary):null;
          return {
            light:[...new Set(light)],
            scrollWidth:document.documentElement.scrollWidth,
            viewport:innerWidth,
            rootBackground:rootStyle?.backgroundColor||'',
            accent:rootStyle?.getPropertyValue('--ds-accent').trim()||'',
            primary:primaryStyle?{background:primaryStyle.backgroundColor,image:primaryStyle.backgroundImage,color:primaryStyle.color}:null
          };
        });
        assert.ok(state.scrollWidth<=state.viewport+1,`horizontal overflow ${JSON.stringify(state)}`);
        assert.deepEqual(state.light,[],`large light surface leaked into the dark workspace: ${state.light.join(' | ')}`);
        const rootRgb=(state.rootBackground.match(/[\d.]+/g)||[]).slice(0,3).map(Number);
        assert.ok(rootRgb.length===3&&luminance(rootRgb)<.025,`root is not deep dark: ${state.rootBackground}`);
        if(scenario.name.startsWith('auth-')){
          assert.ok(state.primary&&state.primary.background==='rgb(83, 70, 216)',`auth primary is outside Luminous Noir: ${JSON.stringify(state.primary)}`);
        }else{
          assert.equal(state.accent,'#5346D8','workspace must expose the Luminous Noir accent token');
          if(state.primary)assert.equal(state.primary.background,'rgb(83, 70, 216)','visible primary must use the sapphire fallback');
        }
        if(state.primary)assert.notEqual(state.primary.image,'none','primary action must retain the luminous gradient');
        await page.screenshot({path:`${output}/${scenario.name}.png`,fullPage:true,animations:'disabled'});
      }catch(error){
        failures.push(error?.stack||String(error));
        await page.screenshot({path:`${output}/${scenario.name}-failure.png`,fullPage:true,animations:'disabled'}).catch(()=>{});
      }
      results.push({...scenario,failures});
      await page.close();
    }
  }finally{await browser.close();}
  writeFileSync(`${output}/report.json`,JSON.stringify(results,null,2));
  const failures=results.flatMap(result=>result.failures.map(failure=>`${result.name}: ${failure}`));
  assert.equal(failures.length,0,failures.join('\n'));
  console.log(`Luminous Noir v224: ${results.length} cross-workspace visual flows passed.`);
})().catch(error=>{console.error(error);process.exitCode=1;});
