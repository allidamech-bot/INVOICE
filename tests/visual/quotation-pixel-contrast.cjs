// Measure the surface at painted glyph locations, including SVGs, alpha and
// gradients. A diagnostic magenta glyph mask finds even invisible white text;
// sampling a parent background or a nearby arbitrary point cannot do that.
async function auditPaintedContrast(page,capture) {
  // Inspect A4 pixels at 1:1; mobile zoom must not clip offscreen glyphs.
  // This changes only the test viewport/zoom, never the document colors.
  const zoom=await page.addStyleTag({content:'.qa-shell{height:auto!important;overflow:visible!important;position:static!important}.qa-stage{width:210mm!important;height:auto!important;max-height:none!important;overflow:visible!important}.qa-stage .invoice-pages{transform:none!important;margin-bottom:0!important}'});
  const inline=await page.evaluate(()=>{const elements=[...document.querySelectorAll('.qa-shell,.qa-stage,.qa-stage .invoice-pages')];return elements.map(el=>{const saved=el.getAttribute('style');if(el.matches('.invoice-pages'))el.style.setProperty('transform','none','important');else{for(const [name,value] of Object.entries({height:'auto','max-height':'none',overflow:'visible',width:'210mm'}))el.style.setProperty(name,value,'important');}return saved;});});
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await page.evaluate(()=>window.scrollTo(0,0));
  const screenshots=new Map();
  const captureSheet=async(sheet,phase)=>{
    const box=await sheet.boundingBox();if(!box)throw new Error('Missing A4 bounds');
    if(!screenshots.has(phase))screenshots.set(phase,(await page.screenshot({fullPage:true,animations:'disabled'})).toString('base64'));
    const cropped=await page.evaluate(async({encoded,box})=>{
      const im=new Image();im.src='data:image/png;base64,'+encoded;await im.decode();
      const c=document.createElement('canvas');c.width=Math.ceil(box.width);c.height=Math.ceil(box.height);
      c.getContext('2d').drawImage(im,box.x,box.y,box.width,box.height,0,0,c.width,c.height);
      return c.toDataURL().split(',')[1];
    },{encoded:screenshots.get(phase),box});
    return Buffer.from(cropped,'base64');
  };
  const results=[];
  for(const [index,sheet] of (await page.locator('.invoice-page').all()).entries()) {
    const texts=await sheet.evaluate(root=>{
      const out=[],origin=root.getBoundingClientRect();
      const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
      while(walker.nextNode()) {
        const node=walker.currentNode,el=node.parentElement;
        if(!node.textContent.trim()||el.closest('svg,[aria-hidden="true"]'))continue;
        const css=getComputedStyle(el),ink=(css.webkitTextFillColor||css.color).match(/[\d.]+/g)?.map(Number);
        if(!ink||css.visibility==='hidden')continue;
        let opacity=ink[3]??1;for(let p=el;p;p=p.parentElement){opacity*=Number(getComputedStyle(p).opacity);if(p===root)break;}
        const large=parseFloat(css.fontSize)>=24||(parseFloat(css.fontSize)>=18.66&&Number(css.fontWeight)>=700);
        // Word ranges prevent an intact word from concealing an absent word
        // elsewhere on a long company-name or description line.
        const words=[];
        for(const token of node.textContent.matchAll(/\S+/gu)){
          if(!/[\p{L}\p{N}]/u.test(token[0])&&words.length){const previous=words[words.length-1];previous.end=token.index+token[0].length;previous.text+=' '+token[0];}
          else words.push({text:token[0],index:token.index,end:token.index+token[0].length});
        }
        for(const word of words){
          const range=document.createRange();range.setStart(node,word.index);range.setEnd(node,word.end);
          for(const r of range.getClientRects())if(r.width&&r.height)out.push({text:word.text,ink:ink.slice(0,3),opacity,required:large?3:4.5,x:r.x-origin.x,y:r.y-origin.y,w:r.width,h:r.height});
        }
      }
      return out;
    });
    const media=capture?await sheet.evaluate(root=>{
      const origin=root.getBoundingClientRect();
      return [...root.querySelectorAll('.doc-logo img,.signature-media img,.lx-document-qr img')].map(el=>{const r=el.getBoundingClientRect();return {name:el.className||el.alt||'Company logo',x:r.x-origin.x-2,y:r.y-origin.y-2,w:r.width+4,h:r.height+4};});
    }):[];
    const original=(await (capture?capture(index,'original'):captureSheet(sheet,'original'))).toString('base64');
    const reference=capture?(await captureSheet(sheet,'original')).toString('base64'):original;
    const hide=await page.addStyleTag({content:'.invoice-page *{color:transparent!important;-webkit-text-fill-color:transparent!important;text-shadow:none!important}'});
    let background,mask;
    try {
      background=(await (capture?capture(index,'background'):captureSheet(sheet,'background'))).toString('base64');
      await hide.evaluate(el=>{el.textContent='.invoice-page *{color:rgb(255,0,255)!important;-webkit-text-fill-color:rgb(255,0,255)!important;text-shadow:none!important}';});
      mask=(await (capture?capture(index,'mask'):captureSheet(sheet,'mask'))).toString('base64');
    } finally {await hide.evaluate(el=>el.remove());}
    results.push(await page.evaluate(async({background,mask,original,reference,texts,media})=>{
      async function pixels(data){const im=new Image();im.src='data:image/png;base64,'+data;await im.decode();const c=document.createElement('canvas');c.width=im.width;c.height=im.height;const x=c.getContext('2d');x.drawImage(im,0,0);return {data:x.getImageData(0,0,c.width,c.height).data,width:c.width,height:c.height};}
      const [bg,m,actual,ref]=await Promise.all([pixels(background),pixels(mask),pixels(original),pixels(reference)]);
      const lum=c=>c.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4}).reduce((a,v,i)=>a+v*[.2126,.7152,.0722][i],0);
      const contrast=(a,b)=>(Math.max(lum(a),lum(b))+.05)/(Math.min(lum(a),lum(b))+.05);
      const failures=[];let minimum=Infinity,samples=0;
      for(const t of texts){let worst=Infinity,count=0,paintedPeak=1,referencePeak=1;
        for(let y=Math.max(0,Math.floor(t.y));y<Math.min(bg.height,t.y+t.h);y++)for(let x=Math.max(0,Math.floor(t.x));x<Math.min(bg.width,t.x+t.w);x++){
          const i=(y*bg.width+x)*4;
          if(Math.max(...[0,1,2].map(k=>Math.abs(m.data[i+k]-bg.data[i+k])))<60)continue;
          const paper=[bg.data[i],bg.data[i+1],bg.data[i+2]],ink=t.ink.map((v,k)=>v*t.opacity+paper[k]*(1-t.opacity));
          worst=Math.min(worst,contrast(ink,paper));count++;
          // The strongest original glyph pixels independently detect missing
          // or washed-out export ink. Edges are antialiased, so a minimum over
          // those pixels would incorrectly reject readable small typography.
          paintedPeak=Math.max(paintedPeak,contrast([actual.data[i],actual.data[i+1],actual.data[i+2]],paper));
          referencePeak=Math.max(referencePeak,contrast([ref.data[i],ref.data[i+1],ref.data[i+2]],paper));
        }
        if(!count)failures.push({text:t.text,contrast:0,required:t.required,reason:'No rendered glyph coverage'});
        else {minimum=Math.min(minimum,worst);samples+=count;if(worst+.01<t.required)failures.push({text:t.text,contrast:worst,required:t.required});}
        // A one/two-character thin glyph has larger pixel-phase variation at 96 DPI.
        const retainedStrength=[...t.text].length<=2?.6:.85;
        if(count&&paintedPeak+.1<referencePeak*retainedStrength)failures.push({text:t.text,contrast:paintedPeak,required:t.required,referencePeak,reason:'Original PDF glyphs are missing or materially weaker than browser glyphs'});
      }
      for(const asset of media){let count=0,different=0;
        for(let y=Math.max(2,Math.ceil(asset.y));y<Math.min(actual.height-2,asset.y+asset.h);y+=2)for(let x=Math.max(2,Math.ceil(asset.x));x<Math.min(actual.width-2,asset.x+asset.w);x+=2){
          const i=(y*ref.width+x)*4;let nearest=Infinity;
          // Small positional tolerance covers raster/JPEG antialiasing, while
          // missing marks, wordmark content or contour ink remain detectable.
          for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){
            const j=((y+dy)*actual.width+x+dx)*4;
            nearest=Math.min(nearest,Math.max(...[0,1,2].map(k=>Math.abs(ref.data[i+k]-actual.data[j+k]))));
          }
          count++;if(nearest>60)different++;
        }
        if(count&&different/count>.025)failures.push({text:'Artwork: '+asset.name,contrast:0,required:1,reason:'Exported artwork differs materially from browser artwork',differentFraction:different/count});
      }
      return {minimum,samples,failures};
    },{background,mask,original,reference,texts,media}));
  }
  await page.evaluate(saved=>{[...document.querySelectorAll('.qa-shell,.qa-stage,.qa-stage .invoice-pages')].forEach((el,i)=>{if(saved[i]===null)el.removeAttribute('style');else el.setAttribute('style',saved[i]);});},inline);
  await zoom.evaluate(el=>el.remove());
  return {minimum:Math.min(...results.map(r=>r.minimum)),samples:results.reduce((s,r)=>s+r.samples,0),failures:results.flatMap((r,i)=>r.failures.map(f=>({page:i+1,...f})))};
}
module.exports={auditPaintedContrast};
