// Regression #797: Safari's virtual keyboard must never reduce the usable
// Settings scrolling region below one full 44px input touch target.
const {webkit,chromium}=require('playwright');
const assert=require('node:assert/strict');

const cases=[
  [webkit,390,'ar'],
  [webkit,320,'en'],
  [chromium,390,'en'],
  [webkit,820,'ar']
];

(async()=>{
  for(const [engine,width,language] of cases){
    const browser=await engine.launch({headless:true});
    try{
      const page=await browser.newPage({viewport:{width,height:844},hasTouch:true,isMobile:width<=390});
      page.setDefaultTimeout(10000);
      await page.addInitScript(()=>{
        const virtual=new EventTarget();
        window.acceptanceViewport={height:620,offsetTop:20};
        for(const key of ['height','offsetTop'])Object.defineProperty(virtual,key,{get:()=>window.acceptanceViewport[key]});
        Object.defineProperty(window,'visualViewport',{configurable:true,value:virtual});
      });
      await page.goto('http://127.0.0.1:4173/tests/visual/obsidian-settings.html?lang='+language+'&scope=settings',{waitUntil:'networkidle'});
      const modal=page.locator('.modal:has(.ta-settings-shell)');
      await modal.waitFor({state:'visible'});
      const tabStrip=modal.locator('.ta-settings-sidebar');
      await tabStrip.waitFor({state:'visible'});
      await modal.locator('[data-settings-tab="documents"]').click();
      const numbering=modal.locator('.ta-settings-card').filter({has:page.locator('.ta-numbering-preview')});
      const prefix=numbering.locator('input').first();
      await prefix.waitFor({state:'visible'});

      // Reproduce a very short Safari keyboard viewport without shrinking touch targets.
      await page.evaluate(()=>{
        window.acceptanceViewport.height=190;
        window.visualViewport.dispatchEvent(new Event('resize'));
      });
      const backdrop=page.locator('.modal-backdrop[data-viewport-compact="true"]:has(.ta-settings-shell)');
      await backdrop.waitFor({state:'visible'});
      assert.equal(await tabStrip.isVisible(),false,engine.name()+' '+width+': tiny-keyboard Settings tabs should yield space to the active form');

      await prefix.evaluate(element=>{
        const pane=element.closest('.ta-settings-content');
        if(!pane)throw Error('Settings scroll owner missing');
        const r=element.getBoundingClientRect();
        const p=pane.getBoundingClientRect();
        const top=Math.max(p.top+2,visualViewport.offsetTop+2);
        const bottom=Math.min(p.bottom-2,visualViewport.offsetTop+visualViewport.height-2);
        pane.scrollTop+=(r.top+r.height/2)-(top+bottom)/2;
      });
      const details=await prefix.evaluate(element=>{
        const field=element.getBoundingClientRect();
        const pane=element.closest('.ta-settings-content')?.getBoundingClientRect();
        const top=visualViewport.offsetTop,bottom=top+visualViewport.height;
        const hit=document.elementFromPoint(field.left+field.width/2,field.top+field.height/2);
        const modal=element.closest('.modal'),backdrop=modal?.closest('.modal-backdrop');
        const body=modal?.querySelector('.modal-body'),shell=modal?.querySelector('.ta-settings-shell');
        const rectOf=x=>x?.getBoundingClientRect().toJSON();
        const styles=x=>x?{display:getComputedStyle(x).display,overflow:getComputedStyle(x).overflow,flex:getComputedStyle(x).flex,maxHeight:getComputedStyle(x).maxHeight,height:getComputedStyle(x).height}:null;
        return{field:field.toJSON(),pane:pane?.toJSON(),viewTop:top,viewBottom:bottom,hit:hit===element,
          layout:{innerWidth,innerHeight,media900:matchMedia('(max-width:900px)').matches,
            backdrop:rectOf(backdrop),modal:rectOf(modal),body:rectOf(body),shell:rectOf(shell),
            modalCss:styles(modal),bodyCss:styles(body),shellCss:styles(shell),paneCss:styles(element.closest('.ta-settings-content'))}};
      });
      const where=engine.name()+'/'+width+'/'+language;
      assert.ok(details.pane,where+': missing Settings scroll owner');
      assert.ok(details.pane.height>=44,where+': Settings pane too short for a 44px field: '+JSON.stringify(details));
      assert.ok(details.field.height>=44,where+': touch target shrank: '+JSON.stringify(details));
      assert.ok(details.field.top>=details.pane.top-1&&details.field.bottom<=details.pane.bottom+1,where+': field clipped by Settings pane: '+JSON.stringify(details));
      assert.ok(details.field.top>=details.viewTop-1&&details.field.bottom<=details.viewBottom+1,where+': field clipped by keyboard: '+JSON.stringify(details));
      assert.ok(details.hit,where+': an overlay intercepts the Settings input: '+JSON.stringify(details));
      await prefix.click({trial:true});
      await prefix.fill('QT');

      // The normal Settings layout and all navigation tabs return as soon as
      // the keyboard is dismissed; no permanent UX redesign or scroll lock.
      await page.evaluate(()=>{
        window.acceptanceViewport.height=620;
        window.visualViewport.dispatchEvent(new Event('resize'));
      });
      await page.waitForFunction(()=>!document.querySelector('.modal-backdrop[data-viewport-compact="true"]'));
      assert.equal(await tabStrip.isVisible(),true,where+': Settings tabs did not return');
      await numbering.getByRole('button').click();
      await page.waitForFunction(()=>window.savedSettings?.numbering?.proformaPrefix==='QT');
      await modal.locator('.modal-header button').click();
      await modal.waitFor({state:'hidden'});
      assert.equal(await page.evaluate(()=>document.body.style.overflow),'',where+': closing Settings did not unlock page scroll');
      console.log('PASS Settings short keyboard / '+where);
    }finally{await browser.close();}
  }
  console.log('Issue #797 compact Settings keyboard: all WebKit/Chromium, phone/tablet and EN/AR cases passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
