const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const BASE='http://127.0.0.1:4173/tests/visual/obsidian-functional-customers-v196.html';

async function doubleClickByLabel(page,label){
  await page.evaluate((text)=>{
    const button=[...document.querySelectorAll('button')].find(node=>node.textContent?.trim()===text);
    if(!button)throw new Error(`button missing: ${text}`);
    button.click();button.click();
  },label);
}

async function auditProfile(page,lang,viewport){
  const state=await page.locator('.customer-profile-page').evaluate(root=>{
    const background=selector=>getComputedStyle(root.querySelector(selector)).backgroundColor;
    const allBackgrounds=selectors=>[...root.querySelectorAll(selectors)].map(el=>getComputedStyle(el).backgroundColor);
    const light=[];
    for(const el of root.querySelectorAll('*')){
      const rect=el.getBoundingClientRect(),style=getComputedStyle(el);
      if(!rect.width||!rect.height||style.display==='none'||style.visibility==='hidden')continue;
      const rgba=style.backgroundColor.match(/[\d.]+/g)?.map(Number)||[];
      if(rgba.length>=3&&rgba[3]!==0&&rgba[0]>220&&rgba[1]>220&&rgba[2]>220)light.push(`${el.tagName}.${el.className}:${style.backgroundColor}`);
    }
    const secondary=root.querySelector('.customer-profile-secondary-name');
    return {
      overflow:document.documentElement.scrollWidth>innerWidth+1,
      hero:background('.customer-profile-hero'),
      cards:allBackgrounds('.customer-profile-card'),
      badges:allBackgrounds('.customer-profile-badges>span'),
      quickActions:allBackgrounds('.customer-profile-quick-actions>button'),
      facts:allBackgrounds('.customer-profile-facts>div,.customer-profile-stack>div'),
      primary:root.querySelector('.customer-profile-identity h1')?.textContent?.trim(),
      secondaryDisplay:secondary?getComputedStyle(secondary).display:null,
      light:[...new Set(light)]
    };
  });
  const expected=lang==='ar'?'أسواق نورث ستار':'Northstar Markets';
  assert.equal(state.overflow,false,`${viewport}/${lang}: customer profile overflows viewport`);
  assert.equal(state.primary,expected,`${viewport}/${lang}: customer profile must use active UI language`);
  assert.ok(state.secondaryDisplay===null||state.secondaryDisplay==='none',`${viewport}/${lang}: opposite-language profile name must stay hidden`);
  assert.equal(state.hero,'rgb(20, 20, 20)',`${viewport}/${lang}: customer hero is outside matte hierarchy`);
  assert.ok(state.cards.length>=4&&state.cards.every(value=>value==='rgb(20, 20, 20)'),`${viewport}/${lang}: nested customer cards ${JSON.stringify(state.cards)}`);
  assert.ok(state.badges.every(value=>value==='rgb(25, 25, 25)'),`${viewport}/${lang}: customer badges ${JSON.stringify(state.badges)}`);
  assert.ok(state.quickActions.length>=3&&state.quickActions.every(value=>value==='rgb(26, 26, 26)'),`${viewport}/${lang}: customer actions ${JSON.stringify(state.quickActions)}`);
  assert.ok(state.facts.every(value=>value==='rgba(0, 0, 0, 0)'),`${viewport}/${lang}: facts should stay flat ${JSON.stringify(state.facts)}`);
  assert.deepEqual(state.light,[],`${viewport}/${lang}: light nested customer chrome ${JSON.stringify(state.light)}`);
}

async function runLanguage(browser,lang,viewport){
  const page=await browser.newPage({viewport:{width:viewport,height:viewport<=430?844:900},deviceScaleFactor:1,hasTouch:viewport<=820,isMobile:viewport<=820});
  await page.goto(`${BASE}?lang=${lang}`,{waitUntil:'networkidle'});
  const expected=lang==='ar'?'أسواق نورث ستار':'Northstar Markets';
  const listIdentity=await page.locator('.customer-card-main').evaluate(root=>{
    const secondary=root.querySelector('.customer-secondary-name');
    return {primary:root.querySelector('.customer-name-row strong')?.textContent?.trim(),secondaryDisplay:secondary?getComputedStyle(secondary).display:null};
  });
  assert.equal(listIdentity.primary,expected,`${viewport}/${lang}: customer list must use active UI language`);
  assert.ok(listIdentity.secondaryDisplay===null||listIdentity.secondaryDisplay==='none',`${viewport}/${lang}: opposite-language list name must stay hidden`);

  await doubleClickByLabel(page,lang==='ar'?'عرض سعر':'Quote');
  await page.waitForTimeout(220);
  let calls=await page.evaluate(()=>window.customerDocumentCalls.slice());
  assert.deepEqual(calls,['customer-v196:proforma'],`${viewport}/${lang}: list quote action must be single-flight`);

  await page.locator('.customer-card-main').click();
  await auditProfile(page,lang,viewport);
  await doubleClickByLabel(page,lang==='ar'?'فاتورة جديدة':'New Invoice');
  await page.waitForTimeout(220);
  calls=await page.evaluate(()=>window.customerDocumentCalls.slice());
  assert.deepEqual(calls,['customer-v196:proforma','customer-v196:invoice'],`${viewport}/${lang}: profile invoice action must be single-flight`);
  await page.close();
}

(async()=>{
  const browser=await chromium.launch({headless:true});
  try{
    for(const viewport of [320,390,1024])for(const lang of ['en','ar'])await runLanguage(browser,lang,viewport);
    console.log('Functional customers v233: locale-pure identity, nested profile + single-flight actions passed.');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});