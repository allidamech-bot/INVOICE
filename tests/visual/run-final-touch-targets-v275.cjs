const {chromium}=require('playwright');
const assert=require('node:assert/strict');

const base='http://127.0.0.1:4173/tests/visual';
const cases=[
  {page:'obsidian-shell.html',selectors:[['.shell-account-button',44,44]]},
  {page:'obsidian-dashboard.html',selectors:[
    ['.dashboard-attention-list>button',0,44],
    ['.command-chart-controls>button',0,44],
    ['.command-chart-mode>button',0,44],
    ['.command-position-action',0,44],
    ['.lourex-advisor-starters>button',0,44],
    ['.lourex-advisor-compose form>button',44,44]
  ]},
  {page:'obsidian-documents.html',selectors:[['.documents-register-tabs>button',0,44],['.documents-filter-toggle',0,44]]},
  {page:'obsidian-editor.html?kind=invoice',selectors:[['.editor-section-nav-button',0,44],['.item-advanced-control>button',0,44],['.mobile-action-buttons .btn span',0,0,10]]},
  {page:'obsidian-directory.html?screen=customers',selectors:[['.customers-page .page-heading>.btn',0,44],['.customer-document-action',0,44],['.customer-actions .icon-btn',44,44]]},
  {page:'obsidian-financial.html?screen=reports',selectors:[['.reports-heading-actions .btn',0,44],['.reports-presets>button',0,44,12]]},
  {page:'obsidian-financial.html?screen=operations',selectors:[['.operations-tabs>button',0,44,11],['.operations-page .danger-link',44,44]]}
];

(async()=>{
  const browser=await chromium.launch({headless:true});
  const failures=[];
  let checks=0;
  try{
    for(const lang of ['en','ar'])for(const scenario of cases){
      const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
      const separator=scenario.page.includes('?')?'&':'?';
      await page.goto(`${base}/${scenario.page}${separator}lang=${lang}`,{waitUntil:'load'});
      await page.evaluate(()=>document.fonts.ready);
      for(const [selector,minWidth,minHeight,minFont=0] of scenario.selectors){
        const metrics=await page.locator(selector).evaluateAll(elements=>elements.flatMap(element=>{
          const style=getComputedStyle(element),rect=element.getBoundingClientRect();
          if(style.display==='none'||style.visibility==='hidden'||!rect.width||!rect.height)return [];
          return [{text:(element.textContent||element.getAttribute('aria-label')||'').trim(),width:rect.width,height:rect.height,fontSize:parseFloat(style.fontSize)}];
        }));
        if(!metrics.length)failures.push(`${lang}/${scenario.page}: no visible ${selector}`);
        for(const metric of metrics){
          checks+=1;
          if(minWidth&&metric.width<minWidth-.25)failures.push(`${lang}/${scenario.page} ${selector}: ${metric.width}px wide (${metric.text})`);
          if(minHeight&&metric.height<minHeight-.25)failures.push(`${lang}/${scenario.page} ${selector}: ${metric.height}px high (${metric.text})`);
          if(minFont&&metric.fontSize<minFont)failures.push(`${lang}/${scenario.page} ${selector}: ${metric.fontSize}px text (${metric.text})`);
        }
      }
      await page.close();
    }
  }finally{await browser.close();}
  assert.equal(failures.length,0,failures.join('\n'));
  console.log(`Final touch targets v275: ${checks} mobile EN/AR controls passed.`);
})().catch(error=>{console.error(error);process.exitCode=1;});
