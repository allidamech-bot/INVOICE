const {chromium,webkit}=require('playwright');
const {mkdirSync,writeFileSync}=require('node:fs');
const assert=require('node:assert/strict');

const output='visual-qa-output/mobile-preview-fit-v241';
const engines=[['chromium',chromium],['webkit',webkit]];
const widths=[320,340,341,360,361,375,376,390];
const expectedScale=width=>width<=340?.38:width<=360?.405:width<=375?.43:.445;

(async()=>{
  mkdirSync(output,{recursive:true});
  const results=[];
  for(const [engineName,browserType] of engines){
    const browser=await browserType.launch({headless:true});
    try{
      for(const width of widths)for(const lang of ['en','ar'])for(const kind of ['invoice','proforma']){
        const viewport={width,height:760};
        const page=await browser.newPage({viewport,hasTouch:true,isMobile:true});
        page.setDefaultTimeout(12000);
        const failures=[];
        page.on('pageerror',error=>failures.push(error.stack||String(error)));
        try{
          await page.goto(`http://127.0.0.1:4173/tests/visual/obsidian-editor.html?lang=${lang}&kind=${kind}`,{waitUntil:'load'});
          await page.locator('.ta-editor-step-list>button').first().waitFor();
          await page.evaluate(()=>document.fonts.ready);
          await page.locator('.mobile-action-buttons .btn').nth(1).click();
          await page.locator('.mobile-preview-overlay').waitFor({state:'visible'});
          const geometry=await page.locator('.mobile-preview-stage').evaluate(stage=>{
            const paper=stage.querySelector('.invoice-page');
            if(!paper)return{error:'preview paper missing'};
            const stageRect=stage.getBoundingClientRect();
            const paperRect=paper.getBoundingClientRect();
            const authoredWidth=parseFloat(getComputedStyle(paper).width);
            const scale=paperRect.width/authoredWidth;
            const bottom=paper.querySelector('.bottom-grid');
            const previous=bottom?.previousElementSibling||null;
            const footer=paper.querySelector('.doc-footer');
            const br=bottom?.getBoundingClientRect()||null;
            const pr=previous?.getBoundingClientRect()||null;
            const fr=footer?.getBoundingClientRect()||null;
            const closingGap=br&&pr?Math.max(0,(br.top-pr.bottom)/scale):0;
            const footerClearance=br&&fr?(fr.top-br.bottom)/scale:null;
            const controls=[...document.querySelectorAll('.mobile-preview-overlay>header .btn,.mobile-preview-overlay>header .icon-btn')].filter(el=>getComputedStyle(el).display!=='none').map(el=>{const r=el.getBoundingClientRect();return{width:r.width,height:r.height};});
            return{
              stage:{left:stageRect.left,right:stageRect.right,width:stageRect.width},
              paper:{left:paperRect.left,right:paperRect.right,width:paperRect.width},
              authoredWidth,
              scale,
              closingGap,
              footerClearance,
              controls
            };
          });
          assert.equal(geometry.error,undefined,geometry.error);
          assert.ok(geometry.authoredWidth>790&&geometry.authoredWidth<797,'A4 layout width must remain physical 210mm: '+JSON.stringify(geometry));
          assert.ok(Math.abs(geometry.scale-expectedScale(width))<.008,'unexpected responsive preview scale: '+JSON.stringify({width,geometry}));
          assert.ok(geometry.paper.left>=geometry.stage.left-1.5,'A4 preview clips the left edge: '+JSON.stringify({width,geometry}));
          assert.ok(geometry.paper.right<=geometry.stage.right+1.5,'A4 preview clips the right edge: '+JSON.stringify({width,geometry}));
          assert.ok(geometry.paper.width<=geometry.stage.width-2,'A4 preview is not width-fit: '+JSON.stringify({width,geometry}));
          assert.ok(geometry.closingGap<=48,'commercial closing zone splits inside mobile preview: '+JSON.stringify({width,geometry}));
          if(geometry.footerClearance!==null)assert.ok(geometry.footerClearance>=-1,'commercial closing zone overlaps footer: '+JSON.stringify({width,geometry}));
          for(const [index,control] of geometry.controls.entries())assert.ok(control.width>=43.5&&control.height>=43.5,`preview control ${index+1} below 44px: ${JSON.stringify(control)}`);
          if(width===320&&kind==='proforma')await page.screenshot({path:`${output}/${engineName}-${width}-${lang}-${kind}.png`,animations:'disabled'});
        }catch(error){
          failures.push(String(error));
          await page.screenshot({path:`${output}/${engineName}-${width}-${lang}-${kind}-failure.png`,fullPage:true}).catch(()=>{});
        }
        results.push({engine:engineName,width,lang,kind,failures});
        await page.close();
      }
    }finally{
      await browser.close();
    }
  }
  writeFileSync(`${output}/report.json`,JSON.stringify(results,null,2));
  const failures=results.flatMap(result=>result.failures.map(failure=>`${result.engine}/${result.width}/${result.lang}/${result.kind}: ${failure}`));
  assert.equal(failures.length,0,failures.join('\n'));
  console.log(`Mobile preview v337: ${results.length} Chromium/WebKit phone/language/document cases passed with balanced closing zone and 44px actions.`);
})().catch(error=>{console.error(error);process.exitCode=1;});