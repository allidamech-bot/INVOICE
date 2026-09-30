const {webkit}=require('playwright');

const BASE=process.env.LOUREX_VISUAL_BASE_URL||'http://127.0.0.1:4173';

(async()=>{
  const failures=[];
  const browser=await webkit.launch({headless:true});
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const page=await context.newPage();
  page.on('pageerror',error=>failures.push(`pageerror: ${String(error?.message||error)}`));
  await page.goto(`${BASE}/tests/visual/obsidian-shell.html?lang=en&v=451-overlay`,{waitUntil:'load'});
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

  // v451: the mobile center action intentionally opens the canonical multi-domain
  // Global Search / Quick Create surface instead of the specialist document menu.
  // GlobalSearch owns its own backdrop/focus lifecycle, so AppShell's More/document
  // overlay dataset must remain unlocked and must not leak after an action.
  await page.evaluate(()=>{window.shellQa.newKind='';});
  const create=page.locator('.ta-mobile-create');
  await create.click();
  const quickCreate=page.locator('.global-search-panel');
  await quickCreate.waitFor({state:'visible'});
  await expectUnlocked('Global Quick Create open');

  const firstQuickAction=quickCreate.locator('.global-search-actions>button').first();
  await firstQuickAction.click();
  await page.waitForTimeout(60);
  const created=await page.evaluate(()=>window.shellQa.newKind||'');
  if(created!=='proforma')failures.push(`Global Quick Create dispatched ${created||'nothing'}, expected proforma`);
  if(await quickCreate.isVisible().catch(()=>false))failures.push('Global Quick Create remained visible after action');
  await expectUnlocked('Global Quick Create action');

  // Escape must also release GlobalSearch without leaving a shell-level lock.
  await create.click();
  await quickCreate.waitFor({state:'visible'});
  await page.keyboard.press('Escape');
  await quickCreate.waitFor({state:'hidden'}).catch(()=>{});
  await expectUnlocked('Global Quick Create escape');

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
  console.log('v451 WebKit shell overlays: More lock + Global Quick Create lifecycle release cleanly after close/action/navigation.');
})().catch(error=>{console.error(error);process.exit(1);});