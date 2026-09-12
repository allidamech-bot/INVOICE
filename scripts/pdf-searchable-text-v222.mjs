import { mkdir, readFile, writeFile } from 'node:fs/promises';

const FONT_TARGET='dist/vendor/lourex-search-amiri.ttf';
const LICENSE_TARGET='dist/vendor/lourex-search-amiri-OFL.txt';
const FONT_URLS=[
  'https://raw.githubusercontent.com/google/fonts/main/ofl/amiri/Amiri-Regular.ttf',
  'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/amiri/Amiri-Regular.ttf'
];
const LICENSE_URLS=[
  'https://raw.githubusercontent.com/google/fonts/main/ofl/amiri/OFL.txt',
  'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/amiri/OFL.txt'
];

async function downloadFirst(urls,target,minBytes){
  let lastError;
  for(const url of urls){
    try{
      const response=await fetch(url,{redirect:'follow'});
      if(!response.ok)throw new Error(`${response.status} ${response.statusText}`);
      const data=Buffer.from(await response.arrayBuffer());
      if(data.length<minBytes)throw new Error(`Unexpectedly small payload (${data.length} bytes)`);
      await writeFile(target,data);
      return;
    }catch(error){lastError=error;}
  }
  throw new Error(`Unable to vendor searchable PDF font asset ${target}: ${lastError instanceof Error?lastError.message:String(lastError)}`);
}

await mkdir('dist/vendor',{recursive:true});
await Promise.all([
  downloadFirst(FONT_URLS,FONT_TARGET,100000),
  downloadFirst(LICENSE_URLS,LICENSE_TARGET,3000)
]);

const helper=`
;(function installLourexSearchablePdfTextLayer(){
  const bridgeScript=Array.from(document.scripts).map(script=>script.src).find(src=>/\\/ios-print-bridge\\.js(?:$|[?#])/.test(src));
  const FONT_URL=new URL('./vendor/lourex-search-amiri.ttf',bridgeScript||document.baseURI).href;
  const FONT_FILE='lourex-search-amiri.ttf';
  const FONT_NAME='LOUREXSearchText';
  let fontBase64Promise=null;
  const arabicShapingDisabled=new WeakSet();

  const bufferToBase64=(buffer)=>{
    const bytes=new Uint8Array(buffer);
    let binary='';
    const chunk=0x8000;
    for(let offset=0;offset<bytes.length;offset+=chunk){
      binary+=String.fromCharCode(...bytes.subarray(offset,Math.min(offset+chunk,bytes.length)));
    }
    return btoa(binary);
  };

  const loadFontBase64=()=>{
    if(fontBase64Promise)return fontBase64Promise;
    fontBase64Promise=fetch(FONT_URL,{cache:'force-cache'})
      .then(response=>{if(!response.ok)throw new Error('Searchable PDF font unavailable.');return response.arrayBuffer();})
      .then(bufferToBase64);
    return fontBase64Promise;
  };

  const ensurePdfFont=async(pdf)=>{
    const fontList=pdf.getFontList?.()||{};
    if(Array.isArray(fontList[FONT_NAME])&&fontList[FONT_NAME].includes('normal'))return;
    const fontBase64=await loadFontBase64();
    pdf.addFileToVFS(FONT_FILE,fontBase64);
    pdf.addFont(FONT_FILE,FONT_NAME,'normal');
  };

  const disableAutomaticArabicPresentationForms=(pdf)=>{
    if(arabicShapingDisabled.has(pdf))return;
    const events=pdf.internal?.events;
    const topics=events?.getTopics?.();
    const subscribers=topics?.preProcessText||{};
    const arabicProcessor=pdf.processArabic;
    if(typeof arabicProcessor==='function'){
      for(const [token,subscription] of Object.entries(subscribers)){
        const callback=Array.isArray(subscription)?subscription[0]:null;
        if(callback===arabicProcessor)events.unsubscribe(token);
      }
    }
    arabicShapingDisabled.add(pdf);
  };

  const normalizedText=(value)=>String(value||'').replace(/\\s+/g,' ').trim();
  const textRunsForPage=(page)=>{
    const pageRect=page.getBoundingClientRect();
    if(!pageRect.width||!pageRect.height)return [];
    const runs=[];
    const walker=document.createTreeWalker(page,NodeFilter.SHOW_TEXT,{acceptNode(node){
      const text=normalizedText(node.nodeValue);
      if(!text)return NodeFilter.FILTER_REJECT;
      const parent=node.parentElement;
      if(!parent||parent.closest('script,style,noscript'))return NodeFilter.FILTER_REJECT;
      const style=getComputedStyle(parent);
      if(style.display==='none'||style.visibility==='hidden'||Number.parseFloat(style.opacity||'1')===0)return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }});
    while(walker.nextNode()){
      const node=walker.currentNode;
      const text=normalizedText(node.nodeValue);
      if(!text)continue;
      const parent=node.parentElement;
      if(!parent)continue;
      const range=document.createRange();
      range.selectNodeContents(node);
      const rect=range.getBoundingClientRect();
      range.detach?.();
      if(!rect.width||!rect.height)continue;
      const style=getComputedStyle(parent);
      const fontPx=Math.max(6,Number.parseFloat(style.fontSize)||12);
      const x=(rect.left-pageRect.left)/pageRect.width*210;
      const y=(rect.top-pageRect.top+Math.min(rect.height*0.82,fontPx*0.92))/pageRect.height*297;
      const width=Math.max(0.5,rect.width/pageRect.width*210);
      const fontPt=Math.min(42,Math.max(4,fontPx*0.75));
      if(x<-1||y<-1||x>211||y>298)continue;
      runs.push({text,x:Math.max(0,x),y:Math.max(0,y),width,fontPt});
    }
    return runs;
  };

  window.__LOUREX_ADD_SEARCHABLE_TEXT_LAYER__=async(pdf,page)=>{
    await ensurePdfFont(pdf);
    disableAutomaticArabicPresentationForms(pdf);
    pdf.setFont(FONT_NAME,'normal');
    pdf.setR2L?.(false);
    for(const run of textRunsForPage(page)){
      pdf.setFontSize(run.fontPt);
      pdf.text(run.text,run.x,run.y,{renderingMode:'invisible',lineHeightFactor:1});
    }
  };
})();
`;

const bridgePath='dist/ios-print-bridge.js';
let bridge=await readFile(bridgePath,'utf8');
const imageLine="          pdf.addImage(canvas.toDataURL('image/jpeg',0.94),'JPEG',0,0,210,297,undefined,'FAST');";
const mediaLine='          await addSharpMedia(pdf,sharpMedia);';
const injection=`${imageLine}\n          try { await window.__LOUREX_ADD_SEARCHABLE_TEXT_LAYER__?.(pdf,page); } catch { /* Preserve the existing image PDF if text-layer preparation fails. */ }\n${mediaLine}`;
if(!bridge.includes(`${imageLine}\n${mediaLine}`))throw new Error('Unable to locate LOUREX PDF image insertion point for searchable text layering.');
bridge=helper+'\n'+bridge.replace(`${imageLine}\n${mediaLine}`,injection);
await writeFile(bridgePath,bridge);

const swPath='dist/sw.js';
let sw=await readFile(swPath,'utf8');
const cacheMarker='const LOCAL_CORE = [';
const searchableAssets=['./vendor/lourex-search-amiri.ttf','./vendor/lourex-search-amiri-OFL.txt'];
for(const asset of searchableAssets){
  if(sw.includes(`"${asset}"`)||sw.includes(`'${asset}'`))continue;
  if(!sw.includes(cacheMarker))throw new Error('Unable to locate service-worker core cache for searchable PDF font.');
  sw=sw.replace(cacheMarker,`${cacheMarker}"${asset}",`);
}
await writeFile(swPath,sw);
