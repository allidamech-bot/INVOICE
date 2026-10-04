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
    const layout=document.querySelector('.editor-layout');
    const editorPane=document.querySelector('.editor-pane');
    const previewPane=document.querySelector('.preview-pane,.editor-preview-pane');
    const style=scroll?getComputedStyle(scroll):null;
    const rect=node=>{const box=node?.getBoundingClientRect();return box?{width:box.width,height:box.height,left:box.left,right:box.right}:null;};
    return {
      width:innerWidth,height:innerHeight,
      platform:navigator.platform,touchPoints:navigator.maxTouchPoints,
      iosMarker:document.documentElement.dataset.lourexIosWebkit||'',
      editorMarker:document.documentElement.hasAttribute('data-lourex-document-editor'),
      overflowY:style?.overflowY||'missing',
      clientHeight:scroll?.clientHeight||0,
      scrollHeight:scroll?.scrollHeight||0,
      previewChildren:document.querySelector('.preview-stage')?.childElementCount??-1,
      previewDisplay:previewPane?getComputedStyle(previewPane).display:'missing',
      layoutDisplay:layout?getComputedStyle(layout).display:'missing',
      layout:rect(layout),editorPane:rect(editorPane),previewPane:rect(previewPane)
    };
  });
  if(initial.width!==1194||initial.height!==834)failures.push(`viewport=${initial.width}x${initial.height}, expected 1194x834`);
  if(initial.platform!=='MacIntel'||initial.touchPoints<=1)failures.push(`desktop-UA iPad navigator mismatch ${initial.platform}/${initial.touchPoints}`);
  if(initial.iosMarker!=='true')failures.push(`iPad root marker=${initial.iosMarker||'missing'}, expected true`);
  if(!initial.editorMarker)failures.push('commercial editor marker missing');
  if(!['auto','scroll'].includes(initial.overflowY))failures.push(`commercial editor scroll owner overflow-y=${initial.overflowY}`);
  if(initial.scrollHeight<=initial.clientHeight)failures.push(`commercial editor fixture has no real scroll range ${initial.scrollHeight}/${initial.clientHeight}`);
  if(initial.previewChildren!==0)failures.push(`live A4 renderer remained mounted on iPad landscape (${initial.previewChildren} child nodes)`);
  if(initial.previewDisplay!=='none')failures.push(`iPad commercial preview still reserves a dead desktop track (display=${initial.previewDisplay})`);
  if(initial.layoutDisplay!=='block')failures.push(`iPad commercial editor layout=${initial.layoutDisplay}, expected single-column block`);
  if(!initial.editorPane||initial.editorPane.width<1150)failures.push(`iPad commercial editor pane collapsed to ${initial.editorPane?.width??0}px instead of full workspace`);

  const textInput=page.locator('.editor-scroll input[type="text"],.editor-scroll input:not([type])').first();
  if(await textInput.count()){
    const before=await textInput.inputValue();
    await textInput.fill(`${before} QA`);
    // iPad WebKit intentionally uses a longer autosave delay to reduce encrypted
    // vault-write pressure. Poll the observable save event rather than relying on a
    // narrow fixed sleep that becomes flaky under loaded CI runners.
    try{
      await page.waitForFunction(()=>Number(window.saveAttempts||0)>=1,undefined,{timeout:4500});
    }catch{
      failures.push('commercial editor typing did not autosave on iPad landscape');
    }
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
      scrollBottom:sr?.bottom??null,
      previewDisplay:getComputedStyle(document.querySelector('.preview-pane,.editor-preview-pane')).display,
      editorWidth:document.querySelector('.editor-pane')?.getBoundingClientRect().width||0
    };
  });
  if(!after.editorPresent)failures.push('commercial editor disappeared after end-scroll');
  if(after.maxScroll>8&&after.scrollTop<after.maxScroll-8)failures.push(`commercial editor did not reach scroll end ${after.scrollTop}/${after.maxScroll}`);
  if(after.targetBottom===null||after.scrollBottom===null)failures.push('attachments end target missing');
  else if(after.targetBottom>after.scrollBottom+4)failures.push(`attachments section remains clipped below scroll viewport ${after.targetBottom}/${after.scrollBottom}`);
  if(after.previewDisplay!=='none')failures.push(`iPad preview track returned after editing (${after.previewDisplay})`);
  if(after.editorWidth<1150)failures.push(`iPad editor narrowed after editing (${after.editorWidth}px)`);
  if(page.url()!==initialUrl)failures.push(`URL changed during commercial edit/scroll: ${initialUrl} -> ${page.url()}`);
  if(runtimeErrors.length)failures.push(...runtimeErrors.map(error=>`pageerror: ${error}`));

  await context.close();
  return{kind,failures};
}

async function runDesktopGeometry(browser,width){
  const failures=[];
  const context=await browser.newContext({viewport:{width,height:900},userAgent:desktopSafariUa,hasTouch:false});
  await context.addInitScript(()=>{
    try{Object.defineProperty(Navigator.prototype,'platform',{configurable:true,get:()=> 'MacIntel'});}catch{}
    try{Object.defineProperty(Navigator.prototype,'maxTouchPoints',{configurable:true,get:()=>0});}catch{}
  });
  const page=await context.newPage();
  const runtimeErrors=[];
  page.on('pageerror',error=>runtimeErrors.push(String(error?.message||error)));
  await page.goto(`${BASE}/tests/visual/obsidian-editor.html?lang=en&kind=proforma&v=519-desktop-${width}`,{waitUntil:'networkidle'});
  await page.waitForSelector('.editor-screen .editor-layout',{timeout:10_000});
  await page.waitForTimeout(250);
  const metrics=await page.evaluate(()=>{
    const layout=document.querySelector('.editor-layout');
    const editor=document.querySelector('.editor-pane');
    const preview=document.querySelector('.preview-pane,.editor-preview-pane');
    const pages=document.querySelector('.preview-stage>.invoice-pages');
    const a4=document.querySelector('.preview-stage .invoice-page');
    const rect=node=>{const r=node?.getBoundingClientRect();return r?{width:r.width,height:r.height,left:r.left,right:r.right}:null;};
    return {
      iosMarker:document.documentElement.dataset.lourexIosWebkit||'',
      layout:rect(layout),editor:rect(editor),preview:rect(preview),pages:rect(pages),a4:rect(a4),
      previewDisplay:preview?getComputedStyle(preview).display:'missing',
      layoutDisplay:layout?getComputedStyle(layout).display:'missing',
      pageWidth:a4?parseFloat(getComputedStyle(a4).width):0,
      pagesWidth:pages?parseFloat(getComputedStyle(pages).width):0,
      docScrollWidth:document.documentElement.scrollWidth,
      viewportWidth:innerWidth
    };
  });
  if(metrics.iosMarker==='true')failures.push(`desktop control incorrectly received iOS marker at ${width}px`);
  if(metrics.layoutDisplay!=='grid')failures.push(`desktop layout=${metrics.layoutDisplay}, expected grid at ${width}px`);
  if(metrics.previewDisplay==='none')failures.push(`desktop preview hidden at ${width}px`);
  if(!metrics.editor||metrics.editor.width<515)failures.push(`desktop editor collapsed to ${metrics.editor?.width??0}px at ${width}px`);
  if(!metrics.preview||metrics.preview.width<515)failures.push(`desktop preview collapsed to ${metrics.preview?.width??0}px at ${width}px`);
  if(!metrics.a4||metrics.a4.width<635||metrics.a4.width>670)failures.push(`desktop transformed A4 width=${metrics.a4?.width??0}px at ${width}px; expected ~651px`);
  if(metrics.pageWidth<790)failures.push(`desktop A4 physical width relaid out to ${metrics.pageWidth}px at ${width}px`);
  if(metrics.pagesWidth<790)failures.push(`desktop invoice-pages root shrank to ${metrics.pagesWidth}px at ${width}px`);
  if(metrics.docScrollWidth>metrics.viewportWidth+2)failures.push(`desktop document overflow ${metrics.docScrollWidth}px > ${metrics.viewportWidth}px at ${width}px`);
  if(runtimeErrors.length)failures.push(...runtimeErrors.map(error=>`pageerror: ${error}`));
  await context.close();
  return{kind:`desktop-${width}`,failures};
}

(async()=>{
  const browser=await webkit.launch({headless:true});
  try{
    const rows=[];
    for(const kind of ['invoice','proforma'])rows.push(await runCase(browser,kind));
    rows.push(await runDesktopGeometry(browser,1366));
    rows.push(await runDesktopGeometry(browser,1440));
    const failures=rows.flatMap(row=>row.failures.map(failure=>`${row.kind}: ${failure}`));
    if(failures.length){console.error(failures.join('\n'));process.exit(1);}
    console.log('v519 commercial editor geometry: iPad single-column + desktop Quotation A4 split passed in WebKit.');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
