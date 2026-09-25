const {chromium,webkit}=require('playwright');
const assert=require('node:assert/strict');
const {mkdirSync,writeFileSync}=require('node:fs');

const output='visual-qa-output/v337-shell-navigation';
const cases=[
  ['chromium-320',chromium,{width:320,height:700}],
  ['webkit-320',webkit,{width:320,height:700}],
  ['chromium-390',chromium,{width:390,height:844}],
  ['webkit-390',webkit,{width:390,height:844}]
];

async function runCase(name,browserType,viewport,lang){
  const browser=await browserType.launch({headless:true});
  try{
    const context=await browser.newContext({viewport,isMobile:true,hasTouch:true});
    const page=await context.newPage();
    const failures=[];
    page.on('pageerror',error=>failures.push(`pageerror: ${String(error)}`));
    await page.goto(`http://127.0.0.1:4173/tests/visual/obsidian-shell.html?lang=${lang}`,{waitUntil:'load'});
    await page.locator('.ta-mobile-nav').waitFor({state:'visible'});

    const navButtons=page.locator('.ta-mobile-nav>button');
    const navCount=await navButtons.count();
    if(navCount!==4)failures.push(`expected four direct mobile nav buttons around Create, found ${navCount}`);
    for(let i=0;i<navCount;i+=1){const box=await navButtons.nth(i).boundingBox();if(!box||box.height<43.5||box.width<43.5)failures.push(`mobile nav button ${i+1} below 44px: ${box?`${box.width}x${box.height}`:'missing'}`);}

    const clickDirect=async(index,expected)=>{
      await navButtons.nth(index).click();
      await page.waitForTimeout(30);
      const last=await page.evaluate(()=>window.shellQa.navigations.at(-1)||'');
      if(last!==expected)failures.push(`direct nav ${index} dispatched ${last||'nothing'}, expected ${expected}`);
    };
    await clickDirect(0,'home');
    await clickDirect(1,'documents');
    await clickDirect(2,'customers');

    const more=navButtons.nth(3);
    const openMore=async()=>{
      await more.click();
      const sheet=page.locator('#ta-mobile-more');
      await sheet.waitFor({state:'visible'});
      const probe=await sheet.evaluate(el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);const before=el.scrollTop,max=Math.max(0,el.scrollHeight-el.clientHeight);el.scrollTop=max;const after=el.scrollTop;el.scrollTop=before;return{top:r.top,bottom:r.bottom,height:r.height,overflowY:s.overflowY,max,after};});
      if(probe.top<0||probe.bottom>viewport.height+2)failures.push(`More sheet leaves viewport: ${JSON.stringify(probe)}`);
      if(probe.max>2&&!['auto','scroll'].includes(probe.overflowY))failures.push(`More sheet has hidden range ${probe.max}px but overflow-y=${probe.overflowY}`);
      if(probe.max>2&&probe.after<probe.max-2)failures.push(`More sheet cannot reach scroll end ${probe.after}/${probe.max}`);
      return sheet;
    };

    const sheetRoutes=[
      ['items','items'],
      ['operations','operations'],
      ['receivables','receivables'],
      ['reports','reports']
    ];
    for(const [screen,expected] of sheetRoutes){
      const sheet=await openMore();
      const button=sheet.locator(`button`).filter({has:page.locator('span.ta-sheet-link-copy strong')}).filter({hasText:screen==='items'?(lang==='ar'?'المنتجات والمخزون':'Products & Inventory'):screen==='operations'?(lang==='ar'?'المشتريات':'Purchasing'):screen==='receivables'?(lang==='ar'?'المالية':'Finance'):(lang==='ar'?'التقارير':'Reports')}).first();
      await button.click();
      await page.waitForTimeout(30);
      const last=await page.evaluate(()=>window.shellQa.navigations.at(-1)||'');
      if(last!==expected)failures.push(`More route ${screen} dispatched ${last||'nothing'}, expected ${expected}`);
      if(await page.locator('#ta-mobile-more').isVisible().catch(()=>false))failures.push(`More sheet remained open after ${screen}`);
    }

    let settingsBefore=await page.evaluate(()=>window.shellQa.settings);
    let sheet=await openMore();
    await sheet.locator('.ta-sheet-account').click();
    await page.waitForTimeout(30);
    let settingsAfter=await page.evaluate(()=>window.shellQa.settings);
    let scope=await page.evaluate(()=>sessionStorage.getItem('lourex-settings-scope'));
    if(settingsAfter!==settingsBefore+1)failures.push('Account entry did not invoke settings surface');
    if(scope!=='account')failures.push(`Account entry stored scope=${scope}`);

    settingsBefore=settingsAfter;
    sheet=await openMore();
    const settingsButton=sheet.locator('.ta-sheet-group').last().locator('.ta-sheet-link').first();
    await settingsButton.click();
    await page.waitForTimeout(30);
    settingsAfter=await page.evaluate(()=>window.shellQa.settings);
    scope=await page.evaluate(()=>sessionStorage.getItem('lourex-settings-scope'));
    if(settingsAfter!==settingsBefore+1)failures.push('Settings entry did not invoke settings surface');
    if(scope!=='settings')failures.push(`Settings entry stored scope=${scope}`);

    await page.evaluate(()=>{window.__qaSearchOpen=0;window.addEventListener('lourex-global-search-open',()=>{window.__qaSearchOpen+=1;},{once:false});});
    const search=page.locator('.ta-search-trigger');
    const searchBox=await search.boundingBox();
    if(!searchBox||searchBox.width<43.5||searchBox.height<43.5)failures.push(`Search trigger below 44px: ${searchBox?`${searchBox.width}x${searchBox.height}`:'missing'}`);
    await search.click();
    const searchCount=await page.evaluate(()=>window.__qaSearchOpen||0);
    if(searchCount!==1)failures.push(`Search trigger dispatched ${searchCount} open events`);

    const create=page.locator('.ta-mobile-create');
    const createBox=await create.boundingBox();
    if(!createBox||createBox.width<43.5||createBox.height<43.5)failures.push(`Create button below 44px: ${createBox?`${createBox.width}x${createBox.height}`:'missing'}`);

    const shot=`${output}/${name}-${lang}.png`;
    await page.screenshot({path:shot,fullPage:false});
    await context.close();
    return{name,lang,failures,screenshot:shot};
  }finally{await browser.close();}
}

(async()=>{
  mkdirSync(output,{recursive:true});
  const rows=[];
  for(const [name,browserType,viewport] of cases)for(const lang of ['en','ar'])rows.push(await runCase(name,browserType,viewport,lang));
  writeFileSync(`${output}/report.json`,JSON.stringify(rows,null,2));
  const failures=rows.flatMap(row=>row.failures.map(f=>`${row.name}/${row.lang}: ${f}`));
  assert.equal(failures.length,0,failures.join('\n'));
  console.log(`v337 shell navigation: ${rows.length} Chromium/WebKit mobile cases passed.`);
})().catch(error=>{console.error(error);process.exitCode=1;});