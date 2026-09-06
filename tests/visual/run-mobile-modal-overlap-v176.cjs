const { chromium } = require('playwright');

const baseUrl='http://127.0.0.1:4173/tests/visual/mobile-modal-overlap-v176.html';
const cases=[
  {width:320,height:568,label:'small phone'},
  {width:360,height:640,label:'android phone'},
  {width:390,height:844,label:'iPhone portrait'},
  {width:430,height:932,label:'large phone'},
  {width:720,height:900,label:'phone breakpoint'},
  {width:844,height:390,label:'phone landscape'}
];

const inside=(box,viewport,tolerance=.75)=>box.left>=-tolerance&&box.top>=-tolerance&&box.right<=viewport.width+tolerance&&box.bottom<=viewport.height+tolerance;

(async()=>{
  const browser=await chromium.launch({headless:true});
  const failures=[];
  try{
    for(const scenario of cases){
      const page=await browser.newPage({viewport:{width:scenario.width,height:scenario.height}});
      await page.goto(baseUrl,{waitUntil:'networkidle'});
      await page.waitForTimeout(60);
      const result=await page.evaluate(()=>{
        const box=selector=>{
          const el=document.querySelector(selector);
          if(!el)return null;
          const r=el.getBoundingClientRect();
          const style=getComputedStyle(el);
          return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height,display:style.display,visibility:style.visibility,opacity:Number(style.opacity||'1'),position:style.position,zIndex:Number(style.zIndex||'0'),overflowY:style.overflowY};
        };
        return {
          viewport:{width:innerWidth,height:innerHeight},
          scrollWidth:document.documentElement.scrollWidth,
          backdrop:box('[data-testid="backdrop"]'),
          modal:box('.modal.modal-sm'),
          header:box('.modal-header'),
          body:box('.modal-body'),
          footer:box('.modal-footer'),
          cancel:box('[data-cancel]'),
          del:box('[data-delete]'),
          sheet:box('.mobile-document-action-portal')
        };
      });
      const prefix=`${scenario.label} ${scenario.width}x${scenario.height}`;
      const visible=b=>b&&b.display!=='none'&&b.visibility!=='hidden'&&b.opacity>0&&b.width>0&&b.height>0;
      for(const key of ['backdrop','modal','header','body','footer','cancel','del'])if(!visible(result[key]))failures.push(`${prefix}: ${key} is not visible`);
      if(result.modal&&!inside(result.modal,result.viewport))failures.push(`${prefix}: modal escapes viewport ${JSON.stringify(result.modal)}`);
      if(result.footer&&!inside(result.footer,result.viewport))failures.push(`${prefix}: footer escapes viewport ${JSON.stringify(result.footer)}`);
      if(result.del&&!inside(result.del,result.viewport))failures.push(`${prefix}: Delete action escapes viewport ${JSON.stringify(result.del)}`);
      if(result.cancel&&!inside(result.cancel,result.viewport))failures.push(`${prefix}: Cancel action escapes viewport ${JSON.stringify(result.cancel)}`);
      if(result.del&&result.del.height<44)failures.push(`${prefix}: Delete touch target is ${result.del.height}px (<44px)`);
      if(result.cancel&&result.cancel.height<44)failures.push(`${prefix}: Cancel touch target is ${result.cancel.height}px (<44px)`);
      if(result.header&&result.body&&result.header.bottom>result.body.top+.75)failures.push(`${prefix}: header overlaps scroll body`);
      if(result.body&&result.footer&&result.body.bottom>result.footer.top+.75)failures.push(`${prefix}: scroll body overlaps footer`);
      if(result.scrollWidth>result.viewport.width+1)failures.push(`${prefix}: horizontal overflow ${result.scrollWidth}px > ${result.viewport.width}px`);
      if(result.backdrop&&result.sheet&&result.backdrop.zIndex<=result.sheet.zIndex)failures.push(`${prefix}: modal layer z-index ${result.backdrop.zIndex} is not above action portal ${result.sheet.zIndex}`);
      if(scenario.height<=390&&result.body&&result.body.overflowY!=='auto')failures.push(`${prefix}: short landscape modal body is not the scroll owner`);
      await page.close();
    }
  }finally{
    await browser.close();
  }
  if(failures.length){console.error(JSON.stringify({caseCount:cases.length,failures},null,2));process.exit(1);}
  console.log(JSON.stringify({caseCount:cases.length,failures:0},null,2));
})().catch(error=>{console.error(error);process.exit(1);});
