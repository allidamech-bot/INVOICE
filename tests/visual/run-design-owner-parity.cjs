// Compare two compiled owners through their original URLs so font resolution is identical.
const {chromium}=require('playwright');
const {readFileSync,mkdirSync,writeFileSync}=require('node:fs');
const assert=require('node:assert/strict');
const before=process.env.LOUREX_PARITY_BASELINE;
if(!before)throw new Error('LOUREX_PARITY_BASELINE must name the baseline CSS prefix');
const output='visual-qa-output/design-owner-parity';
const surfaces=[
  ['documents','v483-documents-density.html',[320,390,820,1024,1440]],
  ['dashboard','obsidian-dashboard.html',[390,1440]],
  ['editor','obsidian-editor.html',[320,820,1440]],
  ['settings','obsidian-settings.html?scope=settings',[390,1024]],
  ['finance','obsidian-financial.html?screen=receivables',[320,820,1440]],
  ['more','obsidian-shell.html',[320,390,820]]
];
const properties=['display','position','color','backgroundColor','backgroundImage','fontFamily','fontSize','fontWeight','lineHeight','paddingTop','paddingRight','paddingBottom','paddingLeft','gap','borderRadius','borderColor','boxShadow','minHeight','maxHeight','zIndex'];
(async()=>{
  mkdirSync(output,{recursive:true});
  const browser=await chromium.launch({headless:true});const report=[];
  try{
    let index=0;
    for(const [surface,file,widths] of surfaces)for(const width of widths){
      const lang=index%2?'en':'ar',theme=index%2?'light':'dark';index++;
      const snapshots=[];
      for(const phase of ['before','after']){
        const page=await browser.newPage({viewport:{width,height:900}});
        await page.route('**/styles/app.bundle.css*',route=>route.fulfill({contentType:'text/css',body:readFileSync(phase==='before'?`${before}-bundle.css`:'dist/styles/app.bundle.css','utf8')}));
        await page.route('**/styles/v482-mobile-ux-repair.css*',route=>route.fulfill({contentType:'text/css',body:readFileSync(phase==='before'?`${before}-standalone.css`:'dist/styles/v482-mobile-ux-repair.css','utf8')}));
        await page.goto(`http://127.0.0.1:4173/tests/visual/${file}${file.includes('?')?'&':'?'}lang=${lang}`,{waitUntil:'networkidle'});
        await page.evaluate(async({theme,lang})=>{
          document.documentElement.dataset.uiTheme=theme;
          document.documentElement.dataset.uiThemePreference=theme;
          if(window.renderDocumentsDensity)window.renderDocumentsDensity(lang);
          for(const href of ['styles/v331-draft-scroll-recovery.css','styles/v332-critical-documents-deep-closeout.css','styles/v482-mobile-ux-repair.css']){
            const link=document.createElement('link');link.rel='stylesheet';link.href=href;document.head.append(link);
            await new Promise(resolve=>{link.onload=resolve;link.onerror=resolve;});
          }
          const style=document.createElement('style');style.textContent='html body #root#root#root *,html body #root#root#root *::before,html body #root#root#root *::after{animation:none!important;transition:none!important}';document.head.append(style);
          await document.fonts.ready;
        },{theme,lang});
        if(surface==='more')await page.locator('.ta-mobile-nav button[aria-controls="ta-mobile-more"]').click();
        await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
        snapshots.push(await page.evaluate(properties=>[...document.querySelectorAll('#root *')].flatMap(el=>{
          const r=el.getBoundingClientRect(),s=getComputedStyle(el);
          if(!r.width||!r.height||s.visibility==='hidden'||s.display==='none'||el.tagName==='SVG'||el.closest('svg'))return [];
          return [{tag:el.tagName,classes:el.className,rect:[r.x,r.y,r.width,r.height].map(v=>Math.round(v*10)/10),style:Object.fromEntries(properties.map(p=>[p,p==='boxShadow'&&s[p].includes('rgba(')&&!s[p].replace(/rgba\([^)]*, 0\)/g,'').includes('rgb')?'none':s[p]]))}];
        }),properties));
        await page.screenshot({path:`${output}/${surface}-${width}-${lang}-${theme}-${phase}.png`,animations:'disabled'});
        await page.close();
      }
      try{assert.deepEqual(snapshots[1],snapshots[0]);}catch(e){writeFileSync(`${output}/difference-${surface}-${width}.json`,JSON.stringify(snapshots,null,2));throw new Error(`${surface} ${width} ${lang} ${theme}: visible computed styles/geometry differ; see difference JSON`);}
      report.push({surface,width,lang,theme,visibleElements:snapshots[0].length,parity:'PASS'});
    }
  }finally{await browser.close();}
  writeFileSync(`${output}/report.json`,JSON.stringify(report,null,2));
  console.log(`Design owner parity: ${report.length} representative cases PASS.`);
})().catch(e=>{console.error(e);process.exitCode=1;});
