const {webkit}=require('playwright');

const BASE=process.env.LOUREX_VISUAL_BASE_URL||'http://127.0.0.1:4173';
const desktopSafariUa='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15';

(async()=>{
  const failures=[];
  const browser=await webkit.launch({headless:true});
  const context=await browser.newContext({
    viewport:{width:1194,height:834},
    userAgent:desktopSafariUa,
    hasTouch:true
  });
  await context.addInitScript(()=>{
    try{Object.defineProperty(Navigator.prototype,'platform',{configurable:true,get:()=> 'MacIntel'});}catch{}
    try{Object.defineProperty(Navigator.prototype,'maxTouchPoints',{configurable:true,get:()=>5});}catch{}
  });
  const page=await context.newPage();
  const runtimeErrors=[];
  page.on('pageerror',error=>runtimeErrors.push(String(error?.message||error)));

  const url=`${BASE}/tests/visual/obsidian-draft-editor.html?lang=en&v=339`;
  await page.goto(url,{waitUntil:'networkidle'});
  await page.waitForSelector('.draft-studio.editor-screen',{timeout:10_000});
  await page.waitForTimeout(350);

  const initialUrl=page.url();
  const initial=await page.evaluate(()=>{
    const main=document.querySelector('.ta-shell.screen-editor>.ta-main,.ta-shell.is-editor>.ta-main,.screen-editor .ta-main');
    const preview=document.querySelector('.draft-studio-preview');
    const layout=document.querySelector('.draft-studio-layout');
    const nested=document.querySelector('.draft-studio-scroll');
    const guard=window.__LOUREX_EDITOR_STABILITY_V338__;
    const style=element=>element?getComputedStyle(element):null;
    return {
      width:window.innerWidth,
      platform:navigator.platform,
      touchPoints:navigator.maxTouchPoints,
      appleMobile:Boolean(guard?.appleMobile),
      rootFlag:document.documentElement.dataset.lourexIosWebkit||'',
      editorMarker:document.documentElement.hasAttribute('data-lourex-document-editor'),
      previewDisplay:style(preview)?.display||'missing',
      layoutDisplay:style(layout)?.display||'missing',
      nestedOverflow:style(nested)?.overflowY||'missing',
      mainOverflow:style(main)?.overflowY||'missing',
      mainClientHeight:main?.clientHeight||0,
      mainScrollHeight:main?.scrollHeight||0
    };
  });

  if(initial.width!==1194)failures.push(`landscape width=${initial.width}, expected 1194`);
  if(initial.platform!=='MacIntel'||initial.touchPoints<=1)failures.push(`desktop-UA iPad navigator mismatch ${initial.platform}/${initial.touchPoints}`);
  if(!initial.appleMobile||initial.rootFlag!=='true')failures.push(`iPad stability marker missing: apple=${initial.appleMobile}, root=${initial.rootFlag||'missing'}`);
  if(!initial.editorMarker)failures.push('Draft editor root marker missing');
  if(initial.previewDisplay!=='none')failures.push(`Draft live preview visible on iPad landscape: ${initial.previewDisplay}`);
  if(initial.layoutDisplay!=='block')failures.push(`Draft landscape layout is not single-column block: ${initial.layoutDisplay}`);
  if(initial.nestedOverflow!=='visible')failures.push(`nested Draft scroller still owns overflow: ${initial.nestedOverflow}`);
  if(!['auto','scroll'].includes(initial.mainOverflow))failures.push(`outer .ta-main is not the scroll owner: ${initial.mainOverflow}`);
  if(initial.mainScrollHeight<=initial.mainClientHeight)failures.push(`Draft fixture does not expose a real outer scroll range: ${initial.mainScrollHeight}/${initial.mainClientHeight}`);

  await page.evaluate(()=>{
    const main=document.querySelector('.ta-shell.screen-editor>.ta-main,.ta-shell.is-editor>.ta-main,.screen-editor .ta-main');
    if(main)main.scrollTop=main.scrollHeight;
  });
  await page.waitForTimeout(300);

  const after=await page.evaluate(()=>{
    const main=document.querySelector('.ta-shell.screen-editor>.ta-main,.ta-shell.is-editor>.ta-main,.screen-editor .ta-main');
    const lastBlock=document.querySelector('#qa-block-16');
    const rect=lastBlock?.getBoundingClientRect();
    return {
      editorPresent:Boolean(document.querySelector('.draft-studio.editor-screen')),
      scrollTop:main?.scrollTop||0,
      maxScroll:main?Math.max(0,main.scrollHeight-main.clientHeight):0,
      lastBlockBottom:rect?.bottom||0,
      viewportHeight:window.innerHeight
    };
  });

  if(!after.editorPresent)failures.push('Draft editor disappeared after landscape scroll');
  if(after.maxScroll>8&&after.scrollTop<after.maxScroll-8)failures.push(`outer scroll did not reach end: ${after.scrollTop}/${after.maxScroll}`);
  if(page.url()!==initialUrl)failures.push(`URL changed during Draft landscape scroll: ${initialUrl} -> ${page.url()}`);
  if(runtimeErrors.length)failures.push(...runtimeErrors.map(error=>`pageerror: ${error}`));

  await context.close();
  await browser.close();

  if(failures.length){
    console.error(failures.join('\n'));
    process.exit(1);
  }
  console.log('v339 iPad landscape Draft: 1194x834 Desktop-UA WebKit single-scroll stability passed.');
})().catch(error=>{console.error(error);process.exit(1);});
