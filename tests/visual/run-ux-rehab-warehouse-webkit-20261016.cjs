const {webkit}=require('playwright');
const assert=require('node:assert/strict');
const {mkdirSync}=require('node:fs');

const out='visual-qa-output/ux-rehab-warehouse-webkit';
const cases=[
 {width:320,height:700,lang:'ar',theme:'dark'},
 {width:390,height:844,lang:'en',theme:'dark'},
 {width:430,height:932,lang:'ar',theme:'light'},
 {width:1280,height:900,lang:'en',theme:'light'},
];
(async()=>{
 mkdirSync(out,{recursive:true});
 const browser=await webkit.launch({headless:true});
 try{
  for(const c of cases){
   const page=await browser.newPage({viewport:{width:c.width,height:c.height},hasTouch:c.width<700,isMobile:c.width<700});
   const key=[c.width,c.lang,c.theme].join('-');
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   try{
    await page.goto('http://127.0.0.1:4173/tests/visual/ux-rehab-warehouse-20261016.html?lang='+c.lang+'&theme='+c.theme,{waitUntil:'load',timeout:30000});
    await page.locator('.lx-warehouse-page').waitFor({timeout:12000});
    assert.equal(await page.locator('.lx-location-card').count(),3,'three synthetic warehouses '+key);
    assert.equal(await page.locator('.lx-location-status.is-active').count(),2,'active locations '+key);
    assert.equal(await page.locator('.lx-location-status.is-inactive').count(),1,'archived location '+key);
    const stats=await page.evaluate(()=>{
     const cards=[...document.querySelectorAll('.lx-location-card')];
     const outer=document.documentElement;
     const controls=[...document.querySelectorAll('.lx-warehouse-page input,.lx-warehouse-page select,.lx-warehouse-page textarea')];
     const table=document.querySelector('.lx-warehouse-balances-scroll');
     const rect=table.getBoundingClientRect();
     return{
      horizontalOverflow:outer.scrollWidth-window.innerWidth,
      scroller:{width:rect.width,right:rect.right,client:table.clientWidth,scroll:table.scrollWidth,overflow:getComputedStyle(table).overflowX},
      cardColors:cards.map(el=>({color:getComputedStyle(el).color,background:getComputedStyle(el).backgroundColor,opacity:getComputedStyle(el).opacity})),
      controls:controls.map(el=>({height:el.getBoundingClientRect().height,font:parseFloat(getComputedStyle(el).fontSize)})),
      labels:[...document.querySelectorAll('.lx-location-status')].map(el=>el.textContent.trim()),
      dir:outer.dir,
     };
    });
    assert.ok(stats.horizontalOverflow<=1,'page must not overflow horizontally '+key+' '+JSON.stringify(stats));
    assert.ok(stats.cardColors.every(v=>v.opacity==='1'),'archived card must remain legible '+key);
    assert.ok(stats.cardColors.every(v=>v.background!=='rgba(0, 0, 0, 0)'),'cards need explicit opaque surfaces '+key);
    assert.ok(stats.controls.every(v=>v.height>=43.5),'touch-sized controls '+key+' '+JSON.stringify(stats.controls));
    if(c.width<=430){
     assert.equal(stats.dir,c.lang==='ar'?'rtl':'ltr');
     assert.ok(stats.controls.every(v=>v.font>=16),'iPhone form zoom avoidance '+key);
     assert.ok(stats.scroller.scroll>stats.scroller.client,'warehouse table must scroll internally '+key+' '+JSON.stringify(stats.scroller));
    }
    assert.equal(errors.length,0,'console errors '+key+' '+JSON.stringify(errors));
    await page.screenshot({path:out+'/'+key+'.png',animations:'disabled',fullPage:true});
    console.log('PASS WebKit warehouse mobile UX',key);
   }finally{await page.close();}
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
