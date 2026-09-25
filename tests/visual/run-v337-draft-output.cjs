const {chromium,webkit}=require('playwright');
const assert=require('node:assert/strict');
const {mkdirSync,writeFileSync}=require('node:fs');
const path=require('node:path');

const output=path.resolve('visual-qa-output/v337-draft-output');
mkdirSync(output,{recursive:true});
const base='http://127.0.0.1:4173/tests/visual/v337-draft-output.html';
const variants=[
  {name:'plain-accent-company',page:'plain',header:'accent',footer:'company',width:'comfortable'},
  {name:'ruled-classic-minimal',page:'ruled',header:'classic',footer:'minimal',width:'narrow'},
  {name:'grid-minimal-none',page:'grid',header:'minimal',footer:'none',width:'wide'},
];
const engines=[['chromium',chromium],['webkit',webkit]];

function urlFor(lang,variant){
  const query=new URLSearchParams({lang,page:variant.page,header:variant.header,footer:variant.footer,width:variant.width});
  return `${base}?${query.toString()}`;
}

async function inspect(page,variant,lang){
  return page.evaluate(({variant,lang})=>{
    const visible=el=>{if(!el)return false;const r=el.getBoundingClientRect(),s=getComputedStyle(el);return s.display!=='none'&&s.visibility!=='hidden'&&r.width>0&&r.height>0;};
    const rect=el=>{if(!el)return null;const r=el.getBoundingClientRect();return{left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};};
    const pages=[...document.querySelectorAll('.draft-letter-page')];
    const violations=[];
    const pageMetrics=[];
    for(const [index,sheet] of pages.entries()){
      const sr=rect(sheet);
      const style=getComputedStyle(sheet);
      const header=sheet.querySelector('.letterhead-header');
      const body=sheet.querySelector('.letter-page-body');
      const footer=sheet.querySelector('.letterhead-footer');
      const hr=rect(header),br=rect(body),fr=rect(footer);
      if(Math.abs(sr.width-793.7)>5)violations.push(`page ${index+1}: A4 width ${sr.width.toFixed(1)}px`);
      if(Math.abs(sr.height-1122.5)>5)violations.push(`page ${index+1}: A4 height ${sr.height.toFixed(1)}px`);
      if(style.display!=='grid')violations.push(`page ${index+1}: display=${style.display}, expected grid`);
      if(style.gridTemplateRows==='none')violations.push(`page ${index+1}: grid-template-rows missing`);
      for(const [name,r] of [['header',hr],['body',br],['footer',fr]]){
        if(!r){violations.push(`page ${index+1}: missing ${name}`);continue;}
        if(r.left<sr.left-1||r.right>sr.right+1||r.top<sr.top-1||r.bottom>sr.bottom+1)violations.push(`page ${index+1}: ${name} outside A4`);
      }
      if(hr&&br&&br.top<hr.bottom-1)violations.push(`page ${index+1}: body overlaps header`);
      if(br&&fr&&br.bottom>fr.top+1)violations.push(`page ${index+1}: body overlaps footer`);
      if(body instanceof HTMLElement&&body.scrollHeight>body.clientHeight+2)violations.push(`page ${index+1}: body vertical overflow ${body.scrollHeight-body.clientHeight}px`);
      if(body instanceof HTMLElement&&body.scrollWidth>body.clientWidth+2)violations.push(`page ${index+1}: body horizontal overflow ${body.scrollWidth-body.clientWidth}px`);
      for(const block of sheet.querySelectorAll('.letter-block')){
        if(!visible(block))continue;
        const r=rect(block);
        if(r.left<sr.left-1||r.right>sr.right+1||r.top<sr.top-1||r.bottom>sr.bottom+1)violations.push(`page ${index+1}: letter block outside A4`);
        if(fr&&r.bottom>fr.top+1)violations.push(`page ${index+1}: letter block crosses footer`);
      }
      const signing=sheet.querySelector('.letter-signing');
      if(signing&&visible(signing)){
        const r=rect(signing);
        if(r.left<sr.left-1||r.right>sr.right+1||r.top<sr.top-1||r.bottom>sr.bottom+1)violations.push(`page ${index+1}: signing area outside A4`);
        if(fr&&r.bottom>fr.top+1)violations.push(`page ${index+1}: signing area crosses footer`);
        for(const image of signing.querySelectorAll('img')){const ir=rect(image);if(ir&&fr&&ir.bottom>fr.top+1)violations.push(`page ${index+1}: signature/stamp image crosses footer`);}
      }
      const watermark=sheet.querySelector('.document-custom-watermark');
      if(!watermark||!visible(watermark))violations.push(`page ${index+1}: watermark missing`);
      else{
        const wr=rect(watermark),ws=getComputedStyle(watermark);
        if(ws.position!=='absolute')violations.push(`page ${index+1}: watermark position=${ws.position}`);
        if(ws.pointerEvents!=='none')violations.push(`page ${index+1}: watermark pointer-events=${ws.pointerEvents}`);
        if(!watermark.classList.contains('is-repeat')||ws.display!=='grid')violations.push(`page ${index+1}: repeat watermark grid contract missing`);
        if(wr.left<sr.left-1||wr.right>sr.right+1||wr.top<sr.top-1||wr.bottom>sr.bottom+1)violations.push(`page ${index+1}: watermark outside A4`);
      }
      pageMetrics.push({sheet:sr,header:hr,body:br,footer:fr,bodyPaddingLeft:body?parseFloat(getComputedStyle(body).paddingLeft)||0:null});
    }
    const first=pages[0];
    const firstBody=first?.querySelector('.letter-page-body');
    const firstFooter=first?.querySelector('.letterhead-footer');
    const firstFooterSpan=firstFooter?.querySelector('span');
    const firstBodyStyle=firstBody?getComputedStyle(firstBody):null;
    const firstFooterStyle=firstFooter?getComputedStyle(firstFooter):null;
    const expectedDir=lang==='ar'?'rtl':'ltr';
    if(first&&getComputedStyle(first).direction!==expectedDir)violations.push(`page direction ${getComputedStyle(first).direction}, expected ${expectedDir}`);
    const backgroundImage=firstBodyStyle?.backgroundImage||'none';
    if(variant.page==='plain'&&backgroundImage!=='none')violations.push(`plain page background-image=${backgroundImage}`);
    if(variant.page!=='plain'&&backgroundImage==='none')violations.push(`${variant.page} page background image missing`);
    const paddingLeft=firstBodyStyle?parseFloat(firstBodyStyle.paddingLeft)||0:0;
    if(variant.width==='narrow'&&paddingLeft<88)violations.push(`narrow body padding ${paddingLeft}px`);
    if(variant.width==='comfortable'&&(paddingLeft<54||paddingLeft>70))violations.push(`comfortable body padding ${paddingLeft}px`);
    if(variant.width==='wide'&&(paddingLeft<36||paddingLeft>49))violations.push(`wide body padding ${paddingLeft}px`);
    if(variant.footer==='minimal'&&firstFooterSpan&&getComputedStyle(firstFooterSpan).display!=='none')violations.push('minimal footer company text is visible');
    if(variant.footer==='none'&&firstFooterStyle&&parseFloat(firstFooterStyle.borderTopWidth)>0.2)violations.push(`none footer border=${firstFooterStyle.borderTopWidth}`);
    if(variant.footer==='company'&&(!firstFooterSpan||!visible(firstFooterSpan)))violations.push('company footer text missing');
    const totalBlocks=document.querySelectorAll('.letter-block').length;
    const signingCount=document.querySelectorAll('.letter-signing').length;
    return {violations,pageCount:pages.length,totalBlocks,signingCount,pageMetrics,backgroundImage,paddingLeft,dir:first?getComputedStyle(first).direction:null};
  },{variant,lang});
}

async function runCase(engineName,browserType,lang,variant){
  const browser=await browserType.launch({headless:true});
  try{
    const context=await browser.newContext({viewport:{width:1440,height:1280}});
    const page=await context.newPage();
    const failures=[];
    page.on('pageerror',error=>failures.push(`pageerror: ${String(error)}`));
    page.on('console',message=>{if(message.type()==='error')failures.push(`console: ${message.text()}`);});
    await page.goto(urlFor(lang,variant),{waitUntil:'networkidle',timeout:30000});
    await page.waitForFunction(()=>document.documentElement.dataset.ready==='true');
    await page.evaluate(()=>document.fonts?.ready);
    const screen=await inspect(page,variant,lang);
    failures.push(...screen.violations.map(item=>`screen: ${item}`));
    if(screen.pageCount<2)failures.push(`screen: expected multi-page Draft, found ${screen.pageCount}`);
    if(screen.totalBlocks<15)failures.push(`screen: expected long Draft block set, found ${screen.totalBlocks}`);
    if(screen.signingCount!==1)failures.push(`screen: expected signing area on final page only, found ${screen.signingCount}`);
    const shot=path.join(output,`${engineName}-${lang}-${variant.name}.png`);
    await page.locator('.draft-letter-page').first().screenshot({path:shot});

    await page.emulateMedia({media:'print'});
    await page.waitForTimeout(40);
    const print=await inspect(page,variant,lang);
    failures.push(...print.violations.map(item=>`print: ${item}`));
    if(print.pageCount!==screen.pageCount)failures.push(`print page count ${print.pageCount} differs from screen ${screen.pageCount}`);
    await context.close();
    return{engine:engineName,lang,variant:variant.name,screen:{pageCount:screen.pageCount,totalBlocks:screen.totalBlocks,signingCount:screen.signingCount},print:{pageCount:print.pageCount},failures,screenshot:shot};
  }finally{await browser.close();}
}

(async()=>{
  const rows=[];
  for(const [engineName,browserType] of engines){
    for(const lang of ['en','ar']){
      for(const variant of variants)rows.push(await runCase(engineName,browserType,lang,variant));
    }
  }
  writeFileSync(path.join(output,'report.json'),JSON.stringify(rows,null,2));
  const failures=rows.flatMap(row=>row.failures.map(failure=>`${row.engine}/${row.lang}/${row.variant}: ${failure}`));
  assert.equal(failures.length,0,failures.join('\n'));
  console.log(`v337 Draft A4 output: ${rows.length} Chromium/WebKit EN/AR variant cases passed in screen and print media.`);
})().catch(error=>{console.error(error);process.exitCode=1;});
