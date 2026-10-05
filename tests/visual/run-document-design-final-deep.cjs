const {chromium,webkit}=require('playwright');
const assert=require('node:assert/strict');
const {mkdirSync,writeFileSync}=require('node:fs');
const path=require('node:path');

const base='http://127.0.0.1:4173/tests/visual/template-visual-qa.html';
const output=path.resolve('visual-qa-output/document-design-final-deep');
mkdirSync(output,{recursive:true});

const cases=[
  {name:'executive-custom-small',template:'executive',language:'en',items:'10',mode:'desktop',palette:'custom',textScale:'small',fonts:'custom',expectTemplate:'executive',expectTone:'light',expectPrimary:'#17212b'},
  {name:'executive-custom-large',template:'executive',language:'en',items:'10',mode:'desktop',palette:'custom',textScale:'large',fonts:'custom',expectTemplate:'executive',expectTone:'light',expectPrimary:'#17212b'},
  {name:'obsidian-custom-unsafe-ar',template:'obsidian',language:'ar',items:'10',mode:'desktop',palette:'custom',textScale:'large',fonts:'custom',unsafeColors:'true',expectTemplate:'obsidian',expectTone:'dark',expectPrimary:'#f5f1e9',expectSecondary:'#aeb5ba'},
  {name:'carbon-custom-bilingual',template:'carbon',language:'bilingual',items:'10',mode:'desktop',palette:'custom',textScale:'small',fonts:'custom',expectTemplate:'carbon',expectTone:'light',expectPrimary:'#17212b'},
  {name:'midnight-custom-unsafe',template:'midnight',language:'en',items:'10',mode:'desktop',palette:'custom',textScale:'normal',unsafeColors:'true',expectTemplate:'midnight',expectTone:'light',expectPrimary:'#17212b',expectSecondary:'#4d5b68'},
  {name:'legacy-template-fallback',legacyTemplate:'removed-template',language:'en',items:'4',mode:'desktop',palette:'auto',textScale:'normal',expectTemplate:'executive',expectTone:'light',expectPrimary:'#17212b'}
];

const hex=value=>String(value||'').trim().toLowerCase();
function urlFor(testCase){const q={...testCase};for(const key of ['name','expectTemplate','expectTone','expectPrimary','expectSecondary'])delete q[key];return `${base}?${new URLSearchParams(q)}`;}

async function inspect(page,testCase){
  await page.goto(urlFor(testCase),{waitUntil:'networkidle'});
  await page.waitForFunction(()=>document.documentElement.dataset.ready==='true');
  await page.waitForFunction(()=>document.querySelector('.invoice-pages')?.dataset.paginationReady==='true');
  await page.evaluate(()=>document.fonts?.ready);
  const metrics=await page.evaluate(()=>{
    const sheet=document.querySelector('.invoice-page');
    const pages=document.querySelector('.invoice-pages');
    const tableCell=sheet?.querySelector('.items-table tbody td');
    const title=sheet?.querySelector('.doc-title span,.doc-title .doc-title-primary-ar');
    const termLabel=sheet?.querySelector('.terms-block .term-row>b');
    const termValue=sheet?.querySelector('.terms-block .term-row>span');
    const partyName=sheet?.querySelector('.party-block .party-name');
    const signatureMedia=sheet?.querySelector('.signature-media');
    const signature=sheet?.querySelector('.signature-image');
    const stamp=sheet?.querySelector('.stamp-image');
    const css=sheet?getComputedStyle(sheet):null;
    const box=sheet?.getBoundingClientRect();
    return{
      ready:pages?.dataset.paginationReady||'',
      template:sheet?.dataset.template||'',tone:sheet?.dataset.tone||'',palette:sheet?.dataset.palette||'',
      direction:sheet?getComputedStyle(sheet).direction:'',
      primary:css?.getPropertyValue('--lrx-primary').trim()||'',secondary:css?.getPropertyValue('--lrx-secondary').trim()||'',heading:css?.getPropertyValue('--lrx-heading').trim()||'',accent:css?.getPropertyValue('--accent').trim()||'',
      latin:css?.getPropertyValue('--font-latin').trim()||'',arabic:css?.getPropertyValue('--font-arabic').trim()||'',
      tableSize:tableCell?parseFloat(getComputedStyle(tableCell).fontSize):0,titleSize:title?parseFloat(getComputedStyle(title).fontSize):0,
      termLabelColor:termLabel?getComputedStyle(termLabel).color:'',termValueColor:termValue?getComputedStyle(termValue).color:'',partyNameColor:partyName?getComputedStyle(partyName).color:'',
      signatureSurface:signatureMedia?getComputedStyle(signatureMedia).backgroundColor:'',signatureFilter:signature?getComputedStyle(signature).filter:'',stampFilter:stamp?getComputedStyle(stamp).filter:'',
      headerExecutive:Boolean(sheet?.querySelector('.header-executive')),
      pageCount:document.querySelectorAll('.invoice-page').length,
      width:box?.width||0,height:box?.height||0,
      overflow:sheet?{x:sheet.scrollWidth-sheet.clientWidth,y:sheet.scrollHeight-sheet.clientHeight}:{x:999,y:999},
      error:document.querySelector('.qa-error')?.textContent||''
    };
  });
  await page.locator('.invoice-page').first().screenshot({path:path.join(output,`${testCase.name}.png`)});
  return metrics;
}

(async()=>{
  const results=[];
  for(const [engine,type] of [['chromium',chromium],['webkit',webkit]]){
    const browser=await type.launch({headless:true});
    try{
      const page=await browser.newPage({viewport:{width:1440,height:1280}});
      for(const testCase of cases){
        const metrics=await inspect(page,testCase);
        const label=`${engine}/${testCase.name}`;
        assert.equal(metrics.error,'',`${label}: fixture error`);
        assert.equal(metrics.ready,'true',`${label}: pagination not ready`);
        assert.equal(metrics.template,testCase.expectTemplate,`${label}: normalized template`);
        assert.equal(metrics.tone,testCase.expectTone,`${label}: document tone`);
        assert.equal(metrics.palette,testCase.palette,`${label}: palette`);
        assert.equal(hex(metrics.primary),testCase.expectPrimary,`${label}: primary ink`);
        if(testCase.expectSecondary)assert.equal(hex(metrics.secondary),testCase.expectSecondary,`${label}: secondary ink`);
        assert.ok(metrics.pageCount>=1,`${label}: no pages`);
        assert.ok(metrics.overflow.x<=2&&metrics.overflow.y<=2,`${label}: A4 overflow ${JSON.stringify(metrics.overflow)}`);
        if(testCase.language==='ar')assert.equal(metrics.direction,'rtl',`${label}: RTL direction`);
        if(testCase.fonts==='custom'){
          assert.match(metrics.latin,/Montserrat/i,`${label}: Latin font token`);
          assert.match(metrics.arabic,/Cairo/i,`${label}: Arabic font token`);
        }
        if(testCase.name==='obsidian-custom-unsafe-ar'){
          assert.equal(metrics.signatureSurface,'rgb(255, 255, 255)',`${label}: signature surface must stay light for preview/PDF parity`);
          assert.equal(metrics.signatureFilter,'none',`${label}: signature must not depend on a CSS-only recolor`);
          assert.ok(!/invert\(/i.test(metrics.stampFilter),`${label}: stamp must preserve source color`);
        }
        if(testCase.name==='legacy-template-fallback')assert.equal(metrics.headerExecutive,true,`${label}: Executive fallback header missing`);
        results.push({engine,...testCase,...metrics});
      }
    }finally{await browser.close();}
  }
  for(const engine of ['chromium','webkit']){
    const small=results.find(row=>row.engine===engine&&row.name==='executive-custom-small');
    const large=results.find(row=>row.engine===engine&&row.name==='executive-custom-large');
    assert.ok(small&&large,`${engine}: size comparison cases missing`);
    assert.ok(large.tableSize>small.tableSize,`${engine}: table Small/Large did not change (${small.tableSize} -> ${large.tableSize})`);
    assert.ok(large.titleSize>small.titleSize,`${engine}: title Small/Large did not change (${small.titleSize} -> ${large.titleSize})`);
  }
  writeFileSync(path.join(output,'report.json'),JSON.stringify({caseCount:results.length,results},null,2));
  console.log(`Final document design browser QA passed: ${results.length} cases.`);
})().catch(error=>{console.error(error);process.exit(1);});
