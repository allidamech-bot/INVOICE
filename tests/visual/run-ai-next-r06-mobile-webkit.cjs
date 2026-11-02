/**
 * WebKit on iPhone-sized viewport != physical iPhone Safari acceptance.
 * Executes only the test-only R06 bundle, no active AI Next routes.
 */
const {webkit}=require('playwright');
const assert=require('node:assert/strict');
const origin='http://127.0.0.1:4173';
const arabic='خلي العميل شركة النور، وبدي عرض سعر 12 قطع × 20 USD — test ٢٥';
(async()=>{
  const browser=await webkit.launch({headless:true});
  try{
    for(const width of [320,390,430]){
      const context=await browser.newContext({viewport:{width,height:844},
        isMobile:true,hasTouch:true,deviceScaleFactor:3,locale:'ar-SA'});
      const page=await context.newPage();
      const remote=[];
      page.on('request',request=>{
        if(!request.url().startsWith(origin+'/'))remote.push(request.url());
      });
      try{
        await page.goto(origin+'/.tmp/ai-next-r06-mobile/index.html',
          {waitUntil:'networkidle'});
        const app=page.getByRole('main',{name:'LOUREX AI Next Generation'});
        await app.waitFor({state:'visible'});
        assert.equal(await page.getByRole('heading',{name:'LOUREX AI'}).count(),1);
        const composer=page.getByRole('textbox',{name:'رسالتك إلى LOUREX AI'});
        const metrics=await composer.evaluate(el=>({
          font:parseFloat(getComputedStyle(el).fontSize),
          width:document.documentElement.scrollWidth,
          viewport:window.innerWidth,dir:el.dir,
          zoom:window.visualViewport?.scale??1,
        }));
        assert.ok(metrics.font>=16,'iPhone focus-zoom prevention requires 16px');
        assert.equal(metrics.dir,'auto');
        assert.ok(metrics.width<=metrics.viewport+2,
          'R06 creates horizontal overflow at '+width+'px: '+JSON.stringify(metrics));
        await composer.tap();
        await composer.fill(arabic);
        assert.equal(await composer.inputValue(),arabic);
        await page.getByRole('button',{name:'إرسال'}).click();
        await page.waitForFunction(()=>globalThis.__qa.sent.length===1);
        assert.deepEqual(await page.evaluate(()=>globalThis.__qa.sent[0]),{
          text:arabic,mode:'controller',sourceIds:[],
        });
        assert.equal(await composer.inputValue(),'');
        await page.getByRole('article').first().waitFor({state:'visible'});
        assert.equal(await page.getByRole('article').count(),2);

        // A rejected acknowledgement retains the entire source text.
        await page.evaluate(()=>{globalThis.__qa.failNext=true;});
        const failed='بدي تعديل السعر 24 دولار — لا تحفظ الفاتورة';
        await composer.fill(failed);
        await page.getByRole('button',{name:'إرسال'}).click();
        await page.getByRole('alert').filter({hasText:'لم يُؤكد'}).waitFor();
        assert.equal(await composer.inputValue(),failed);
        await page.getByRole('button',{name:'إرسال'}).click();
        await page.waitForFunction(()=>globalThis.__qa.sent.length===3);
        assert.equal(await composer.inputValue(),'');
        assert.equal(await page.getByRole('article').count(),4);

        // Short mobile height: composer remains focusable and reachable.
        await page.setViewportSize({width,height:380});
        await composer.scrollIntoViewIfNeeded();
        await composer.tap();
        const focus=await composer.evaluate(el=>({
          active:document.activeElement===el,
          rect:el.getBoundingClientRect().toJSON(),
          innerHeight:innerHeight,scrollWidth:document.documentElement.scrollWidth,
        }));
        assert.equal(focus.active,true);
        assert.ok(focus.rect.height>40,'composer touch target too small');
        assert.ok(focus.scrollWidth<=width+2,'horizontal overflow after shrink');

        // 95 messages are initially windowed at 80, with explicit older load.
        await page.evaluate(()=>globalThis.__qa.seedMessages(95));
        await page.waitForFunction(()=>document.querySelectorAll('article').length===80);
        await page.getByRole('button',{name:'إظهار رسائل أقدم'}).click();
        await page.waitForFunction(()=>document.querySelectorAll('article').length===95);
        assert.equal(await page.getByRole('article').count(),95);

        // File picker callback is disabled in this isolated host; never claim upload.
        await page.getByLabel('إضافة ملفات').setInputFiles({
          name:'synthetic.csv',mimeType:'text/csv',buffer:Buffer.from('x,y\n1,2\n'),
        });
        await page.getByRole('alert').filter({hasText:'لم يُؤكد رفع الملفات'}).waitFor();
        assert.equal(await page.evaluate(()=>globalThis.__qa.uploadAttempts),1);
        assert.deepEqual(remote,[],'browser unexpectedly sent external requests');
        console.log('R06 isolated WebKit mobile '+width+'px PASS');
      }finally{
        await context.close();
      }
    }
  }finally{
    await browser.close();
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
