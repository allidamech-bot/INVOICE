const {webkit}=require('playwright');

const BASE=process.env.LOUREX_VISUAL_BASE_URL||'http://127.0.0.1:4173';

(async()=>{
  const failures=[];
  const browser=await webkit.launch({headless:true});
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const page=await context.newPage();
  page.on('pageerror',error=>failures.push(`pageerror: ${String(error?.message||error)}`));
  await page.goto(`${BASE}/tests/visual/obsidian-shell.html?lang=en&v=339-overlay`,{waitUntil:'load'});
  await page.waitForSelector('.ta-mobile-nav',{timeout:10_000});

  const lockState=()=>page.evaluate(()=>({
    root:document.documentElement.dataset.lourexShellOverlay||'',
    body:document.body.dataset.lourexShellOverlay||''
  }));
  const expectUnlocked=async(label)=>{
    await page.waitForTimeout(50);
    const state=await lockState();
    if(state.root||state.body)failures.push(`${label}: shell overlay lock leaked root=${state.root||'none'} body=${state.body||'none'}`);
  };
  const expectLocked=async(label)=>{
    await page.waitForTimeout(30);
    const state=await lockState();
    if(state.root!=='true'||state.body!=='true')failures.push(`${label}: shell overlay lock missing root=${state.root||'none'} body=${state.body||'none'}`);
  };

  await expectUnlocked('initial');

  const navButtons=page.locator('.ta-mobile-nav>button');
  const more=navButtons.nth(3);
  await more.click();
  await page.locator('#ta-mobile-more').waitFor({state:'visible'});
  await expectLocked('More open');
  await page.locator('#ta-mobile-more .ta-sheet-close').click();
  await page.locator('#ta-mobile-more').waitFor({state:'hidden'}).catch(()=>{});
  await expectUnlocked('More close button');

  const create=page.locator('.ta-mobile-create');
  await create.click();
  await page.locator('#ta-mobile-create-menu').waitFor({state:'visible'});
  await expectLocked('Create open');
  const firstCreate=page.locator('#ta-mobile-create-menu button[role="menuitem"]').first();
  await firstCreate.click();
  await page.waitForTimeout(60);
  if(await page.locator('#ta-mobile-create-menu').isVisible().catch(()=>false))failures.push('Create menu remained visible after action');
  await expectUnlocked('Create action');

  await more.click();
  const sheet=page.locator('#ta-mobile-more');
  await sheet.waitFor({state:'visible'});
  await expectLocked('More reopen');
  const itemsButton=sheet.locator('.ta-sheet-link').filter({hasText:'Products & Inventory'}).first();
  await itemsButton.click();
  await page.waitForTimeout(60);
  await expectUnlocked('More route navigation');

  await context.close();
  await browser.close();
  if(failures.length){console.error(failures.join('\n'));process.exit(1);}
  console.log('v339 WebKit shell overlays: More/Create locks are released after close/action/navigation.');
})().catch(error=>{console.error(error);process.exit(1);});