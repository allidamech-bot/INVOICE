const {chromium}=require('playwright');
const fs=require('node:fs');
const path=require('node:path');

(async()=>{
  const browser=await chromium.launch({headless:true});
  const output=path.resolve('visual-qa-output/inventory-planning-batch7');
  fs.mkdirSync(output,{recursive:true});
  const cases=[
    {name:'mobile-en',width:390,height:844,url:'http://127.0.0.1:4173/tests/visual/inventory-planning-batch7.html'},
    {name:'mobile-ar-rtl',width:430,height:932,url:'http://127.0.0.1:4173/tests/visual/inventory-planning-batch7.html?rtl=1'},
    {name:'mobile-dark',width:393,height:852,url:'http://127.0.0.1:4173/tests/visual/inventory-planning-batch7.html?dark=1'},
    {name:'desktop-en',width:1440,height:1000,url:'http://127.0.0.1:4173/tests/visual/inventory-planning-batch7.html'}
  ];
  try{
    for(const item of cases){
      const page=await browser.newPage({viewport:{width:item.width,height:item.height}});
      const errors=[];
      page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
      page.on('pageerror',error=>errors.push(error.message));
      await page.goto(item.url,{waitUntil:'networkidle'});
      await page.locator('.lx-inventory-planning').waitFor({state:'visible'});
      const result=await page.evaluate(()=>{
        const root=document.documentElement;
        const rows=[...document.querySelectorAll('.lx-inventory-plan-row')];
        const buttons=[...document.querySelectorAll('button')];
        const heading=document.querySelector('.lx-inventory-plan-heading h2');
        const overflow=root.scrollWidth-window.innerWidth;
        const shortButtons=buttons.map(button=>({text:(button.textContent||'').trim(),height:button.getBoundingClientRect().height})).filter(row=>row.height<43.5);
        return{overflow,rowCount:rows.length,shortButtons,heading:(heading?.textContent||'').trim(),dir:root.dir};
      });
      if(result.overflow>1)throw new Error(`${item.name}: horizontal overflow ${result.overflow}px`);
      if(result.rowCount<2)throw new Error(`${item.name}: planning rows missing`);
      if(result.shortButtons.length)throw new Error(`${item.name}: touch targets below 44px: ${JSON.stringify(result.shortButtons)}`);
      if(item.name.includes('rtl')&&result.dir!=='rtl')throw new Error(`${item.name}: RTL direction missing`);
      if(!result.heading)throw new Error(`${item.name}: heading missing`);
      if(errors.length)throw new Error(`${item.name}: browser errors: ${errors.join(' | ')}`);
      await page.screenshot({path:path.join(output,`${item.name}.png`),fullPage:true});
      await page.close();
    }
  }finally{await browser.close();}
  console.log('Batch 7 inventory planning responsive browser QA passed.');
})().catch(error=>{console.error(error);process.exit(1);});
