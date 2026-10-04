const {chromium,webkit}=require('playwright');
const assert=require('node:assert/strict');
const {mkdirSync,writeFileSync}=require('node:fs');

const output='visual-qa-output/v337-create-center';
const cases=[
  ['chromium-320',chromium,{width:320,height:700,isMobile:true,hasTouch:true}],
  ['webkit-320',webkit,{width:320,height:700,isMobile:true,hasTouch:true}],
  ['chromium-390',chromium,{width:390,height:844,isMobile:true,hasTouch:true}],
  ['webkit-390',webkit,{width:390,height:844,isMobile:true,hasTouch:true}],
  ['webkit-ipad820',webkit,{width:820,height:1180,isMobile:true,hasTouch:true}],
  ['webkit-ipad1024-landscape',webkit,{width:1024,height:768,isMobile:false,hasTouch:true}],
  ['chromium-desktop',chromium,{width:1440,height:900,isMobile:false,hasTouch:false}]
];
const specialistKinds=['proforma','invoice','draft','proforma-invoice','rfq','purchase-order','delivery-note','payment-receipt'];
const mobileQuickActions=[
  {index:0,kind:'proforma'},
  {index:1,kind:'invoice'},
  {index:2,navigate:'customers'},
  {index:3,navigate:'items'},
  {index:4,navigate:'operations'},
  {index:5,navigate:'receivables'}
];

async function assertInsideViewport(locator,viewport,label,failures){
  const box=await locator.boundingBox();
  if(!box){failures.push(`${label} missing geometry`);return null;}
  const right=box.x+box.width,bottom=box.y+box.height;
  if(box.x<-2||right>viewport.width+2||box.y<-2||bottom>viewport.height+2)failures.push(`${label} leaves viewport: ${JSON.stringify({...box,right,bottom})}`);
  if(box.height<43.5)failures.push(`${label} touch target ${box.height.toFixed(1)}px`);
  return box;
}

async function assertQuickActionsReachable(panel,actions,viewport,failures){
  const scrollOwner=panel.locator('.global-search-start');
  const geometry=await scrollOwner.evaluate(el=>{
    const r=el.getBoundingClientRect(),s=getComputedStyle(el),before=el.scrollTop,max=Math.max(0,el.scrollHeight-el.clientHeight);
    el.scrollTop=max;
    const after=el.scrollTop;
    el.scrollTop=before;
    return{left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height,scrollHeight:el.scrollHeight,clientHeight:el.clientHeight,scrollWidth:el.scrollWidth,clientWidth:el.clientWidth,overflowY:s.overflowY,max,after};
  });
  if(geometry.left<-2||geometry.right>viewport.width+2||geometry.top<-2||geometry.bottom>viewport.height+2)failures.push(`Quick create scroll owner leaves viewport: ${JSON.stringify(geometry)}`);
  if(geometry.scrollWidth>geometry.clientWidth+2)failures.push(`Quick create has horizontal overflow ${geometry.scrollWidth}>${geometry.clientWidth}`);
  if(geometry.max>2&&!['auto','scroll'].includes(geometry.overflowY))failures.push(`Quick create hides ${geometry.max}px without vertical scrolling (${geometry.overflowY})`);
  if(geometry.max>2&&geometry.after<geometry.max-2)failures.push(`Quick create cannot reach scroll end ${geometry.after}/${geometry.max}`);

  const count=await actions.count();
  for(let index=0;index<count;index+=1){
    const target=actions.nth(index);
    await target.scrollIntoViewIfNeeded();
    await target.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const box=await assertInsideViewport(target,viewport,`quick action ${index+1}`,failures);
    if(!box)continue;
    const visible=await target.evaluate(el=>{
      const owner=el.closest('.global-search-start');
      if(!(owner instanceof HTMLElement))return null;
      const r=el.getBoundingClientRect(),o=owner.getBoundingClientRect();
      return{top:r.top,bottom:r.bottom,left:r.left,right:r.right,ownerTop:o.top,ownerBottom:o.bottom,ownerLeft:o.left,ownerRight:o.right};
    });
    if(!visible){failures.push(`quick action ${index+1} has no Quick Create scroll owner`);continue;}
    if(visible.top<visible.ownerTop-2||visible.bottom>visible.ownerBottom+2)failures.push(`quick action ${index+1} cannot be revealed inside Quick Create: ${JSON.stringify(visible)}`);
    if(visible.left<visible.ownerLeft-2||visible.right>visible.ownerRight+2)failures.push(`quick action ${index+1} escapes Quick Create horizontally: ${JSON.stringify(visible)}`);
  }
  await scrollOwner.evaluate(el=>{el.scrollTop=0;});
}

async function runMobileCreateQa(page,viewport,failures){
  const openQuickCreate=async()=>{
    await page.locator('.ta-mobile-create').click();
    const panel=page.locator('.global-search-panel');
    await panel.waitFor({state:'visible'});
    await assertInsideViewport(panel,viewport,'Global quick create',failures);
    const geometry=await panel.evaluate(el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return{left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height,scrollHeight:el.scrollHeight,clientHeight:el.clientHeight,overflowY:s.overflowY};});
    if(geometry.left<-2||geometry.right>viewport.width+2||geometry.top<-2||geometry.bottom>viewport.height+2)failures.push(`Global quick create leaves viewport: ${JSON.stringify(geometry)}`);
    const actions=panel.locator('.global-search-actions>button');
    const count=await actions.count();
    if(count!==7)failures.push(`expected 7 multi-domain quick-create actions, found ${count}`);
    await assertQuickActionsReachable(panel,actions,viewport,failures);
    return{panel,actions};
  };

  for(const action of mobileQuickActions){
    await page.evaluate(()=>{window.shellQa.newKind='';window.shellQa.navigations=[];});
    const {actions}=await openQuickCreate();
    const target=actions.nth(action.index);
    await target.scrollIntoViewIfNeeded();
    await target.click();
    await page.waitForTimeout(40);
    const state=await page.evaluate(()=>({newKind:window.shellQa.newKind,navigations:[...window.shellQa.navigations],searchOpen:Boolean(document.querySelector('.global-search-panel'))}));
    if(action.kind&&state.newKind!==action.kind)failures.push(`quick action ${action.index+1} dispatched ${state.newKind||'nothing'}, expected ${action.kind}`);
    if(action.navigate&&state.navigations.at(-1)!==action.navigate)failures.push(`quick action ${action.index+1} navigated to ${state.navigations.at(-1)||'nothing'}, expected ${action.navigate}`);
    if(state.searchOpen)failures.push(`quick action ${action.index+1} left Global quick create open`);
  }

  const {panel,actions}=await openQuickCreate();
  const paymentAction=actions.nth(6);
  await paymentAction.scrollIntoViewIfNeeded();
  await paymentAction.click();
  await page.waitForTimeout(30);
  const picker=panel.locator('.global-search-payment-picker');
  await picker.waitFor({state:'visible'});
  if(await picker.locator('.global-search-empty').count()!==1)failures.push('Record payment did not show a safe empty invoice picker in the empty fixture');
  const back=picker.locator('.global-search-back-button');
  await back.scrollIntoViewIfNeeded();
  await assertInsideViewport(back,viewport,'payment-picker back action',failures);
  await back.click();
  await panel.locator('.global-search-actions').waitFor({state:'visible'});
  await page.keyboard.press('Escape');
  await panel.waitFor({state:'detached'});
}

async function runDesktopCreateQa(page,viewport,failures){
  const openMenu=async()=>{
    await page.locator('.ta-create-button').click();
    const menu=page.locator('#ta-desktop-create-menu');
    await menu.waitFor({state:'visible'});
    const geometry=await menu.evaluate(el=>{
      const r=el.getBoundingClientRect(),s=getComputedStyle(el),before=el.scrollTop,max=Math.max(0,el.scrollHeight-el.clientHeight);
      el.scrollTop=max;const after=el.scrollTop;
      const last=el.querySelector('button[role="menuitem"]:last-of-type'),lr=last?.getBoundingClientRect()||null;
      el.scrollTop=before;
      return{left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height,scrollHeight:el.scrollHeight,clientHeight:el.clientHeight,overflowY:s.overflowY,max,after,lastReachable:!lr||lr.bottom<=r.bottom+2,lastBottom:lr?.bottom??null};
    });
    if(geometry.left<-2||geometry.right>viewport.width+2||geometry.top<-2||geometry.bottom>viewport.height+2)failures.push(`Desktop Create menu leaves viewport: ${JSON.stringify(geometry)}`);
    if(geometry.scrollHeight>geometry.clientHeight+2&&!['auto','scroll'].includes(geometry.overflowY))failures.push(`Desktop Create menu hides ${geometry.scrollHeight-geometry.clientHeight}px without vertical scrolling`);
    if(geometry.max>2&&geometry.after<geometry.max-2)failures.push(`Desktop Create menu cannot reach scroll end ${geometry.after}/${geometry.max}`);
    if(!geometry.lastReachable)failures.push(`Desktop Create menu last action clipped ${geometry.lastBottom} > ${geometry.bottom}`);
    return menu;
  };

  for(let index=0;index<10;index+=1){
    await page.evaluate(()=>{window.shellQa.newKind='';});
    const before=await page.evaluate(()=>({credit:window.shellQa.credit,statement:window.shellQa.statement}));
    const menu=await openMenu();
    const items=menu.locator('button[role="menuitem"]');
    const count=await items.count();
    if(count!==10){failures.push(`expected 10 specialist document actions, found ${count}`);break;}
    const target=items.nth(index);
    await target.scrollIntoViewIfNeeded();
    await assertInsideViewport(target,viewport,`specialist item ${index+1}`,failures);
    await target.click();
    await page.waitForTimeout(30);
    const after=await page.evaluate(()=>({newKind:window.shellQa.newKind,credit:window.shellQa.credit,statement:window.shellQa.statement,open:Boolean(document.querySelector('.ta-create-menu'))}));
    if(index<8){if(after.newKind!==specialistKinds[index])failures.push(`specialist item ${index+1} dispatched ${after.newKind||'nothing'}, expected ${specialistKinds[index]}`);}
    else if(index===8){if(after.credit!==before.credit+1)failures.push('Credit Note did not dispatch onCreditNote');}
    else if(after.statement!==before.statement+1)failures.push('Statement of Account did not dispatch onStatementAccount');
    if(after.open)failures.push(`specialist item ${index+1} left Create menu open after action`);
  }
}

async function runCase(name,browserType,viewport,lang){
  const browser=await browserType.launch({headless:true});
  try{
    const context=await browser.newContext({viewport:{width:viewport.width,height:viewport.height},isMobile:viewport.isMobile,hasTouch:viewport.hasTouch});
    const page=await context.newPage();
    const failures=[];
    page.on('pageerror',error=>failures.push(`pageerror: ${String(error)}`));
    await page.goto(`http://127.0.0.1:4173/tests/visual/obsidian-shell.html?lang=${lang}`,{waitUntil:'load'});
    await page.locator('.ta-shell').waitFor({state:'visible'});

    if(viewport.width<=900)await runMobileCreateQa(page,viewport,failures);
    else await runDesktopCreateQa(page,viewport,failures);

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
  const failures=rows.flatMap(row=>row.failures.map(failure=>`${row.name}/${row.lang}: ${failure}`));
  assert.equal(failures.length,0,failures.join('\n'));
  console.log(`v451 Create Center QA: ${rows.length} Chromium/WebKit phone+iPad+desktop cases passed; mobile multi-domain quick create and desktop specialist documents remain reachable.`);
})().catch(error=>{console.error(error);process.exitCode=1;});
