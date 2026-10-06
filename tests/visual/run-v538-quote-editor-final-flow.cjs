const {webkit}=require('playwright');
const assert=require('node:assert/strict');
const {mkdirSync,writeFileSync}=require('node:fs');

const output='visual-qa-output/v538-quote-editor-final-flow';
const baseUrl='http://127.0.0.1:4173/tests/visual/v538-quote-editor-final-flow.html';
const cases=[
  {name:'iphone-390x844',width:390,height:844,isMobile:true,platform:'iPhone',maxTouchPoints:5,userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'},
  {name:'ipad-820x1180',width:820,height:1180,isMobile:false,platform:'MacIntel',maxTouchPoints:5,userAgent:'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'},
  {name:'ipad-1024x1366',width:1024,height:1366,isMobile:false,platform:'MacIntel',maxTouchPoints:5,userAgent:'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'}
];

async function lifecycle(browser,scenario){
  const context=await browser.newContext({viewport:{width:scenario.width,height:scenario.height},hasTouch:true,isMobile:scenario.isMobile,userAgent:scenario.userAgent});
  await context.addInitScript(({platform,maxTouchPoints})=>{
    try{Object.defineProperty(navigator,'platform',{configurable:true,get:()=>platform});}catch{}
    try{Object.defineProperty(navigator,'maxTouchPoints',{configurable:true,get:()=>maxTouchPoints});}catch{}
  },scenario);
  const page=await context.newPage();
  const pageErrors=[];page.on('pageerror',error=>pageErrors.push(String(error)));
  await page.goto(baseUrl,{waitUntil:'networkidle'});
  await page.locator('.editor-screen').waitFor({state:'visible'});
  const initialHref=page.url();
  const numberInput=page.locator('.editor-form-lock > .editor-section').first().locator('input').first();

  // The live editor must expose the exact VAT amount before the user reaches output.
  const editorTotals=page.locator('.editor-totals');
  await editorTotals.waitFor({state:'visible'});
  assert.match(await editorTotals.innerText(),/30\.00\s+USD/,scenario.name+': subtotal is not visible/correct in editor totals');
  assert.match(await editorTotals.innerText(),/Tax \/ VAT 15%/,scenario.name+': 15% VAT label is not visible in editor totals');
  assert.match(await editorTotals.innerText(),/4\.50\s+USD/,scenario.name+': 15% VAT amount is not 4.50 in editor totals');
  assert.match(await editorTotals.innerText(),/34\.50\s+USD/,scenario.name+': grand total is not 34.50 in editor totals');

  const previewButton=page.locator('button:visible').filter({hasText:/^Preview$/}).first();
  await previewButton.click();
  const previewTotals=page.locator('.mobile-preview-stage .totals-block');
  await previewTotals.waitFor({state:'visible'});
  const previewText=await previewTotals.innerText();
  assert.match(previewText,/30\.00\s+USD/,scenario.name+': preview subtotal drifted from editor');
  assert.match(previewText,/Tax 15%/,scenario.name+': preview VAT label drifted from editor');
  assert.match(previewText,/4\.50\s+USD/,scenario.name+': preview VAT amount drifted from editor');
  assert.match(previewText,/34\.50\s+USD/,scenario.name+': preview grand total drifted from editor');
  await page.locator('.mobile-preview-overlay button[aria-label="Close"]').click();

  // Opening the quote alone must never trigger an automatic write.
  await page.waitForTimeout(1650);
  assert.equal(await page.evaluate(()=>window.saveAttempts),0,`${scenario.name}: editor mount performed an implicit save`);

  // Sustained edits must debounce into one autosave and keep the editor mounted.
  for(const value of ['PI-2026-0538-A','PI-2026-0538-B','PI-2026-0538-C']){
    await numberInput.fill(value);await page.waitForTimeout(90);
  }
  await page.waitForFunction(()=>Number(window.saveAttempts)>=1,null,{timeout:7000});
  await page.waitForFunction(()=>Number(window.activeSaves)===0,null,{timeout:5000});
  await page.waitForTimeout(1550);
  let state=await page.evaluate(()=>({saveAttempts:Number(window.saveAttempts),maxConcurrent:Number(window.maxConcurrentSaves),closeCount:Number(window.closeCount),editor:Boolean(document.querySelector('.editor-screen'))}));
  assert.equal(state.saveAttempts,1,`${scenario.name}: sustained edits produced ${state.saveAttempts} saves instead of one debounced autosave`);
  assert.equal(state.maxConcurrent,1,`${scenario.name}: sustained edits overlapped save operations`);
  assert.equal(state.closeCount,0,`${scenario.name}: editor close fired during autosave`);
  assert.equal(state.editor,true,`${scenario.name}: editor disappeared during sustained edits`);
  assert.equal(await numberInput.inputValue(),'PI-2026-0538-C',`${scenario.name}: latest sustained edit was lost`);
  assert.equal(page.url(),initialHref,`${scenario.name}: autosave changed location`);

  // Reproduce an iOS app-hide lifecycle while a fresh edit is still dirty.
  await numberInput.fill('PI-2026-0538-D');
  await page.evaluate(()=>{
    window.__qaVisibility='hidden';
    try{Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>window.__qaVisibility});}catch{}
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('pagehide'));
  });
  await page.waitForFunction(()=>Number(window.saveAttempts)>=2,null,{timeout:5000});
  await page.waitForFunction(()=>Number(window.activeSaves)===0,null,{timeout:5000});
  await page.waitForTimeout(220);
  state=await page.evaluate(()=>({saveAttempts:Number(window.saveAttempts),maxConcurrent:Number(window.maxConcurrentSaves),closeCount:Number(window.closeCount),events:window.saveEvents,editor:Boolean(document.querySelector('.editor-screen'))}));
  assert.equal(state.saveAttempts,2,`${scenario.name}: app hide/pagehide produced duplicate saves: ${JSON.stringify(state.events)}`);
  assert.equal(state.maxConcurrent,1,`${scenario.name}: app hide/pagehide produced parallel saves`);
  assert.equal(state.closeCount,0,`${scenario.name}: app hide closed the editor`);
  assert.equal(state.editor,true,`${scenario.name}: editor disappeared on app hide`);

  await page.evaluate(()=>{
    window.__qaVisibility='visible';
    window.dispatchEvent(new Event('pageshow'));
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.locator('.editor-screen').waitFor({state:'visible'});
  assert.equal(await numberInput.inputValue(),'PI-2026-0538-D',`${scenario.name}: app return lost the dirty checkpoint`);
  assert.equal(page.url(),initialHref,`${scenario.name}: app return changed location`);

  // Editing must remain live after returning from the background.
  await numberInput.fill('PI-2026-0538-E');
  await page.waitForFunction(()=>Number(window.saveAttempts)>=3,null,{timeout:7000});
  await page.waitForFunction(()=>Number(window.activeSaves)===0,null,{timeout:5000});
  await page.waitForTimeout(1550);
  state=await page.evaluate(()=>({saveAttempts:Number(window.saveAttempts),maxConcurrent:Number(window.maxConcurrentSaves),editor:Boolean(document.querySelector('.editor-screen'))}));
  assert.equal(state.saveAttempts,3,`${scenario.name}: post-return edit did not settle to one autosave`);
  assert.equal(state.maxConcurrent,1,`${scenario.name}: post-return autosave overlapped another write`);
  assert.equal(state.editor,true,`${scenario.name}: editor disappeared after returning and editing`);
  assert.equal(await numberInput.inputValue(),'PI-2026-0538-E',`${scenario.name}: post-return edit was lost`);

  // PDF from a draft intentionally finalizes the exact version. After output resolves,
  // the same editor instance must remain available rather than navigating/reloading.
  const pdf=page.locator('button:visible').filter({hasText:/^PDF$/}).first();
  await pdf.waitFor({state:'visible'});await pdf.click();
  const confirm=page.getByRole('button',{name:/Confirm, Issue & PDF|Continue to PDF/}).first();
  await confirm.waitFor({state:'visible'});await confirm.click();
  await page.waitForFunction(()=>Array.isArray(window.printEvents)&&window.printEvents.length===1,null,{timeout:7000});
  await page.waitForFunction(()=>Number(window.activeSaves)===0,null,{timeout:5000});
  await page.locator('.editor-screen').waitFor({state:'visible'});
  await page.locator('.final-lock-banner').waitFor({state:'visible'});
  await page.waitForFunction(()=>document.querySelectorAll('.modal-backdrop').length===0,null,{timeout:5000});

  const finalState=await page.evaluate(()=>({
    saveAttempts:Number(window.saveAttempts),maxConcurrent:Number(window.maxConcurrentSaves),closeCount:Number(window.closeCount),
    printEvents:window.printEvents,preparePdfModes:window.preparePdfModes,editor:Boolean(document.querySelector('.editor-screen')),
    printPortal:Boolean(document.querySelector('.qa-print-portal')),scrollWidth:document.documentElement.scrollWidth,viewport:innerWidth
  }));
  assert.equal(finalState.saveAttempts,4,`${scenario.name}: PDF finalization produced unexpected saves`);
  assert.equal(finalState.maxConcurrent,1,`${scenario.name}: PDF finalization overlapped another save`);
  assert.equal(finalState.closeCount,0,`${scenario.name}: PDF output closed the editor`);
  assert.equal(finalState.editor,true,`${scenario.name}: editor missing after PDF`);
  assert.equal(finalState.printPortal,false,`${scenario.name}: temporary PDF portal remained mounted`);
  assert.equal(finalState.printEvents[0]?.mode,'pdf',`${scenario.name}: PDF action did not reach the PDF output path`);
  assert.equal(finalState.printEvents[0]?.number,'PI-2026-0538-E',`${scenario.name}: PDF used a stale quote snapshot`);
  assert.equal(finalState.printEvents[0]?.status,'final',`${scenario.name}: PDF did not receive the finalized quote`);
  assert.deepEqual(finalState.printEvents[0]?.totals,{subtotal:'30.00',discount:'0.00',shipping:'0.00',otherCharges:'0.00',tax:'4.50',grandTotal:'34.50'},`${scenario.name}: PDF handoff totals drifted from the reviewed 15% VAT values`);
  assert.ok(finalState.preparePdfModes.includes('pdf'),`${scenario.name}: PDF preparation mode was never announced`);
  assert.ok(finalState.scrollWidth<=finalState.viewport+1,`${scenario.name}: final editor flow introduced horizontal overflow`);
  assert.equal(page.url(),initialHref,`${scenario.name}: PDF output navigated away from the editor`);
  assert.deepEqual(pageErrors,[],`${scenario.name}: page errors during lifecycle flow`);

  const screenshot=`${output}/${scenario.name}.png`;
  await page.screenshot({path:screenshot,fullPage:false,animations:'disabled'});
  const result={name:scenario.name,saveAttempts:finalState.saveAttempts,maxConcurrent:finalState.maxConcurrent,printEvents:finalState.printEvents,preparePdfModes:finalState.preparePdfModes,screenshot};
  await context.close();return result;
}

(async()=>{
  mkdirSync(output,{recursive:true});
  const browser=await webkit.launch({headless:true});
  try{
    const results=[];
    for(const scenario of cases)results.push(await lifecycle(browser,scenario));
    writeFileSync(`${output}/report.json`,JSON.stringify(results,null,2));
    console.log('Final quote editor lifecycle PASS: sustained edits -> autosave -> app hide/pagehide -> return -> continue editing -> PDF -> editor, across iPhone/iPad WebKit.');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
