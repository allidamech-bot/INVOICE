const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const output='visual-qa-output/v364-core-workflows';
fs.mkdirSync(output,{recursive:true});
const base='http://127.0.0.1:4173/tests/visual';

async function open(browser,url,viewport={width:390,height:844}){
  const page=await browser.newPage({viewport,deviceScaleFactor:1,hasTouch:true,isMobile:true});
  page.setDefaultTimeout(12000);
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`${base}/${url}`,{waitUntil:'load'});
  await page.evaluate(()=>document.fonts.ready);
  await page.waitForTimeout(180);
  return{page,errors};
}
async function screenshot(page,name){await page.screenshot({path:`${output}/${name}.png`,fullPage:false,animations:'disabled'});}
async function openProductEditor(page){await page.evaluate(()=>window.dispatchEvent(new Event('lourex-open-product-editor')));await page.locator('.ta-product-editor.is-open').waitFor();}
async function assertPartyDropdownInFlow(page,partySelector,label){
  const metrics=await page.evaluate(selector=>{
    const party=document.querySelector(selector),dropdown=party?.querySelector('.customer-dropdown');
    const next=party?.nextElementSibling;const r=el=>{if(!el)return null;const x=el.getBoundingClientRect();return{top:x.top,bottom:x.bottom,left:x.left,right:x.right};};
    return{position:dropdown?getComputedStyle(dropdown).position:'missing',party:r(party),dropdown:r(dropdown),next:r(next),scrollWidth:document.documentElement.scrollWidth,viewport:innerWidth};
  },partySelector);
  assert.ok(metrics.dropdown,`${label}: searchable supplier/customer list is visible`);
  assert.equal(metrics.position,'static',`${label}: selection list participates in mobile document flow`);
  assert.ok(metrics.party.bottom>=metrics.dropdown.bottom-1,`${label}: selection list is contained by its section: ${JSON.stringify(metrics)}`);
  assert.ok(!metrics.next||metrics.dropdown.bottom<=metrics.next.top+1,`${label}: selection list cannot cover the following section: ${JSON.stringify(metrics)}`);
  assert.ok(metrics.dropdown.left>=-1&&metrics.dropdown.right<=metrics.viewport+1,`${label}: selection list stays within the phone: ${JSON.stringify(metrics)}`);
}

(async()=>{
  const browser=await chromium.launch({headless:true});
  const failures=[];
  const run=async(name,fn)=>{try{await fn();console.log(`PASS ${name}`);}catch(error){failures.push(`${name}: ${error.stack||error}`);console.error(`FAIL ${name}`,error.message);}};
  try{
    await run('Quote customer search and selection stay in the mobile flow',async()=>{
      const {page,errors}=await open(browser,'obsidian-editor.html?lang=en&kind=proforma');
      try{
        await page.locator('.editor-screen').waitFor();
        await page.getByRole('button',{name:'Change'}).click();
        await page.locator('.customer-select-wrap input').focus();
        await page.locator('.customer-dropdown').waitFor();
        await screenshot(page,'quote-customer-search');
        await assertPartyDropdownInFlow(page,'.customer-section','Quote customer selector');
        await page.locator('.customer-dropdown>button').filter({hasText:'Northstar Markets'}).click();
        await page.locator('.customer-dropdown').waitFor({state:'detached'});
        assert.deepEqual(errors,[],'Quote customer selection has no browser errors');
      }finally{await page.close();}
    });

    await run('Purchase order supplier selection stays in the mobile flow in RTL',async()=>{
      const {page,errors}=await open(browser,'obsidian-editor.html?lang=ar&kind=purchase-order',{width:320,height:700});
      try{
        await page.locator('.editor-screen').waitFor();
        assert.equal(await page.locator('html').getAttribute('dir'),'rtl');
        await page.getByRole('button',{name:'تغيير'}).click();
        await page.locator('.purchase-order-party-section .customer-select-wrap input').focus();
        await page.locator('.purchase-order-party-section .customer-dropdown').waitFor();
        await screenshot(page,'purchase-order-supplier-search-rtl-320');
        await assertPartyDropdownInFlow(page,'.purchase-order-party-section','Purchase order supplier selector');
        await page.locator('.purchase-order-party-section .customer-dropdown>button').click();
        await page.locator('.purchase-order-party-section .customer-dropdown').waitFor({state:'detached'});
        assert.deepEqual(errors,[],'Purchase order supplier selection has no browser errors');
      }finally{await page.close();}
    });

    await run('Quote and invoice autosave edits and produce a PDF from mobile controls',async()=>{
      for(const kind of ['proforma','invoice']){
        const {page,errors}=await open(browser,`obsidian-editor.html?lang=en&kind=${kind}`);
        try{
          await page.locator('.editor-screen').waitFor();
          await page.locator('.item-pricing-grid input').first().fill('5');
          await page.waitForFunction(()=>window.lastSaved?.items?.[0]?.quantity==='5');
          await screenshot(page,`${kind}-mobile-editor`);
          await page.locator('.mobile-action-buttons button').filter({hasText:'PDF'}).first().click();
          await page.locator('.issue-review').waitFor();
          await screenshot(page,`${kind}-issue-review`);
          await page.locator('.modal-footer-actions .btn-primary').click();
          await page.waitForFunction(()=>window.lastOutput==='pdf');
          assert.equal(await page.evaluate(()=>window.outputAttempts),1,`${kind} PDF action produces once`);
          assert.deepEqual(errors,[],`${kind} editing and PDF output have no browser errors`);
        }finally{await page.close();}
      }
    });

    await run('Adding a new customer from inside a quote validates and returns to the editor',async()=>{
      const {page,errors}=await open(browser,'obsidian-editor.html?lang=en&kind=proforma');
      try{
        await page.locator('.editor-screen').waitFor();
        await page.getByRole('button',{name:'Change'}).click();
        const search=page.locator('.customer-select-wrap input');
        await search.fill('Mobile Quote Buyer');
        await page.locator('.new-customer-option').click();
        const modal=page.locator('.modal:has(.ta-customer-form)');await modal.waitFor();
        const footer=modal.locator('.modal-footer');
        assert.ok((await footer.boundingBox()).y+(await footer.boundingBox()).height<=844,'Nested customer save controls remain onscreen');
        await screenshot(page,'quote-add-customer-mobile');
        const name=page.getByLabel('Company Name English');
        await name.fill('');
        await modal.getByRole('button',{name:'Save & Select'}).click();
        await modal.locator('.inline-error,[role="alert"]').waitFor();
        await name.fill('Mobile Quote Buyer');
        await page.getByLabel('Email').fill('buyer@example.test');
        await modal.getByRole('button',{name:'Save & Select'}).click();
        await modal.waitFor({state:'hidden'});
        await page.waitForFunction(()=>document.querySelector('.selected-customer strong')?.textContent?.trim()==='Mobile Quote Buyer');
        assert.equal(await page.evaluate(()=>window.customerSaveCount),1,'Customer is saved once and selected on the quote');
        assert.deepEqual(errors,[],'Nested customer create has no browser errors');
      }finally{await page.close();}
    });

    await run('Customer create and delete controls remain reachable on a phone',async()=>{
      const {page,errors}=await open(browser,'obsidian-directory.html?screen=customers&lang=en');
      try{
        await page.getByRole('button',{name:'Add Customer'}).click();
        const modal=page.locator('.modal:has(.ta-customer-form)');await modal.waitFor();
        const geom=await modal.evaluate(el=>{const r=el.getBoundingClientRect(),body=el.querySelector('.modal-body'),footer=el.querySelector('.modal-footer');return{top:r.top,bottom:r.bottom,bodyScroll:body.scrollHeight,bodyClient:body.clientHeight,footerBottom:footer.getBoundingClientRect().bottom,viewport:innerHeight};});
        assert.ok(geom.footerBottom<=geom.viewport+1,`Customer save controls stay onscreen: ${JSON.stringify(geom)}`);
        assert.ok(geom.bodyScroll>geom.bodyClient,'Long customer form uses its own scroll area');
        await screenshot(page,'customer-add-mobile');
        await page.getByLabel('Company Name English').fill('Mobile Workflow QA');
        await page.getByLabel('Email').fill('workflow@example.test');
        await modal.getByRole('button',{name:'Save Customer'}).click();
        await page.waitForFunction(()=>window.savedCustomer?.companyNameEn==='Mobile Workflow QA');
        assert.equal(await page.locator('.ta-customer-row').filter({hasText:'Mobile Workflow QA'}).count(),1);
        const row=page.locator('.ta-customer-row').filter({hasText:'Mobile Workflow QA'});
        await row.getByRole('button',{name:'Delete'}).click();
        const confirm=page.locator('.modal:has(.modal-footer-actions)').last();
        await confirm.waitFor();
        await confirm.getByRole('button',{name:'Delete'}).click();
        await page.waitForFunction(()=>Boolean(window.deletedCustomerId));
        assert.equal(await row.count(),0,'Deleted customer leaves the mobile list');
        assert.deepEqual(errors,[],'Customer create/delete has no browser errors');
      }finally{await page.close();}
    });

    await run('Product editor save and delete actions work from the mobile sheet',async()=>{
      const {page,errors}=await open(browser,'v326-products-workspace.html?lang=en');
      try{
        await openProductEditor(page);
        const editor=page.locator('.ta-product-editor.is-open');
        const geom=await editor.evaluate(el=>{const r=el.getBoundingClientRect(),scroll=el.querySelector('.ta-product-editor-scroll'),footer=el.querySelector('.ta-product-editor-footer');return{top:r.top,bottom:r.bottom,scrollHeight:scroll.scrollHeight,scrollClient:scroll.clientHeight,footerBottom:footer.getBoundingClientRect().bottom,viewport:innerHeight};});
        assert.ok(geom.footerBottom<=geom.viewport+1,`Product save action stays onscreen: ${JSON.stringify(geom)}`);
        await page.getByLabel('Description English').fill('Phone workflow sample');
        await editor.getByRole('button',{name:'Save Product'}).click();
        await page.waitForFunction(()=>window.productSaveCount===1&&window.savedProduct?.descriptionEn==='Phone workflow sample');
        const menu=page.locator('.ta-product-row-menu-wrap>button').first();await menu.click();
        await page.getByRole('menuitem',{name:'Delete'}).first().click();
        const confirm=page.locator('.modal:has(.modal-footer-actions)').last();await confirm.waitFor();
        await confirm.getByRole('button',{name:'Delete product'}).click();
        await page.waitForFunction(()=>window.productDeleteCount===1);
        assert.deepEqual(errors,[],'Product create/delete has no browser errors');
      }finally{await page.close();}
    });

    await run('Purchase posting and manual inventory entry work on a phone',async()=>{
      const {page,errors}=await open(browser,'functional-products-operations-v197.html?mode=operations&lang=en');
      try{
        await page.getByRole('tab',{name:'Purchases'}).click();
        const createPurchase=page.locator('#operations-panel-purchases .ta-ops-panel-head').getByRole('button',{name:'New Purchase',exact:true});
        assert.equal(await createPurchase.count(),1,'Purchase header exposes one canonical create action');
        await createPurchase.click();
        const editor=page.locator('.ta-ops-split>.ta-ops-editor');await editor.waitFor();
        const metrics=await editor.evaluate(el=>{const r=el.getBoundingClientRect(),scroll=el.querySelector('.ta-ops-editor-scroll'),footer=el.querySelector('.ta-ops-editor-actions');return{bottom:r.bottom,scrollHeight:scroll.scrollHeight,scrollClient:scroll.clientHeight,footerTop:footer.getBoundingClientRect().top,footerBottom:footer.getBoundingClientRect().bottom,viewport:innerHeight};});
        assert.ok(metrics.footerBottom<=metrics.viewport+1,`Purchase actions stay onscreen: ${JSON.stringify(metrics)}`);
        const first=page.locator('.ta-purchase-item').first();
        await first.locator('select').first().selectOption('product-v197');
        await first.getByLabel('Quantity').fill('5');
        await first.getByRole('textbox',{name:'Unit cost',exact:true}).fill('4.25');
        await page.getByRole('button',{name:'Add Item'}).click();
        assert.equal(await page.locator('.ta-purchase-item').count(),2,'Purchase item can be added');
        await page.locator('.ta-purchase-item').last().getByRole('button',{name:'Remove item'}).click();
        assert.equal(await page.locator('.ta-purchase-item').count(),1,'Purchase item can be removed');
        await screenshot(page,'purchase-editor-mobile');
        await page.getByRole('button',{name:'Post Purchase'}).click();
        const confirm=page.locator('.modal:has(.modal-footer-actions)').last();await confirm.waitFor();
        await confirm.getByRole('button',{name:'Post Purchase'}).click();
        await page.waitForFunction(()=>window.postAttempts===1&&window.operationsState().purchases.length===1);
        await page.getByRole('tab',{name:'Inventory'}).click();
        const entry=page.locator('.ta-inventory-entry');
        await entry.locator('select').first().selectOption('product-v197');
        await entry.getByLabel('Quantity').fill('12');
        await entry.getByLabel('Unit cost (optional)').fill('4.25');
        await entry.getByRole('button',{name:'Record Movement'}).click();
        await page.waitForFunction(()=>window.movementAttempts===1&&window.operationsState().movements.length===1);
        assert.deepEqual(errors,[],'Purchase and inventory workflows have no browser errors');
      }finally{await page.close();}
    });

    await run('Customer, product and purchase sheets fit a 320px RTL phone',async()=>{
      const viewport={width:320,height:700};
      const customer=await open(browser,'obsidian-directory.html?screen=customers&lang=ar',viewport);
      try{
        await customer.page.getByRole('button',{name:'إضافة عميل'}).click();
        const modal=customer.page.locator('.modal:has(.ta-customer-form)');await modal.waitFor();
        const box=await modal.boundingBox(),footer=await modal.locator('.modal-footer').boundingBox();
        assert.ok(box.x>=0&&box.x+box.width<=320,`320px customer form fits: ${JSON.stringify(box)}`);
        assert.ok(footer.y+footer.height<=700,`320px customer actions fit: ${JSON.stringify(footer)}`);
        await screenshot(customer.page,'customer-add-rtl-320');
      }finally{await customer.page.close();}
      const product=await open(browser,'v326-products-workspace.html?lang=ar',viewport);
      try{
        await openProductEditor(product.page);
        const editor=product.page.locator('.ta-product-editor.is-open');
        const box=await editor.boundingBox(),footer=await editor.locator('.ta-product-editor-footer').boundingBox();
        assert.ok(box.x>=0&&box.x+box.width<=320,`320px product editor fits: ${JSON.stringify(box)}`);
        assert.ok(footer.y+footer.height<=700,`320px product actions fit: ${JSON.stringify(footer)}`);
        await screenshot(product.page,'product-editor-rtl-320');
      }finally{await product.page.close();}
      const operations=await open(browser,'functional-products-operations-v197.html?mode=operations&lang=ar',viewport);
      try{
        await operations.page.getByRole('tab',{name:'المشتريات'}).click();
        const createPurchase=operations.page.locator('#operations-panel-purchases .ta-ops-panel-head').getByRole('button',{name:'شراء جديد',exact:true});
        assert.equal(await createPurchase.count(),1,'RTL purchase header exposes one canonical create action');
        await createPurchase.click();
        const editor=operations.page.locator('.ta-ops-split>.ta-ops-editor');await editor.waitFor();
        const box=await editor.boundingBox(),footer=await editor.locator('.ta-ops-editor-actions').boundingBox();
        assert.ok(box.x>=0&&box.x+box.width<=320,`320px purchase editor fits: ${JSON.stringify(box)}`);
        assert.ok(footer.y+footer.height<=700,`320px purchase actions fit: ${JSON.stringify(footer)}`);
        assert.equal(await editor.locator('.ta-ops-editor-scroll>fieldset').evaluate(el=>getComputedStyle(el).borderTopWidth),'0px','The form group must not add a second frame inside the purchase sheet');
        await screenshot(operations.page,'purchase-editor-rtl-320');
        assert.deepEqual(operations.errors,[],'320px purchase editor has no browser errors');
      }finally{await operations.page.close();}
    });

    await run('Draft PDF design templates are visible, selectable and reflected in the phone preview',async()=>{
      for(const lang of ['en','ar']){
        const {page,errors}=await open(browser,`obsidian-draft-editor.html?lang=${lang}`);
        try{
          await page.locator('.draft-studio').waitFor();
          const templates=page.locator('.draft-pdf-design-section .template-card');
          assert.equal(await templates.count(),18,'Draft offers the same 18 visual templates as commercial documents');
          assert.ok(await templates.first().isVisible(),'Document templates are visible in the mobile editor');
          assert.ok(await page.getByRole('button',{name:lang==='ar'?'بسيط':'Minimal'}).isVisible());
          await screenshot(page,`draft-pdf-templates-${lang}`);
          await page.getByRole('button',{name:lang==='ar'?'بسيط':'Minimal'}).click();
          assert.equal(await page.getByRole('button',{name:lang==='ar'?'بسيط':'Minimal'}).getAttribute('aria-pressed'),'true');
          await page.locator('.draft-mobile-actionbar').getByRole('button',{name:lang==='ar'?'معاينة':'Preview'}).click();
          const preview=page.locator('.draft-mobile-preview');await preview.waitFor();
          const pageDesign=preview.locator('.draft-letter-page').first();
          const classes=await pageDesign.getAttribute('class');
          assert.match(classes,/template-minimal/);
          await screenshot(page,`draft-pdf-minimal-preview-${lang}`);
          await preview.getByRole('button',{name:lang==='ar'?'إغلاق':'Close'}).click();
          await page.locator('.draft-mobile-actionbar').getByRole('button',{name:'PDF'}).click();
          await page.waitForFunction(()=>window.draftQa.outputCount===1);
          assert.deepEqual(errors,[],`Draft design and PDF actions have no browser errors in ${lang}`);
        }finally{await page.close();}
      }
    });

    await run('Arabic Documents heading aligns to the right edge on a phone',async()=>{
      const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true});
      try{
        await page.setContent('<!doctype html><html dir="rtl" data-ui-theme="dark"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div class="app-ui"><section class="ta-documents-page"><header class="ta-documents-header"><div><span class="ta-documents-eyebrow">مستندات الأعمال</span><h1>المستندات</h1><p>أنشئ وأصدر وأدر دورة مستندات LOUREX التجارية الكاملة.</p></div></header></section></div></body></html>');
        await page.addStyleTag({path:'src/styles/premium-ux-coherence-v362.css'});
        const metrics=await page.locator('.ta-documents-header>div:first-child').evaluate(el=>({width:el.getBoundingClientRect().width,viewport:innerWidth,align:getComputedStyle(el).textAlign,children:[...el.children].map(child=>({text:child.innerText,align:getComputedStyle(child).textAlign,width:child.getBoundingClientRect().width}))}));
        assert.equal(metrics.align,'right',`Arabic Documents copy must align right: ${JSON.stringify(metrics)}`);
        assert.ok(metrics.width>=metrics.viewport-20,`Heading copy must span the available mobile width: ${JSON.stringify(metrics)}`);
        assert.ok(metrics.children.every(child=>child.align==='right'&&child.width>=metrics.width-1),`Eyebrow, title and subtitle must share the right edge: ${JSON.stringify(metrics)}`);
      }finally{await page.close();}
    });
  }finally{await browser.close();}
  if(failures.length){console.error(failures.join('\n\n'));process.exitCode=1;}else console.log('v364 mobile core workflows: all browser scenarios passed.');
})();
