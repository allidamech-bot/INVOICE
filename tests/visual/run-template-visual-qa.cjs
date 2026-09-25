const { chromium,webkit }=require('playwright');
const { mkdir,writeFile }=require('node:fs/promises');
const path=require('node:path');

const baseUrl=process.env.LOUREX_QA_URL||'http://127.0.0.1:4173/tests/visual/template-visual-qa.html';
const outputDir=path.resolve(process.argv[2]||'visual-qa-output');
const templates=['executive','minimal','trade','signature','obsidian','cobalt','editorial','split','prism','slate','horizon','mono','aurora','ledger','noir','midnight','blackivory','carbon'];

function caseUrl(testCase){
  const query=new URLSearchParams(testCase).toString();
  return `${baseUrl}?${query}`;
}

async function inspectPage(page,testCase){
  await page.goto(caseUrl(testCase),{waitUntil:'networkidle'});
  await page.waitForFunction(()=>document.documentElement.dataset.ready==='true');
  await page.evaluate(()=>document.fonts?.ready);
  return page.evaluate(()=>{
    const rect=(element)=>{const r=element.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};};
    const pages=[...document.querySelectorAll('.invoice-page')];
    const violations=[];
    let maxItemsToClosingGap=0;
    let maxClosingGap=0;
    let minFooterClearance=Number.POSITIVE_INFINITY;
    for(const [pageIndex,sheet] of pages.entries()){
      const bounds=rect(sheet);
      if(sheet.scrollHeight>sheet.clientHeight+2)violations.push(`page ${pageIndex+1}: vertical overflow ${sheet.scrollHeight-sheet.clientHeight}px`);
      if(sheet.scrollWidth>sheet.clientWidth+2)violations.push(`page ${pageIndex+1}: horizontal overflow ${sheet.scrollWidth-sheet.clientWidth}px`);
      for(const selector of ['.header-executive','.header-minimal','.header-trade','.header-signature','.header-modern','.continuation-header','.doc-body','.doc-footer','.party-grid','.items-wrap','.final-details','.totals-block','.bottom-grid','.signature-media']){
        for(const element of sheet.querySelectorAll(selector)){
          const r=rect(element);
          if(r.left<bounds.left-1||r.right>bounds.right+1||r.top<bounds.top-1||r.bottom>bounds.bottom+1)violations.push(`page ${pageIndex+1}: ${selector} outside A4`);
        }
      }
      const firstHeader=sheet.querySelector('.header-executive,.header-minimal,.header-trade,.header-signature,.header-modern');
      const parties=sheet.querySelector('.party-grid');
      if(firstHeader&&parties&&rect(parties).top<rect(firstHeader).bottom-1)violations.push(`page ${pageIndex+1}: header overlaps party block by ${Math.round(rect(firstHeader).bottom-rect(parties).top)}px`);
      for(const row of sheet.querySelectorAll('.items-table tr')){
        const r=rect(row);
        if(r.top<bounds.top-1||r.bottom>bounds.bottom+1)violations.push(`page ${pageIndex+1}: table row outside A4`);
      }
      const signature=sheet.querySelector('.signature-image');
      const stamp=sheet.querySelector('.stamp-image');
      if(signature&&stamp){
        const a=rect(signature),b=rect(stamp);
        const overlap=Math.min(a.right,b.right)-Math.max(a.left,b.left)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1;
        if(overlap)violations.push(`page ${pageIndex+1}: signature and stamp overlap`);
      }

      /* v337 regression: no auto-margin is allowed to reopen a dead zone between
         the item table and the commercial close. The close itself must then remain
         compact through totals/terms/notes/bank/signature. */
      const itemsWrap=sheet.querySelector('.items-wrap');
      const finalDetails=sheet.querySelector('.final-details');
      if(itemsWrap&&finalDetails){
        const gap=Math.max(0,rect(finalDetails).top-rect(itemsWrap).bottom);
        maxItemsToClosingGap=Math.max(maxItemsToClosingGap,gap);
        if(gap>48)violations.push(`page ${pageIndex+1}: item table and commercial close split by ${Math.round(gap)}px`);
      }

      const bottom=sheet.querySelector('.bottom-grid');
      if(bottom){
        const previous=bottom.previousElementSibling;
        if(previous){
          const gap=Math.max(0,rect(bottom).top-rect(previous).bottom);
          maxClosingGap=Math.max(maxClosingGap,gap);
          if(gap>48)violations.push(`page ${pageIndex+1}: commercial closing zone split by ${Math.round(gap)}px`);
        }
        const footer=sheet.querySelector('.doc-footer');
        if(footer){
          const clearance=rect(footer).top-rect(bottom).bottom;
          minFooterClearance=Math.min(minFooterClearance,clearance);
          if(clearance<-1)violations.push(`page ${pageIndex+1}: closing zone overlaps footer by ${Math.round(Math.abs(clearance))}px`);
        }
      }
    }
    const first=pages[0];
    const seller=first?.querySelector('.party-seller');
    const customer=first?.querySelector('.party-customer');
    return {
      pageCount:pages.length,
      firstPageItemRowCount:first?.querySelectorAll('.items-table tbody tr').length||0,
      sheet:pages[0]?rect(pages[0]):null,
      direction:first?getComputedStyle(first).direction:null,
      sellerX:seller?rect(seller).left:null,
      customerX:customer?rect(customer).left:null,
      bilingualRtlCount:first?.querySelectorAll('[dir="rtl"]').length||0,
      grandTotalCount:document.querySelectorAll('.grand-total').length,
      maxItemsToClosingGap,
      maxClosingGap,
      minFooterClearance:Number.isFinite(minFooterClearance)?minFooterClearance:null,
      violations:[...new Set(violations)],
      consoleText:document.querySelector('.qa-error')?.textContent||''
    };
  });
}

async function browserSession(browserType,engineName,work){
  const browser=await browserType.launch({headless:true});
  try{
    const context=await browser.newContext({viewport:{width:1440,height:1280},deviceScaleFactor:1});
    const page=await context.newPage();
    const browserErrors=new Set();
    page.on('response',response=>{const status=response.status();if(status>=400)browserErrors.add(`HTTP ${status} ${response.url()}`);});
    page.on('console',message=>{if(message.type()!=='error')return;const text=message.text();if(/^Failed to load resource:/.test(text))return;const location=message.location();const source=location?.url?` @ ${location.url()}:${location.lineNumber??0}`:'';browserErrors.add(`${text}${source}`);});
    page.on('pageerror',error=>browserErrors.add(error.message));
    return await work(page,browserErrors,engineName);
  }finally{await browser.close();}
}

(async()=>{
  await mkdir(outputDir,{recursive:true});
  const results=[];
  const browserErrors=new Set();

  await browserSession(chromium,'chromium',async(page,errors,engine)=>{
    for(const language of ['en','ar']){
      for(const template of templates){
        const testCase={template,language,items:'10',mode:'desktop'};
        const metrics=await inspectPage(page,testCase);
        await page.locator('.invoice-page').first().screenshot({path:path.join(outputDir,`${language}-${template}.png`)});
        results.push({engine,...testCase,...metrics});
      }
    }
    for(const template of ['trade','signature','editorial','mono','midnight','carbon']){
      const testCase={template,language:'bilingual',items:'10',mode:'desktop'};
      const metrics=await inspectPage(page,testCase);
      await page.locator('.invoice-page').first().screenshot({path:path.join(outputDir,`bilingual-${template}.png`)});
      results.push({engine,...testCase,...metrics});
    }
    for(const items of ['1','28']){
      for(const template of templates){
        const testCase={template,language:'en',items,mode:'desktop'};
        results.push({engine,...testCase,...await inspectPage(page,testCase)});
      }
    }
    for(const mode of ['tablet','mobile']){
      const testCase={template:'midnight',language:'bilingual',items:'10',mode};
      const metrics=await inspectPage(page,testCase);
      await page.screenshot({path:path.join(outputDir,`${mode}-midnight-bilingual.png`),fullPage:true});
      results.push({engine,...testCase,...metrics});
    }
    const printCase={template:'midnight',language:'ar',items:'28',mode:'print'};
    const printMetrics=await inspectPage(page,printCase);
    await page.pdf({path:path.join(outputDir,'print-midnight-ar-28.pdf'),format:'A4',printBackground:true,preferCSSPageSize:true});
    results.push({engine,...printCase,...printMetrics});
    for(const error of errors)browserErrors.add(`chromium: ${error}`);
  });

  /* Safari/WebKit pass targets the exact high-risk sparse-document condition from
     production: all 18 template families, both primary languages, one item. */
  await browserSession(webkit,'webkit',async(page,errors,engine)=>{
    for(const language of ['en','ar'])for(const template of templates){
      const testCase={template,language,items:'1',mode:'desktop'};
      const metrics=await inspectPage(page,testCase);
      if(['executive','signature','midnight','carbon'].includes(template))await page.locator('.invoice-page').first().screenshot({path:path.join(outputDir,`webkit-${language}-${template}-sparse.png`)});
      results.push({engine,...testCase,...metrics});
    }
    for(const error of errors)browserErrors.add(`webkit: ${error}`);
  });

  const failures=[];
  for(const result of results){
    const label=`${result.engine}/${result.template}/${result.language}/${result.items}/${result.mode}`;
    if(result.consoleText)failures.push(`${label}: ${result.consoleText}`);
    if(result.violations.length)failures.push(...result.violations.map(item=>`${label}: ${item}`));
    if(!result.pageCount)failures.push(`${label}: no A4 pages rendered`);
    if(result.grandTotalCount!==1)failures.push(`${label}: expected one grand total, found ${result.grandTotalCount}`);
    if(result.mode==='desktop'&&result.sheet&&(Math.abs(result.sheet.width-650)>3||Math.abs(result.sheet.height-920)>3))failures.push(`${label}: unexpected scaled A4 size ${result.sheet.width}x${result.sheet.height}`);
    if(result.language==='ar'&&result.direction!=='rtl')failures.push(`${label}: computed direction is not RTL`);
    if(result.language==='ar'&&!(result.sellerX>result.customerX))failures.push(`${label}: seller/customer grid did not mirror`);
    if(result.language==='en'&&!(result.sellerX<result.customerX))failures.push(`${label}: seller/customer grid order is incorrect`);
    if(result.language==='bilingual'&&result.bilingualRtlCount<3)failures.push(`${label}: bilingual Arabic content is missing`);
    if(result.items==='10'&&result.mode==='desktop'&&(result.language==='en'||result.language==='ar')&&result.firstPageItemRowCount<4)failures.push(`${label}: first page wastes available A4 space (${result.firstPageItemRowCount} item rows)`);
    if(result.items==='10'&&result.mode==='desktop'&&result.language==='bilingual'&&result.firstPageItemRowCount<2)failures.push(`${label}: bilingual first page wastes available A4 space (${result.firstPageItemRowCount} item rows)`);
  }
  if(browserErrors.size)failures.push(...browserErrors);
  const report={baseUrl,outputDir,caseCount:results.length,failures,results};
  await writeFile(path.join(outputDir,'report.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({caseCount:results.length,failures:failures.length,outputDir},null,2));
  if(failures.length){console.error(failures.join('\n'));process.exitCode=1;}
})().catch(error=>{console.error(error);process.exitCode=1;});