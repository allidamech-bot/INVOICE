const {chromium,webkit}=require('playwright');
const assert=require('node:assert/strict');
const {mkdirSync,writeFileSync}=require('node:fs');
const path=require('node:path');

const base='http://127.0.0.1:4173/tests/visual/template-visual-qa.html';
const output=path.resolve('visual-qa-output/document-design-final-deep/all-template-auto');
mkdirSync(output,{recursive:true});

const templates=['executive','minimal','trade','signature','obsidian','cobalt','editorial','split','prism','slate','horizon','mono','aurora','ledger','noir','midnight','blackivory','carbon'];

function parseColor(value){
  const match=String(value||'').match(/rgba?\(([^)]+)\)/i);
  if(!match)return null;
  const parts=match[1].split(',').map(part=>Number.parseFloat(part.trim()));
  if(parts.length<3||parts.slice(0,3).some(Number.isNaN))return null;
  return {r:parts[0],g:parts[1],b:parts[2],a:Number.isFinite(parts[3])?parts[3]:1};
}
function linear(v){v/=255;return v<=.04045?v/12.92:Math.pow((v+.055)/1.055,2.4);}
function luminance(c){return .2126*linear(c.r)+.7152*linear(c.g)+.0722*linear(c.b);}
function contrast(a,b){const l1=luminance(a),l2=luminance(b);return (Math.max(l1,l2)+.05)/(Math.min(l1,l2)+.05);}

async function inspect(page,template){
  await page.goto(`${base}?template=${template}&language=en&items=4&mode=desktop&palette=auto&textScale=normal`,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>document.documentElement.dataset.ready==='true');
  await page.waitForFunction(()=>document.querySelector('.invoice-pages')?.dataset.paginationReady==='true');
  await page.evaluate(()=>document.fonts?.ready);
  const result=await page.evaluate(()=>{
    const rgba=value=>{
      const match=String(value||'').match(/rgba?\(([^)]+)\)/i);
      if(!match)return null;
      const p=match[1].split(',').map(x=>Number.parseFloat(x.trim()));
      return p.length>=3?{r:p[0],g:p[1],b:p[2],a:Number.isFinite(p[3])?p[3]:1}:null;
    };
    const mix=(fg,bg)=>({r:fg.r*fg.a+bg.r*(1-fg.a),g:fg.g*fg.a+bg.g*(1-fg.a),b:fg.b*fg.a+bg.b*(1-fg.a),a:1});
    const background=el=>{
      let node=el;
      let bg={r:255,g:255,b:255,a:1};
      const chain=[];
      while(node instanceof Element){chain.push(node);node=node.parentElement;}
      for(let i=chain.length-1;i>=0;i--){
        const c=rgba(getComputedStyle(chain[i]).backgroundColor);
        if(c&&c.a>0)bg=c.a>=.999?c:mix(c,bg);
      }
      return bg;
    };
    const textColor=el=>{
      const css=getComputedStyle(el);
      const fill=rgba(css.webkitTextFillColor);
      const color=rgba(css.color);
      return fill&&fill.a>0?fill:color;
    };
    const sample=(name,selector)=>{
      const el=document.querySelector(selector);
      if(!(el instanceof HTMLElement)||!el.getClientRects().length)return {name,missing:true};
      const css=getComputedStyle(el);
      return {name,selector,color:textColor(el),background:background(el),fontSize:parseFloat(css.fontSize)||0,text:(el.textContent||'').trim().slice(0,80)};
    };
    const sheet=document.querySelector('.invoice-page');
    const td=document.querySelector('.items-table tbody td');
    const tdCss=td?getComputedStyle(td):null;
    return {
      template:sheet?.dataset.template||'',
      tone:sheet?.dataset.tone||'',
      samples:[
        sample('party-name','.party-block .party-name'),
        sample('table-header','.items-table thead th'),
        sample('table-body','.items-table tbody td'),
        sample('term-label','.terms-block .term-row>b'),
        sample('term-value','.terms-block .term-row>span'),
        sample('totals-label','.totals-block span'),
        sample('totals-value','.totals-block strong'),
        sample('footer','.doc-footer')
      ],
      rowBorder:tdCss?{color:rgba(tdCss.borderBottomColor),width:parseFloat(tdCss.borderBottomWidth)||0,style:tdCss.borderBottomStyle,background:background(td)}:null,
      overflow:sheet?{x:sheet.scrollWidth-sheet.clientWidth,y:sheet.scrollHeight-sheet.clientHeight}:{x:999,y:999},
      pageCount:document.querySelectorAll('.invoice-page').length
    };
  });
  await page.locator('.invoice-page').first().screenshot({path:path.join(output,`${template}.png`),animations:'disabled'});
  return result;
}

(async()=>{
  const report=[];
  const failures=[];
  const check=(condition,message)=>{if(!condition)failures.push(message);};
  for(const [engine,browserType] of [['chromium',chromium],['webkit',webkit]]){
    const browser=await browserType.launch({headless:true});
    try{
      const page=await browser.newPage({viewport:{width:1440,height:1280}});
      for(const template of templates){
        const row=await inspect(page,template);
        check(row.template===template,`${engine}/${template}: template mismatch (${row.template})`);
        check(row.pageCount>=1,`${engine}/${template}: no rendered page`);
        check(row.overflow.x<=2&&row.overflow.y<=2,`${engine}/${template}: A4 overflow ${JSON.stringify(row.overflow)}`);
        for(const sample of row.samples){
          if(sample.missing)continue;
          const fg=sample.color,bg=sample.background;
          if(!(fg&&bg)){failures.push(`${engine}/${template}/${sample.name}: color could not be resolved`);continue;}
          const ratio=contrast(fg,bg);
          sample.contrast=ratio;
          check(ratio>=3.8,`${engine}/${template}/${sample.name}: contrast ${ratio.toFixed(2)} is too low for visible client PDF text`);
        }
        if(row.rowBorder&&row.rowBorder.width>0&&row.rowBorder.style!=='none'&&row.rowBorder.color){
          const ratio=contrast(row.rowBorder.color,row.rowBorder.background);
          row.rowBorder.contrast=ratio;
          check(ratio>=1.22,`${engine}/${template}: item-row separator contrast ${ratio.toFixed(2)} is effectively invisible`);
        }
        report.push({engine,...row});
      }
    }finally{await browser.close();}
  }
  writeFileSync(path.join(output,'report.json'),JSON.stringify({templates,caseCount:report.length,failures,report},null,2));
  if(failures.length)throw new Error(`All-template Auto contrast QA found ${failures.length} issue(s):\n- ${failures.join('\n- ')}`);
  console.log(`All-template Auto contrast QA passed: ${report.length} browser/template cases.`);
})().catch(error=>{console.error(error);process.exit(1);});
