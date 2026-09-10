const {chromium}=require('playwright');
const {mkdirSync,writeFileSync}=require('node:fs');
const assert=require('node:assert/strict');

const output='visual-qa-output/functional-editor-controls-v201';
const url=query=>`http://127.0.0.1:4173/tests/visual/obsidian-editor.html?${query}`;

(async()=>{
  mkdirSync(output,{recursive:true});
  const browser=await chromium.launch({headless:true});
  const results=[];
  const open=async(query,viewport={width:390,height:844})=>{
    const page=await browser.newPage({viewport,hasTouch:viewport.width<=820,isMobile:viewport.width<=820});
    page.setDefaultTimeout(12000);
    await page.goto(url(query),{waitUntil:'load'});
    await page.locator('.editor-screen').waitFor();
    await page.evaluate(()=>document.fonts.ready);
    return page;
  };
  const run=async(name,fn)=>{
    const failures=[];
    try{await fn(failures);}catch(error){failures.push(error?.stack||String(error));}
    results.push({name,failures});
  };
  const snap=(page,name)=>page.screenshot({path:`${output}/${name}.png`,fullPage:true,animations:'disabled'});

  try{
    await run('invoice-core-fields-items-totals-terms',async failures=>{
      const page=await open('lang=en&kind=invoice');
      try{
        const sections=page.locator('.editor-form-lock > .editor-section');
        assert.equal(await sections.count(),6,'editor must expose all six editing sections');
        await page.waitForFunction(()=>document.querySelectorAll('.editor-section-nav-button').length===6);

        const documentSection=sections.nth(0);
        await documentSection.locator('input').first().fill('INV-2026-0091');
        await documentSection.locator('input[type="date"]').first().fill('2026-09-11');
        const currency=documentSection.locator('input[list="currencies"]');
        await currency.fill('eur');
        assert.equal(await currency.inputValue(),'EUR','currency input must normalize to uppercase immediately');
        await documentSection.locator('select').selectOption('bilingual');

        const itemsSection=sections.nth(2);
        const initialItems=await itemsSection.locator('.item-card').count();
        await itemsSection.locator('.add-item-button').click();
        assert.equal(await itemsSection.locator('.item-card').count(),initialItems+1,'Add Item must append exactly one row');
        await itemsSection.locator('.item-card').first().getByRole('button',{name:'Duplicate item'}).click();
        assert.equal(await itemsSection.locator('.item-card').count(),initialItems+2,'Duplicate item must append one independent row');
        const lastCard=itemsSection.locator('.item-card').last();
        await lastCard.getByRole('button',{name:'Delete'}).click();
        assert.equal(await itemsSection.locator('.item-card').count(),initialItems+1,'Delete item must remove one row');

        const firstCard=itemsSection.locator('.item-card').first();
        const pricing=firstCard.locator('.item-pricing-grid input');
        await pricing.nth(0).fill('3.5');
        await pricing.nth(1).fill('Box');
        await pricing.nth(2).fill('100.25');

        const totalsSection=sections.nth(3);
        const switches=totalsSection.locator('button[role="switch"]');
        await switches.nth(0).click();
        await totalsSection.locator('.discount-control select').selectOption('percent');
        await totalsSection.locator('.discount-control input').fill('10');
        await switches.nth(1).click();
        await totalsSection.locator('.adjustment-row').nth(1).locator('input').fill('25');
        await switches.nth(2).click();
        await totalsSection.locator('.adjustment-row').nth(2).locator('input').fill('5');
        await switches.nth(3).click();
        await totalsSection.locator('.adjustment-row').nth(3).locator('input').fill('15');

        const termsSection=sections.nth(4);
        await termsSection.locator('input').nth(0).fill('CIF');
        await termsSection.locator('input').nth(1).fill('Net 30');
        await termsSection.locator('.advanced-master-toggle').click();
        await termsSection.locator('textarea').last().fill('Audit note for the invoice.');

        const designSection=sections.nth(5);
        const bankToggle=designSection.locator('button[role="switch"]').first();
        const bankBefore=await bankToggle.getAttribute('aria-checked');
        await bankToggle.click();
        assert.notEqual(await bankToggle.getAttribute('aria-checked'),bankBefore,'design toggle must change state');

        await page.waitForFunction(()=>window.lastSaved?.number==='INV-2026-0091'&&window.lastSaved?.currency==='EUR'&&window.lastSaved?.language==='bilingual'&&window.lastSaved?.items?.[0]?.quantity==='3.5'&&window.lastSaved?.adjustments?.taxPercent==='15'&&window.lastSaved?.notes==='Audit note for the invoice.');
        const saved=await page.evaluate(()=>window.lastSaved);
        assert.equal(saved.items[0].unit,'Box');
        assert.equal(saved.items[0].unitPrice,'100.25');
        assert.equal(saved.adjustments.discountMode,'percent');
        assert.equal(saved.adjustments.discountValue,'10');
        assert.equal(saved.adjustments.shipping,'25');
        assert.equal(saved.adjustments.otherCharges,'5');
        assert.equal(saved.terms.incoterm,'CIF');
        assert.equal(saved.terms.paymentTerms,'Net 30');

        await page.locator('.mobile-preview-button').click();
        await page.waitForFunction(()=>document.querySelector('.editor-screen')?.classList.contains('mobile-preview-open'));
        await page.locator('.mobile-preview-overlay button[aria-label="Close"]').click();
        await page.waitForFunction(()=>!document.querySelector('.editor-screen')?.classList.contains('mobile-preview-open'));

        const geometry=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,navButtons:document.querySelectorAll('.editor-section-nav-button').length}));
        if(geometry.scrollWidth>geometry.width+1)failures.push(`editor horizontal overflow ${JSON.stringify(geometry)}`);
        await snap(page,'invoice-controls-en');
      }finally{await page.close();}
    });

    await run('proforma-date-customer-rtl',async failures=>{
      const page=await open('lang=ar&kind=proforma');
      try{
        assert.equal(await page.locator('html').getAttribute('dir'),'rtl');
        const sections=page.locator('.editor-form-lock > .editor-section');
        const dates=sections.nth(0).locator('input[type="date"]');
        const oldIssue=await dates.nth(0).inputValue();
        const oldDue=await dates.nth(1).inputValue();
        const oldWindow=Math.round((Date.parse(oldDue)-Date.parse(oldIssue))/86400000);
        await dates.nth(0).fill('2026-10-05');
        const newDue=await dates.nth(1).inputValue();
        const newWindow=Math.round((Date.parse(newDue)-Date.parse('2026-10-05'))/86400000);
        assert.equal(newWindow,oldWindow,'quotation validity window must move with the issue date');

        const customer=sections.nth(1);
        await customer.locator('.selected-customer button').click();
        const search=customer.locator('.customer-select-wrap input');
        await search.fill('نورث');
        await customer.locator('.customer-dropdown button').first().click();
        await page.waitForFunction(()=>document.querySelector('.selected-customer strong')?.textContent?.includes('نورث'));

        await page.waitForFunction(()=>window.lastSaved?.issueDate==='2026-10-05');
        const geometry=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth}));
        if(geometry.scrollWidth>geometry.width+1)failures.push(`RTL editor overflow ${JSON.stringify(geometry)}`);
        await snap(page,'proforma-rtl');
      }finally{await page.close();}
    });

    await run('save-item-single-flight',async()=>{
      const page=await open('lang=en&kind=invoice&actionDelay=250');
      try{
        const saveItem=page.locator('.save-item-library-button').first();
        await saveItem.evaluate(button=>{button.click();button.click();});
        await page.waitForFunction(()=>window.itemSaveCount>=1);
        await page.waitForTimeout(320);
        assert.equal(await page.evaluate(()=>window.itemSaveCount),1,'rapid Save item presses must write once');
      }finally{await page.close();}
    });

    await run('new-customer-single-flight',async()=>{
      const page=await open('lang=en&kind=invoice&actionDelay=250');
      try{
        const customerSection=page.locator('.editor-form-lock > .editor-section').nth(1);
        await customerSection.locator('.selected-customer button').click();
        await customerSection.locator('.customer-select-wrap input').fill('Orbit New Trading');
        await customerSection.locator('.new-customer-option').click();
        const save=page.locator('.modal-backdrop .modal-footer-actions .btn-primary');
        await save.waitFor();
        await save.evaluate(button=>{button.click();button.click();});
        await page.waitForFunction(()=>window.customerSaveCount>=1);
        await page.waitForTimeout(320);
        assert.equal(await page.evaluate(()=>window.customerSaveCount),1,'rapid Save & Select presses must save one customer');
      }finally{await page.close();}
    });

    await run('final-output-and-lifecycle-single-flight',async()=>{
      const page=await open('lang=en&kind=invoice&status=final&outputDelay=250&actionDelay=250');
      try{
        const pdf=page.locator('.mobile-action-buttons button').filter({hasText:'PDF'}).first();
        await pdf.evaluate(button=>{button.click();button.click();});
        await page.waitForFunction(()=>window.outputAttempts>=1);
        await page.waitForTimeout(320);
        assert.equal(await page.evaluate(()=>window.outputAttempts),1,'rapid final PDF presses must prepare one output');

        const credit=page.locator('.document-lifecycle-panel').getByRole('button',{name:'Create Credit Note'});
        if(await credit.count()){
          await credit.evaluate(button=>{button.click();button.click();});
          await page.waitForFunction(()=>window.creditCount>=1);
          await page.waitForTimeout(320);
          assert.equal(await page.evaluate(()=>window.creditCount),1,'rapid credit-note presses must create one request');
        }
        assert.equal(await page.locator('.editor-form-lock').evaluate(fieldset=>fieldset.disabled),true,'final document fields must remain locked');
      }finally{await page.close();}
    });

    await run('validation-and-touch-targets',async failures=>{
      const page=await open('lang=en&kind=invoice',{width:390,height:844});
      try{
        const number=page.locator('.editor-form-lock > .editor-section').first().locator('input').first();
        await number.fill('');
        await page.waitForTimeout(520);
        const save=page.locator('.save-now-button');
        await save.click();
        await page.locator('.editor-validation-summary').waitFor();
        assert.ok(await page.locator('.editor-form-lock > .editor-section').first().locator('.field-error').count(),'invalid required field must surface its error');
        const smallTargets=await page.evaluate(()=>[...document.querySelectorAll('.mobile-editor-actionbar button,.editor-section-nav-button')].map(button=>{const r=button.getBoundingClientRect();return {w:r.width,h:r.height,text:button.textContent?.trim()||button.getAttribute('aria-label')||''};}).filter(item=>item.w>0&&item.h>0&&(item.w<40||item.h<40)));
        if(smallTargets.length)failures.push(`undersized mobile controls ${JSON.stringify(smallTargets.slice(0,8))}`);
      }finally{await page.close();}
    });
  }finally{await browser.close();}

  writeFileSync(`${output}/report.json`,JSON.stringify(results,null,2));
  const failures=results.flatMap(result=>result.failures.map(failure=>`${result.name}: ${failure}`));
  assert.equal(failures.length,0,failures.join('\n\n'));
  console.log(`Editor controls v201: ${results.length} field/action flows passed.`);
})().catch(error=>{console.error(error);process.exitCode=1;});
