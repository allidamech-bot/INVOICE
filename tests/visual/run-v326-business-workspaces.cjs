const {chromium,webkit}=require('playwright');
const {mkdirSync,writeFileSync}=require('node:fs');
const assert=require('node:assert/strict');

const output='visual-qa-output/v326-business-workspaces';
const surfaces=[
  {name:'customers',fixture:'obsidian-directory.html',query:'screen=customers',selector:'.ta-customers-page'},
  {name:'products',fixture:'v326-products-workspace.html',query:'',selector:'.ta-products-workspace'},
  {name:'operations',fixture:'functional-products-operations-v197.html',query:'mode=operations',selector:'.ta-operations-page'},
  {name:'receivables',fixture:'obsidian-financial.html',query:'screen=receivables',selector:'.ta-finance-page,.ta-receivables-page'},
  {name:'reports',fixture:'obsidian-financial.html',query:'screen=reports',selector:'.ta-reports-page'}
];
const chromiumScenarios=[
  {name:'320-light',width:320,height:720,theme:'light'},
  {name:'390-light',width:390,height:844,theme:'light'},
  {name:'430-dark',width:430,height:932,theme:'dark'},
  {name:'desktop-light',width:1440,height:900,theme:'light'},
  {name:'desktop-dark',width:1440,height:900,theme:'dark'}
];
const webkitScenarios=[
  {name:'iphone320-light',width:320,height:700,theme:'light'},
  {name:'iphone320-dark',width:320,height:700,theme:'dark'},
  {name:'iphone390-light',width:390,height:844,theme:'light'},
  {name:'iphone390-dark',width:390,height:844,theme:'dark'},
  {name:'iphone430-light',width:430,height:932,theme:'light'}
];
const languages=['en','ar'];

async function inspect(page,surface,scenario,lang){
  return page.evaluate(({surface,scenario,lang})=>{
    const target=document.querySelector(surface.selector);
    const failures=[];
    const toPx=value=>{const n=parseFloat(String(value||'0'));return Number.isFinite(n)?n:0;};
    const rect=el=>{if(!el)return null;const r=el.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};
    const isVisible=el=>{if(!el)return false;const s=getComputedStyle(el),r=el.getBoundingClientRect();return s.display!=='none'&&s.visibility!=='hidden'&&r.width>0&&r.height>0;};
    const lastFlowChild=root=>{
      if(!(root instanceof Element))return null;
      const nodes=[...root.children].filter(el=>{if(!isVisible(el))return false;const p=getComputedStyle(el).position;return p!=='fixed'&&p!=='absolute';});
      return nodes.at(-1)||root;
    };
    const checkTargets=(selectors,label)=>{
      for(const selector of selectors){for(const el of document.querySelectorAll(selector)){if(!isVisible(el))continue;const r=el.getBoundingClientRect();if(r.width<43.5||r.height<43.5)failures.push(`${label} touch target ${selector} is ${r.width.toFixed(1)}x${r.height.toFixed(1)}`);}}
    };
    if(!target){failures.push(`missing ${surface.selector}`);return{failures};}
    const rootRect=target.getBoundingClientRect();
    if(document.documentElement.scrollWidth>scenario.width+2)failures.push(`page horizontal overflow ${document.documentElement.scrollWidth}px > ${scenario.width}px`);
    if(rootRect.left<-2||rootRect.right>scenario.width+2)failures.push(`workspace leaves viewport ${JSON.stringify(rect(target))}`);
    if(lang==='ar'&&document.documentElement.dir!=='rtl')failures.push(`Arabic dir=${document.documentElement.dir}`);
    if(lang==='en'&&document.documentElement.dir==='rtl')failures.push('English remained rtl');

    if(scenario.width<=900){
      const common=['.btn','.ta-domain-tabs>button','.ta-ops-tabs>button'];
      if(surface.name==='customers')checkTargets([...common,'.ta-customers-search button','.ta-customers-sort','.ta-customers-meta button','.ta-customer-row-actions button','.ta-customer-create-actions>button'],'customers');
      if(surface.name==='products')checkTargets([...common,'.ta-product-filter','.ta-product-sort','.ta-product-search button','.ta-product-row-menu-wrap>button','.ta-product-favorite','.ta-product-select'],'products');
      if(surface.name==='operations')checkTargets([...common,'.ta-ops-search button','.ta-ops-row-actions button','.ta-ops-editor-head>button','.ta-purchase-item-title>button'],'operations');
      if(surface.name==='receivables')checkTargets([...common,'.ta-search-clear','.ta-account-controls select','.ta-account-actions .btn'],'receivables');
      if(surface.name==='reports')checkTargets([...common,'.ta-report-presets>button','.ta-date-input','.ta-report-currency select','.ta-search-clear'],'reports');

      /* v337: mobile workspaces must be able to reach the final real content on
         WebKit, not merely fit horizontally. This catches the same class of
         clipped-bottom regressions that affected the document editors. */
      const main=document.querySelector('.ta-main');
      const nav=document.querySelector('.ta-mobile-nav');
      if(main){
        const before=main.scrollTop;
        const max=Math.max(0,main.scrollHeight-main.clientHeight);
        main.scrollTop=max;
        const after=main.scrollTop;
        if(max>2&&after<max-2)failures.push(`main cannot reach scroll end ${after}/${max}`);
        const content=lastFlowChild(target),contentRect=rect(content),mainRect=rect(main),navRect=isVisible(nav)?rect(nav):null;
        if(contentRect&&mainRect&&contentRect.bottom>mainRect.bottom+3)failures.push(`last content is not reachable: bottom ${contentRect.bottom.toFixed(1)} > main ${mainRect.bottom.toFixed(1)}`);
        if(contentRect&&navRect&&contentRect.bottom>navRect.top-2)failures.push(`last content remains behind bottom nav: ${contentRect.bottom.toFixed(1)} > ${navRect.top.toFixed(1)}`);
        main.scrollTop=before;
      }
    }

    if(surface.name==='operations'){
      const metrics=[...document.querySelectorAll('.ta-ops-metrics>div')];
      if(metrics.length!==4)failures.push(`operations metrics count=${metrics.length}, expected 4`);
      const cards=metrics.map(el=>{const s=getComputedStyle(el);return{...rect(el),background:s.backgroundColor,border:toPx(s.borderTopWidth),radius:toPx(s.borderTopLeftRadius)};});
      for(const card of cards){if(card.border<.5)failures.push('operations metric lost card border');if(card.background==='rgba(0, 0, 0, 0)'||card.background==='transparent')failures.push('operations metric background is transparent');if(card.width<80||card.height<78)failures.push(`operations metric too small ${card.width.toFixed(1)}x${card.height.toFixed(1)}`);}
      if(cards.length===4&&scenario.width>900){const ys=new Set(cards.map(card=>Math.round(card.y)));if(ys.size!==1)failures.push(`desktop operations metrics not one row: ${[...ys].join(',')}`);}
      if(cards.length===4&&scenario.width<=540){const firstY=Math.round(cards[0].y),secondY=Math.round(cards[1].y);if(Math.abs(firstY-secondY)>3)failures.push('mobile operations metrics are not a 2-column first row');}
    }

    if(surface.name==='customers'){
      const cards=[...document.querySelectorAll('.ta-customers-summary>div')].filter(isVisible);
      if(cards.length<3)failures.push(`customer summary cards=${cards.length}`);
      if(scenario.width<=900&&cards.length>=3){const rows=new Set(cards.map(el=>Math.round(el.getBoundingClientRect().y)));if(rows.size!==1)failures.push(`customer overview should stay compact on one row, rows=${rows.size}`);}
    }

    if(surface.name==='products'){
      const cards=[...document.querySelectorAll('.ta-products-overview>div')].filter(isVisible);
      if(cards.length!==4)failures.push(`product overview cards=${cards.length}`);
      const tabs=[...document.querySelectorAll('.ta-domain-tabs>button')].filter(isVisible);
      if(tabs.length<3)failures.push(`product domain tabs=${tabs.length}`);
      if(scenario.width<=900&&cards.length===4){const ys=cards.map(el=>Math.round(el.getBoundingClientRect().y));if(new Set(ys).size!==2)failures.push(`product overview expected 2x2 grid, rows=${new Set(ys).size}`);}
      for(const el of document.querySelectorAll('.ta-product-name strong,.ta-product-name small,.ta-product-commercial small,.ta-product-category,.ta-product-price')){if(!isVisible(el))continue;const fs=toPx(getComputedStyle(el).fontSize);if(fs<9.5)failures.push(`product visible text too small ${fs}px on ${el.className||el.tagName}`);}
    }

    if(surface.name==='receivables'&&scenario.width<=900){
      const cards=[...document.querySelectorAll('.ta-finance-kpi')].filter(isVisible);
      if(cards.length>=2){const a=cards[0].getBoundingClientRect(),b=cards[1].getBoundingClientRect();if(Math.abs(a.y-b.y)>3)failures.push('finance KPIs did not retain 2-column mobile scan');}
    }

    if(surface.name==='reports'){
      const filter=document.querySelector('.ta-report-filterbar');if(!filter||!isVisible(filter))failures.push('report filterbar missing');
      for(const el of document.querySelectorAll('.ta-report-presets>button')){if(!isVisible(el))continue;const r=el.getBoundingClientRect();if(scenario.width<=900&&r.height<43.5)failures.push(`report preset height=${r.height}`);}
    }

    return{failures,workspace:rect(target),scrollWidth:document.documentElement.scrollWidth,dir:document.documentElement.dir};
  },{surface,scenario,lang});
}

async function auditOpenSurface(page,selector,scrollerSelector,footerSelector,scenario,label,failures){
  const surface=page.locator(selector).last();
  await surface.waitFor({state:'visible',timeout:4000}).catch(()=>{});
  if(!(await surface.isVisible().catch(()=>false))){failures.push(`${label} did not open`);return;}
  const metrics=await surface.evaluate((el,{width,height,footerSelector})=>{
    const r=el.getBoundingClientRect();
    const footer=footerSelector?el.querySelector(footerSelector):null;
    const fr=footer?.getBoundingClientRect();
    const control=el.querySelector('input,select,textarea');
    return{
      left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height,
      footer:fr?{top:fr.top,bottom:fr.bottom,height:fr.height}:null,
      fontSize:control?parseFloat(getComputedStyle(control).fontSize):0,
      viewport:{width,height}
    };
  },{width:scenario.width,height:scenario.height,footerSelector});
  if(metrics.left<-1||metrics.right>scenario.width+1||metrics.top<-1||metrics.bottom>scenario.height+1)failures.push(`${label} leaves viewport ${JSON.stringify(metrics)}`);
  if(metrics.width>scenario.width+1||metrics.height>scenario.height+1)failures.push(`${label} oversized ${metrics.width}x${metrics.height}`);
  if(metrics.fontSize&&metrics.fontSize<15.5)failures.push(`${label} form control font ${metrics.fontSize}px may trigger Safari zoom`);
  if(metrics.footer&&(metrics.footer.bottom>scenario.height+1||metrics.footer.top<0))failures.push(`${label} footer not reachable ${JSON.stringify(metrics.footer)}`);
  const scroller=page.locator(`${selector} ${scrollerSelector}`).last();
  if(await scroller.isVisible().catch(()=>false)){
    await scroller.evaluate(el=>{el.scrollTop=el.scrollHeight;});
    await page.waitForTimeout(40);
    if(footerSelector){
      const footer=page.locator(`${selector} ${footerSelector}`).last();
      if(!(await footer.isVisible().catch(()=>false)))failures.push(`${label} footer disappeared after internal scroll`);
      else{
        const box=await footer.boundingBox();
        if(box&&box.y+box.height>scenario.height+1)failures.push(`${label} footer fell below viewport after scroll`);
      }
    }
  }
}

async function assertPrimaryAccent(page,locator,label,failures){
  if(!(await locator.isVisible().catch(()=>false))){failures.push(`${label} primary action missing`);return;}
  const colors=await locator.evaluate(el=>{
    const normalize=color=>{
      const canvas=document.createElement('canvas');canvas.width=1;canvas.height=1;
      const ctx=canvas.getContext('2d',{willReadFrequently:true});
      if(!ctx)return null;
      ctx.clearRect(0,0,1,1);ctx.fillStyle=color;ctx.fillRect(0,0,1,1);
      const [r,g,b,a]=ctx.getImageData(0,0,1,1).data;
      return{r,g,b,a};
    };
    const probe=document.createElement('span');
    probe.style.position='fixed';probe.style.pointerEvents='none';probe.style.background='var(--ft-accent)';document.body.appendChild(probe);
    const accentText=getComputedStyle(probe).backgroundColor;probe.remove();
    const actualText=getComputedStyle(el).backgroundColor;
    return{actualText,accentText,actual:normalize(actualText),accent:normalize(accentText)};
  });
  const channelDelta=colors.actual&&colors.accent?Math.max(
    Math.abs(colors.actual.r-colors.accent.r),Math.abs(colors.actual.g-colors.accent.g),
    Math.abs(colors.actual.b-colors.accent.b),Math.abs(colors.actual.a-colors.accent.a)
  ):Infinity;
  if(channelDelta>2)failures.push(`${label} primary color ${colors.actualText} != accent ${colors.accentText} (pixel delta ${channelDelta})`);
}

async function deepMobileAudit(page,surface,scenario,lang,engineName,failures){
  if(engineName!=='webkit'||scenario.name!=='iphone320-light')return;
  if(surface.name==='customers'){
    const trigger=page.locator('.ta-customers-header .btn-primary').first();
    await assertPrimaryAccent(page,trigger,'customer add',failures);
    if(await trigger.isVisible().catch(()=>false))await trigger.click();
    await auditOpenSurface(page,'.modal:has(.ta-customer-form)','.modal-body','.ta-customer-modal-actions',scenario,'Add Customer',failures);
    await page.screenshot({path:`${output}/${engineName}-${surface.name}-${scenario.name}-${lang}-add-customer.png`,fullPage:false});
  }
  if(surface.name==='products'){
    const trigger=page.locator('.ta-products-workspace-header .btn-primary').first();
    await assertPrimaryAccent(page,trigger,'product add',failures);
    if(await trigger.isVisible().catch(()=>false))await trigger.click();
    await auditOpenSurface(page,'.ta-product-editor.is-open','.ta-product-editor-scroll','.ta-product-editor-footer',scenario,'Add Product',failures);
    const save=page.locator('.ta-product-editor.is-open .btn-primary').last();
    await assertPrimaryAccent(page,save,'product editor save',failures);
    await page.screenshot({path:`${output}/${engineName}-${surface.name}-${scenario.name}-${lang}-add-product.png`,fullPage:false});
  }
  if(surface.name==='operations'){
    const openCurrent=async(label,fileToken)=>{
      const trigger=page.locator('.ta-ops-panel-head .btn-primary').first();
      await assertPrimaryAccent(page,trigger,`${label} add`,failures);
      if(await trigger.isVisible().catch(()=>false))await trigger.click();
      await auditOpenSurface(page,'.ta-ops-split>.ta-ops-editor','.ta-ops-editor-scroll','.ta-ops-editor-actions',scenario,label,failures);
      const save=page.locator('.ta-ops-split>.ta-ops-editor .btn-primary').last();
      await assertPrimaryAccent(page,save,`${label} save`,failures);
      await page.screenshot({path:`${output}/${engineName}-${surface.name}-${scenario.name}-${lang}-${fileToken}.png`,fullPage:false});
      const close=page.locator('.ta-ops-split>.ta-ops-editor .ta-ops-editor-head>button').last();
      if(await close.isVisible().catch(()=>false)){await close.click();await page.locator('.ta-ops-split>.ta-ops-editor').waitFor({state:'hidden',timeout:2500}).catch(()=>{});}
    };
    await openCurrent('Supplier editor','supplier-editor');
    const purchaseTab=page.locator('.ta-ops-tabs>button').filter({hasText:lang==='ar'?'المشتريات':'Purchases'}).first();
    if(await purchaseTab.isVisible().catch(()=>false)){await purchaseTab.click();await page.waitForTimeout(80);await openCurrent('Purchase editor','purchase-editor');}
    else failures.push('Purchases tab unavailable in deep mobile audit');
    const expenseTab=page.locator('.ta-ops-tabs>button').filter({hasText:lang==='ar'?'المصروفات':'Expenses'}).first();
    if(await expenseTab.isVisible().catch(()=>false)){await expenseTab.click();await page.waitForTimeout(80);await openCurrent('Expense editor','expense-editor');}
    else failures.push('Expenses tab unavailable in deep mobile audit');
    const inventoryTab=page.locator('.ta-ops-tabs>button').filter({hasText:lang==='ar'?'المخزون':'Inventory'}).first();
    if(await inventoryTab.isVisible().catch(()=>false)){
      await inventoryTab.click();await page.waitForTimeout(80);
      const entry=page.locator('.ta-inventory-entry').first();
      if(!(await entry.isVisible().catch(()=>false)))failures.push('Inventory manual-entry surface unavailable');
      else{
        const box=await entry.boundingBox();if(box&&(box.x<-1||box.x+box.width>scenario.width+1))failures.push(`Inventory entry leaves viewport ${JSON.stringify(box)}`);
        await page.screenshot({path:`${output}/${engineName}-${surface.name}-${scenario.name}-${lang}-inventory-entry.png`,fullPage:false});
      }
    }else failures.push('Inventory tab unavailable in deep mobile audit');
  }
}

async function runEngine(engineName,browserType,scenarios){
  const browser=await browserType.launch({headless:true});
  const rows=[];
  try{
    for(const surface of surfaces){for(const scenario of scenarios){for(const lang of languages){
      const context=await browser.newContext({viewport:{width:scenario.width,height:scenario.height},hasTouch:scenario.width<=900,isMobile:scenario.width<=900});
      const page=await context.newPage();const errors=[];
      page.on('pageerror',error=>errors.push(`pageerror: ${String(error)}`));
      page.on('console',message=>{if(message.type()==='error')errors.push(`console: ${message.text()}`);});
      await page.addInitScript(theme=>{try{localStorage.setItem('lourex-ui-theme',theme);}catch{}},scenario.theme);
      const params=new URLSearchParams(surface.query||'');params.set('lang',lang);
      const url=`http://127.0.0.1:4173/tests/visual/${surface.fixture}?${params.toString()}`;
      await page.goto(url,{waitUntil:'load'});
      await page.evaluate(theme=>{document.documentElement.dataset.uiTheme=theme;document.documentElement.dataset.uiThemePreference=theme;document.documentElement.style.colorScheme=theme;},scenario.theme);
      await page.locator(surface.selector).first().waitFor({state:'visible',timeout:10000});
      await page.waitForTimeout(180);
      const state=await inspect(page,surface,scenario,lang);state.failures.push(...errors);
      await deepMobileAudit(page,surface,scenario,lang,engineName,state.failures);
      const screenshot=`${output}/${engineName}-${surface.name}-${scenario.name}-${lang}.png`;
      await page.screenshot({path:screenshot,fullPage:false});
      rows.push({engine:engineName,surface:surface.name,scenario:scenario.name,lang,state,screenshot});
      await context.close();
    }}}
  }finally{await browser.close();}
  return rows;
}

(async()=>{
  mkdirSync(output,{recursive:true});
  const rows=[...(await runEngine('chromium',chromium,chromiumScenarios)),...(await runEngine('webkit',webkit,webkitScenarios))];
  writeFileSync(`${output}/report.json`,JSON.stringify(rows,null,2));
  const failures=rows.flatMap(row=>row.state.failures.map(f=>`${row.engine}/${row.surface}/${row.scenario}/${row.lang}: ${f}`));
  assert.equal(failures.length,0,failures.join('\n'));
  console.log(`v363 business workspaces reachability + deep mobile editor audit: ${rows.length} Chromium/WebKit scenarios passed.`);
})().catch(error=>{console.error(error);process.exitCode=1;});
