const {webkit}=require('playwright');

const baseUrl=process.env.LOUREX_QA_URL||'http://127.0.0.1:4173/tests/visual/template-visual-qa.html';
const templates=['executive','minimal','trade','signature','obsidian','cobalt','editorial','split','prism','slate','horizon','mono','aurora','ledger','noir','midnight','blackivory','carbon'];

function label(el){
  const id=el.id?`#${el.id}`:'';
  const classes=[...el.classList].slice(0,5).map(name=>`.${name}`).join('');
  return `${el.tagName.toLowerCase()}${id}${classes}`;
}

(async()=>{
  const browser=await webkit.launch({headless:true});
  try{
    const context=await browser.newContext({viewport:{width:1440,height:1280},deviceScaleFactor:1});
    const page=await context.newPage();
    for(const template of templates){
      const url=`${baseUrl}?${new URLSearchParams({template,language:'en',items:'1',mode:'desktop'})}`;
      await page.goto(url,{waitUntil:'networkidle'});
      await page.waitForFunction(()=>document.documentElement.dataset.ready==='true');
      await page.evaluate(()=>document.fonts?.ready);
      const result=await page.evaluate(labelSource=>{
        const makeLabel=new Function('el',`return (${labelSource})(el)`);
        const sheet=document.querySelector('.invoice-page');
        if(!sheet)return{overflow:0,offenders:['missing .invoice-page']};
        const bounds=sheet.getBoundingClientRect();
        const overflow=Math.max(0,sheet.scrollWidth-sheet.clientWidth);
        if(overflow<=2)return{overflow,offenders:[]};
        const depth=el=>{let n=0,p=el.parentElement;while(p&&p!==sheet){n+=1;p=p.parentElement;}return n;};
        const offenders=[...sheet.querySelectorAll('*')].map(el=>{
          const r=el.getBoundingClientRect();
          const s=getComputedStyle(el);
          const right=Math.max(0,r.right-bounds.right);
          const left=Math.max(0,bounds.left-r.left);
          const scroll=Math.max(0,el.scrollWidth-el.clientWidth);
          const before=getComputedStyle(el,'::before');
          const after=getComputedStyle(el,'::after');
          const pseudo=[['before',before],['after',after]].filter(([,p])=>p.content&&p.content!=='none'&&p.content!=='normal').map(([which,p])=>`${which}{pos:${p.position},w:${p.width},left:${p.left},right:${p.right},transform:${p.transform}}`);
          return{
            node:makeLabel(el),depth:depth(el),right:Math.round(right),left:Math.round(left),scroll:Math.round(scroll),
            width:Math.round(r.width),clientWidth:el.clientWidth,scrollWidth:el.scrollWidth,
            display:s.display,position:s.position,overflowX:s.overflowX,minWidth:s.minWidth,maxWidth:s.maxWidth,
            whiteSpace:s.whiteSpace,wordBreak:s.wordBreak,overflowWrap:s.overflowWrap,
            gridTemplateColumns:s.gridTemplateColumns,pseudo
          };
        }).filter(item=>item.right>1||item.left>1||item.scroll>2)
          .sort((a,b)=>(b.right+b.left+b.scroll)-(a.right+a.left+a.scroll)||b.depth-a.depth)
          .slice(0,18);
        return{overflow:Math.round(overflow),clientWidth:sheet.clientWidth,scrollWidth:sheet.scrollWidth,offenders};
      },label.toString());
      if(result.overflow>2){
        console.log(`\n[v337-webkit-overflow] ${template}: +${result.overflow}px (${result.clientWidth} -> ${result.scrollWidth})`);
        for(const offender of result.offenders)console.log(JSON.stringify(offender));
      }
    }
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
