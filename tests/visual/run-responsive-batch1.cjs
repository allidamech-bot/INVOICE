const {chromium,webkit}=require('playwright');
const assert=require('node:assert/strict');
const {mkdirSync,writeFileSync}=require('node:fs');
const output='visual-qa-output/responsive-batch1';
const base='http://127.0.0.1:4173/tests/visual/';

(async()=>{
  mkdirSync(output,{recursive:true});
  const results=[];
  const cases=[
    [320,'ar','dark'],[390,'en','light'],[430,'ar','light'],
    [820,'ar','dark'],[900,'en','dark'],[901,'ar','light'],
    [1024,'en','light'],[1440,'ar','dark']
  ];
  const browser=await chromium.launch({headless:true});
  try{
    for(const [width,lang,theme] of cases){
      const page=await browser.newPage({viewport:{width,height:width<901?844:900}});
      const errors=[];page.on('pageerror',e=>errors.push(e.message));
      await page.goto(base+'v483-documents-density.html',{waitUntil:'networkidle'});
      await page.evaluate(({lang,theme})=>{document.documentElement.dataset.uiTheme=theme;window.renderDocumentsDensity(lang);},{lang,theme});
      const metrics=await page.evaluate(()=>{
        const rect=s=>document.querySelector(s).getBoundingClientRect().toJSON();
        return {width:innerWidth,scrollWidth:document.documentElement.scrollWidth,dir:document.documentElement.dir,header:rect('.ta-documents-header'),search:rect('.ta-doc-search'),actions:[...document.querySelectorAll('.ta-documents-header-actions button')].map(e=>e.getBoundingClientRect().toJSON())};
      });
      assert.deepEqual(errors,[]);
      assert.ok(metrics.scrollWidth<=width+1,`${width}: horizontal overflow`);
      assert.equal(metrics.dir,lang==='ar'?'rtl':'ltr');
      for(const action of metrics.actions)assert.ok(action.height>=44,`${width}: creation touch target`);
      const picker=page.locator('.ta-doc-mobile-type-picker select');
      assert.equal(await picker.locator('option').count(),10,'all document types remain selectable');
      if(width<=900){
        assert.ok(metrics.header.height<=240,`${width}: header consumes ${metrics.header.height}px`);
        assert.ok(metrics.search.top<=400,`${width}: search starts at ${metrics.search.top}px`);
        await picker.selectOption('invoice');
        assert.equal(await page.locator('.ta-doc-type-tabs button.is-active').count(),1);
        await picker.selectOption('all');
      }else assert.equal(await picker.isVisible(),false);
      await page.screenshot({path:`${output}/documents-${width}-${lang}-${theme}.png`,fullPage:true,animations:'disabled'});
      results.push({width,lang,theme,metrics});await page.close();
    }
  }finally{await browser.close();}
  for(const engine of [chromium,webkit]){
    const browser=await engine.launch({headless:true});
    try{
      const page=await browser.newPage({viewport:{width:320,height:700},hasTouch:true,isMobile:true});
      await page.addInitScript(()=>{
        const viewport=new EventTarget();
        window.batch1Viewport={height:620,offsetTop:0};
        for(const property of ['height','offsetTop'])Object.defineProperty(viewport,property,{get:()=>window.batch1Viewport[property]});
        Object.defineProperty(window,'visualViewport',{configurable:true,value:viewport});
      });
      await page.goto(base+'import-final-audit-v267.html?mode=products&lang=ar',{waitUntil:'networkidle'});
      await page.getByRole('button',{name:'استيراد',exact:true}).click();
      await page.locator('.product-import-file-input').setInputFiles({name:'products.csv',mimeType:'text/csv',buffer:Buffer.from('SKU,Product Name,Selling Price,Purchase Cost\nMX-1,Premium Coffee,12.50,8.25')});
      await page.getByLabel('إجراءات الاستيراد').getByRole('button',{name:'مراجعة الاستيراد'}).click();
      const metrics=await page.evaluate(()=>{
        const row=document.querySelector('.product-import-table tbody tr');
        const actions=document.querySelector('.product-import-mobile-actions').getBoundingClientRect();
        return {viewport:innerWidth,scrollWidth:document.documentElement.scrollWidth,row:row.getBoundingClientRect().toJSON(),cells:[...row.cells].map(c=>({label:c.dataset.label,text:c.innerText,width:c.getBoundingClientRect().width})),actions:actions.toJSON(),height:visualViewport.height};
      });
      assert.ok(metrics.scrollWidth<=321);
      assert.ok(metrics.row.width<=320);
      assert.equal(metrics.cells.length,8,'review retains all financial and source detail columns');
      assert.ok(metrics.cells.every(c=>c.label&&c.width<=320));
      assert.ok(metrics.cells.some(c=>c.text.includes('12.50 USD')));
      assert.ok(metrics.cells.some(c=>c.text.includes('8.25 USD')));
      assert.ok(metrics.actions.bottom<=metrics.height+1,'review actions stay in visible viewport');
      await page.screenshot({path:`${output}/import-${engine.name()}-320-ar.png`,fullPage:false,animations:'disabled'});
      for(const height of [190,620]){
        await page.evaluate(height=>{window.batch1Viewport.height=height;window.batch1Viewport.offsetTop=height===190?20:0;visualViewport.dispatchEvent(new Event('resize'));},height);
        const geometry=await page.locator('.modal').evaluate(e=>({rect:e.getBoundingClientRect().toJSON(),height:visualViewport.height,offset:visualViewport.offsetTop}));
        assert.ok(geometry.rect.top>=geometry.offset-1,'keyboard must not hide modal header');
        assert.ok(geometry.rect.bottom<=geometry.height+geometry.offset+1,'modal stays inside keyboard viewport');
        // A visible modal is not proof of a usable action. Exercise the actual
        // nested scroll owner at both ends while the keyboard consumes space.
        for(const edge of ['start','end']){
          await page.locator('.modal-body').evaluate((element,edge)=>{
            element.scrollTop=edge==='start'?0:element.scrollHeight;
          },edge);
          const actionGeometry=await page.getByLabel('إجراءات الاستيراد').getByRole('button',{name:'تأكيد استيراد 1'}).evaluate(element=>{
            const rect=element.getBoundingClientRect();
            const body=element.closest('.modal-body').getBoundingClientRect();
            return {top:rect.top,bottom:rect.bottom,height:rect.height,bodyTop:body.top,bodyBottom:body.bottom,viewportTop:visualViewport.offsetTop,viewportBottom:visualViewport.offsetTop+visualViewport.height};
          });
          assert.ok(actionGeometry.height>=44,'keyboard must not shrink the touch target');
          assert.ok(actionGeometry.top>=Math.max(actionGeometry.bodyTop,actionGeometry.viewportTop)-1,`${engine.name()} ${height} ${edge}: confirm clipped above scroll owner`);
          assert.ok(actionGeometry.bottom<=Math.min(actionGeometry.bodyBottom,actionGeometry.viewportBottom)+1,`${engine.name()} ${height} ${edge}: confirm clipped below visible scroll owner`);
          await page.getByLabel('إجراءات الاستيراد').getByRole('button',{name:'تأكيد استيراد 1'}).click({trial:true});
        }
      }
      await page.evaluate(()=>{window.batch1Viewport.height=190;window.batch1Viewport.offsetTop=20;visualViewport.dispatchEvent(new Event('resize'));});
      await page.getByLabel('إجراءات الاستيراد').getByRole('button',{name:'تأكيد استيراد 1'}).click();
      await page.getByLabel('إجراءات الاستيراد').getByRole('button',{name:'تم',exact:true}).click();
      assert.equal(await page.evaluate(()=>window.importAttempts),1,'keyboard confirmation saves exactly once');
      assert.equal(await page.evaluate(()=>window.productState().length),1,'confirmed record survives modal close');
      assert.equal(await page.evaluate(()=>document.body.style.overflow),'','close releases body scroll');
      results.push({engine:engine.name(),import:metrics});
    }finally{await browser.close();}
  }
  writeFileSync(`${output}/report.json`,JSON.stringify(results,null,2));
  console.log('Batch 1 responsive Documents + phone import QA passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
