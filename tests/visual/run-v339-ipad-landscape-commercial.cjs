const {webkit}=require('playwright');

const BASE=process.env.LOUREX_VISUAL_BASE_URL||'http://127.0.0.1:4173';
const desktopSafariUa='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15';

async function runCase(browser,kind){
  const failures=[];
  const context=await browser.newContext({viewport:{width:1194,height:834},userAgent:desktopSafariUa,hasTouch:true});
  await context.addInitScript(()=>{
    try{Object.defineProperty(Navigator.prototype,'platform',{configurable:true,get:()=> 'MacIntel'});}catch{}
    try{Object.defineProperty(Navigator.prototype,'maxTouchPoints',{configurable:true,get:()=>5});}catch{}
  });
  const page=await context.newPage();
  const runtimeErrors=[];
  page.on('pageerror',error=>runtimeErrors.push(String(error?.message||error)));
  const url=`${BASE}/tests/visual/obsidian-editor.html?lang=en&kind=${kind}&v=339-commercial`;
  await page.goto(url,{waitUntil:'networkidle'});
  await page.waitForSelector('.editor-screen .editor-scroll',{timeout:10_000});
  await page.waitForTimeout(250);
  const initialUrl=page.url();

  const initial=await page.evaluate(()=>{
    const scroll=document.querySelector('.editor-scroll');
    const style=scroll?getComputedStyle(scroll):null;
    return {
      width:innerWidth,height:innerHeight,
      platform:navigator.platform,touchPoints:navigator.maxTouchPoints,
      editorMarker:document.documentElement.hasAttribute('data-lourex-document-editor'),
      overflowY:style?.overflowY||'missing',
      clientHeight:scroll?.clientHeight||0,
      scrollHeight:scroll?.scrollHeight||0,
      previewChildren:document.querySelector('.preview-stage')?.childElementCount??-1
    };
  });
  if(initial.width!==1194||initial.height!==834)failures.push(`viewport=${initial.width}x${initial.height}, expected 1194x834`);
  if(initial.platform!=='MacIntel'||initial.touchPoints<=1)failures.push(`desktop-UA iPad navigator mismatch ${initial.platform}/${initial.touchPoints}`);
  if(!initial.editorMarker)failures.push('commercial editor marker missing');
  if(!['auto','scroll'].includes(initial.overflowY))failures.push(`commercial editor scroll owner overflow-y=${initial.overflowY}`);
  if(initial.scrollHeight<=initial.clientHeight)failures.push(`commercial editor fixture has no real scroll range ${initial.scrollHeight}/${initial.clientHeight}`);
  if(initial.previewChildren!==0)failures.push(`live A4 renderer remained mounted on iPad landscape (${initial.previewChildren} child nodes)`);

  const textInput=page.locator('.editor-scroll input[type="text"],.editor-scroll input:not([type])').first();
  if(await textInput.count()){
    const before=await textInput.inputValue();
    await textInput.fill(`${before} QA`);
    await page.waitForTimeout(1700);
    const saves=await page.evaluate(()=>Number(window.saveAttempts||0));
    if(saves<1)failures.push('commercial editor typing did not autosave on iPad landscape');
  }else failures.push('commercial editor text input missing');

  await page.evaluate(()=>{const scroll=document.querySelector('.editor-scroll');if(scroll)scroll.scrollTop=scroll.scrollHeight;});
  await page.waitForTimeout(250);
  const after=await page.evaluate(()=>{
    const scroll=document.querySelector('.editor-scroll');
    // TailAdmin's section navigator assigns runtime step IDs to direct editor
    // sections. The attachment section remains the same semantic/rendered section,
    // but its authored #document-attachments ID is replaced after mount. Target
    // the stable component class so this QA checks reachability rather than an
    // implementation-detail ID owned by the step navigator.
    const target=document.querySelector('.document-attachments-section');
    const sr=scroll?.getBoundingClientRect(),tr=target?.getBoundingClientRect();
    return {
      editorPresent:Boolean(document.querySelector('.editor-screen')),
      scrollTop:scroll?.scrollTop||0,
      maxScroll:scroll?Math.max(0,scroll.scrollHeight-scroll.clientHeight):0,
      targetBottom:tr?.bottom??null,
      scrollBottom:sr?.bottom??null
    };
  });
  if(!after.editorPresent)failures.push('commercial editor disappeared after end-scroll');
  if(after.maxScroll>8&&after.scrollTop<after.maxScroll-8)failures.push(`commercial editor did not reach scroll end ${after.scrollTop}/${after.maxScroll}`);
  if(after.targetBottom===null||after.scrollBottom===null)failures.push('attachments end target missing');
  else if(after.targetBottom>after.scrollBottom+4)failures.push(`attachments section remains clipped below scroll viewport ${after.targetBottom}/${after.scrollBottom}`);
  if(page.url()!==initialUrl)failures.push(`URL changed during commercial edit/scroll: ${initialUrl} -> ${page.url()}`);
  if(runtimeErrors.length)failures.push(...runtimeErrors.map(error=>`pageerror: ${error}`));

  await context.close();
  return{kind,failures};
}

(async()=>{
  const browser=await webkit.launch({headless:true});
  try{
    const rows=[];
    for(const kind of ['invoice','proforma'])rows.push(await runCase(browser,kind));
    const failures=rows.flatMap(row=>row.failures.map(failure=>`${row.kind}: ${failure}`));
    if(failures.length){console.error(failures.join('\n'));process.exit(1);}
    console.log('v339 iPad landscape commercial editors: Invoice + Quotation autosave and end-scroll passed at 1194x834.');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
