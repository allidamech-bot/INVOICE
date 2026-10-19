/* Run after npm run build. Uses local production assets and synthetic documents;
   no sign-in, production data or network server is needed. */
const {chromium,webkit}=require('playwright');
const fs=require('node:fs/promises');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..');
const output=path.resolve(process.env.LOUREX_TEMPLATE_QA_OUTPUT||'/tmp/lourex-template-design-qa');
const templates=['executive','minimal','trade','signature','obsidian','cobalt','editorial','split','prism','slate','horizon','mono','aurora','ledger','noir','midnight','blackivory','carbon'];
async function routeAssets(page){
 await page.route('http://lourex.test/**',async route=>{
  const file=path.resolve(root,'.'+decodeURIComponent(new URL(route.request().url()).pathname));
  if(!file.startsWith(root+path.sep))return route.fulfill({status:403,body:''});
  try{await route.fulfill({body:await fs.readFile(file),contentType:({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.ttf':'font/ttf','.woff2':'font/woff2'})[path.extname(file)]||'application/octet-stream'});}catch{await route.fulfill({status:404,body:''});}
 });
}
async function inspect(page,params){
 await page.goto('http://lourex.test/tests/visual/template-visual-qa.html?'+new URLSearchParams(params));
 await page.waitForFunction(()=>document.querySelector('.invoice-pages')?.dataset.paginationReady==='true',{},{timeout:15000});
 await page.evaluate(()=>document.fonts.ready);
 return page.evaluate(()=>{
  const failures=[];const samples=[];
  const parse=value=>{const m=value.match(/rgba?\(([^)]+)\)/);if(!m)return null;const a=m[1].split(',').map(Number);return [a[0],a[1],a[2],a[3]??1]};
  const lum=c=>c.slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4}).reduce((a,v,i)=>a+v*[.2126,.7152,.0722][i],0);
  const ratio=(a,b)=>{a=lum(a);b=lum(b);return(Math.max(a,b)+.05)/(Math.min(a,b)+.05)};
  const bg=el=>{const chain=[];while(el){chain.unshift(el);el=el.parentElement}let color=[255,255,255,1];for(const e of chain){const css=getComputedStyle(e);const art=e.matches('.document-masthead')?css.getPropertyValue('--art-main'):e.matches('.doc-footer')?css.getPropertyValue('--footer-paper'):e.matches('.lx-document-qr')?css.getPropertyValue('--paper'):'';const c=art.trim()?parse('rgb('+art.trim().replace('#','').match(/../g).map(x=>parseInt(x,16)).join(',')+')'):parse(css.backgroundColor);if(c)color=[...c.slice(0,3).map((v,i)=>v*c[3]+color[i]*(1-c[3])),1]}return color;};
  const sheets=[...document.querySelectorAll('.invoice-page')];
  const brand=sheets[0]?.querySelector('.masthead-brand .doc-logo');
  if(brand){
   const image=brand.querySelector('img'),label=brand.querySelector('.doc-logo-wordmark');
   if(!image?.naturalWidth||!image.naturalHeight)failures.push('company logo did not load');
   else{
    const expected=image.naturalWidth/image.naturalHeight>=2.35?'wordmark':'symbol';
    if(brand.dataset.logoLayout!==expected)failures.push('company logo layout does not match image shape');
    const textVisible=label&&getComputedStyle(label).display!=='none'&&Boolean(label.textContent.trim());
    if(expected==='symbol'&&!textVisible)failures.push('symbol-only logo is missing company name');
    if(expected==='wordmark'&&textVisible)failures.push('embedded wordmark has a duplicate company name');
    if(expected==='symbol'&&textVisible){
     const title=sheets[0].querySelector('.masthead-title'),nameBox=label.getBoundingClientRect(),titleBox=title?.getBoundingClientRect(),logoBox=image.getBoundingClientRect();
     const fontSize=parseFloat(getComputedStyle(label).fontSize),outline=getComputedStyle(image).filter;
     if(fontSize<12)failures.push('symbol-only logo company name is too small');
     if(logoBox.width<35||logoBox.height<35)failures.push('symbol-only logo is too small to recognize');
     if(label.scrollHeight>label.clientHeight+2||label.scrollWidth>label.clientWidth+2)failures.push('company wordmark clipped');
     if(titleBox&&nameBox.left<titleBox.right-1&&nameBox.right>titleBox.left+1&&nameBox.top<titleBox.bottom-1&&nameBox.bottom>titleBox.top+1)failures.push('company identity overlaps document title');
     if(!outline.includes('drop-shadow'))failures.push('transparent symbol has no shape-following contrast support');
     if(getComputedStyle(brand).backgroundColor!=='rgba(0, 0, 0, 0)')failures.push('unexpected rectangle behind transparent logo');
    }
   }
  }
  for(const [index,sheet] of sheets.entries()){
   const b=sheet.getBoundingClientRect(),footer=sheet.querySelector('.doc-footer').getBoundingClientRect();
   if(sheet.scrollWidth>sheet.clientWidth+2||sheet.scrollHeight>sheet.clientHeight+2)failures.push(`page ${index+1}: A4 overflow`);
   for(const el of sheet.querySelectorAll('.doc-body *,.doc-meta *,.doc-title,.doc-title>span,.doc-logo img,.signature-media img')){
    const r=el.getBoundingClientRect(),css=getComputedStyle(el);
    if(!r.width||!r.height||css.display==='none')continue;
    if(r.left<b.left-1||r.right>b.right+1||r.top<b.top-1||r.bottom>b.bottom+1)failures.push(`page ${index+1}: ${el.className||el.tagName} outside paper`);
    if(el.closest('.doc-body')&&r.bottom>footer.top-1)failures.push(`page ${index+1}: ${el.className||el.tagName} overlaps footer`);
   }
   for(const a of sheet.querySelectorAll('.doc-title>span,.doc-meta>div>span,.party-name,.party-address,.party-contact,.party-identifiers b,.party-identifiers>div>span,.section-kicker,.items-table th,.items-table td,.term-row>b,.term-row>span,.notes-block p,.bank-block>div>b,.bank-block>div>span,.total-row>span,.total-row>strong,.grand-total>span,.grand-total>strong,.doc-footer>span')){
    if(!a.getClientRects().length||!a.textContent.trim())continue;
    const css=getComputedStyle(a),ink=parse(css.webkitTextFillColor)||parse(css.color),background=bg(a);
    // Authored SVG backgrounds use the explicit paired art palette above;
    // pixel placement on curved regions is also inspected in rendered pages.
    const contrast=ratio(ink,background);
    samples.push({role:a.className||a.tagName,contrast,size:parseFloat(css.fontSize)});
    if(contrast<4.5)failures.push(`page ${index+1}: ${a.className||a.tagName} contrast ${contrast.toFixed(2)}`);
   }
   const title=sheet.querySelector('.doc-title');
   if(title){const header=title.closest('header').getBoundingClientRect(),r=title.getBoundingClientRect();if(r.left<header.left-1||r.right>header.right+1||r.top<header.top-1||r.bottom>header.bottom+1)failures.push(`page ${index+1}: title outside header`);}
  }
  const indices=[...document.querySelectorAll('tr[data-source-fragment="0"]')].map(el=>Number(el.dataset.sourceItemIndex));
  const expected=Number(document.querySelector('.invoice-pages').dataset.sourceItemCount);
  if(indices.length!==expected||indices.some((value,index)=>value!==index+1))failures.push('item sequence/count changed');
  if(document.querySelectorAll('.grand-total').length!==1)failures.push('grand total duplicated/missing');
  const total=document.querySelector('.grand-total strong')?.textContent;
  return {failures:[...new Set(failures)],pageCount:sheets.length,total,minContrast:Math.min(...samples.map(x=>x.contrast)),indices};
 });
}
(async()=>{
 await fs.mkdir(output,{recursive:true});const report=[];const engines=(process.env.LOUREX_TEMPLATE_ENGINES||'chromium,webkit').split(',');
 for(const engine of engines){const browser=await({chromium,webkit})[engine].launch({headless:true,...(engine==='webkit'&&process.env.LOUREX_WEBKIT_EXECUTABLE?{executablePath:process.env.LOUREX_WEBKIT_EXECUTABLE}:{})});
 try{const page=await browser.newPage({viewport:{width:1280,height:1400}});await routeAssets(page);
  for(const template of templates){for(const language of ['en','ar','bilingual']){
   for(const profile of ['showcase','stress']){
    const params={template,language,profile,items:profile==='stress'?'24':'4',mode:'print',qr:profile==='showcase'?'true':'false'};
    const result=await inspect(page,params);report.push({engine,...params,...result});
    if(profile==='showcase'&&language==='en')await page.locator('.invoice-page').first().screenshot({path:path.join(output,`${engine}-${template}.png`)});
   }
   const symbol=await inspect(page,{template,language,profile:'showcase',items:'4',mode:'print',logo:'symbol'});
   report.push({engine,template,language,profile:'symbol-logo',...symbol});
   if(language==='en'){
    await page.locator('.invoice-page').first().screenshot({path:path.join(output,`${engine}-${template}-symbol.png`)});
    const lightSymbol=await inspect(page,{template,language,profile:'showcase',items:'4',mode:'print',logo:'symbol-light'});
    report.push({engine,template,language,profile:'light-symbol-logo',...lightSymbol});
    await page.locator('.invoice-page').first().screenshot({path:path.join(output,`${engine}-${template}-light-symbol.png`)});
   }
   const custom=await inspect(page,{template,language,profile:'showcase',items:'4',mode:'mobile',palette:'custom',unsafeColors:'true',textScale:'large'});
   report.push({engine,template,language,profile:'unsafe-custom-mobile',...custom});
  }}
 }finally{await browser.close();}}
 await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));
 const failures=report.filter(r=>r.failures.length);for(const r of failures)console.error(`${r.engine}/${r.template}/${r.language}/${r.profile}: ${r.failures.join('; ')}`);
 assert.equal(failures.length,0,`${failures.length}/${report.length} failed; see ${output}/report.json`);
 console.log(`${report.length} template/language/profile/browser cases passed; no missing rows, unreadable sampled text, A4 overflow or footer overlap.`);
})().catch(e=>{console.error(e);process.exitCode=1;});
