const fs=require('node:fs/promises');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const {auditPaintedContrast}=require('./quotation-pixel-contrast.cjs');

async function exportQuotationPdf(page,target){
  if(!await page.evaluate(()=>Boolean(window.__LOUREX_BUILD_CHAT_PDF__))) {
    for(const asset of ['vendor/html2canvas.min.js','vendor/jspdf.umd.min.js','ios-print-bridge.js'])await page.addScriptTag({url:'http://lourex.test/dist/'+asset});
  }
  const encoded=await page.evaluate(async()=>{
    const file=await window.__LOUREX_BUILD_CHAT_PDF__(document.querySelector('.qa-stage'),'Synthetic quotation');
    return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result.split(',')[1]);r.onerror=reject;r.readAsDataURL(file);});
  });
  await fs.writeFile(target,Buffer.from(encoded,'base64'));
  const info=execFileSync('pdfinfo',[target],{encoding:'utf8'});
  const dimensions=info.match(/^Page size:\s+([\d.]+) x ([\d.]+) pts/m);
  if(!dimensions||Math.abs(Number(dimensions[1])-595.28)>1||Math.abs(Number(dimensions[2])-841.89)>1)throw new Error('Exported PDF is not A4');
  const prefix=target.replace(/\.pdf$/,'');
  const rasterName=path.basename(prefix)+'-';
  for(const file of await fs.readdir(path.dirname(target)))if(file.startsWith(rasterName)&&/^\d+\.png$/.test(file.slice(rasterName.length)))await fs.unlink(path.join(path.dirname(target),file));
  execFileSync('pdftoppm',['-r','96','-png',target,prefix],{stdio:'pipe'});
  const files=(await fs.readdir(path.dirname(target))).filter(f=>f.startsWith(rasterName)&&/^\d+\.png$/.test(f.slice(rasterName.length))).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
  const pageCount=Number(info.match(/^Pages:\s+(\d+)/m)?.[1]);
  if(files.length!==pageCount)throw new Error('Rasterized PDF page count differs from actual PDF');
  return files.map(f=>path.join(path.dirname(target),f));
}


/**
 * A QR is a data matrix, not a photograph: comparing each raster pixel of its
 * high-resolution PDF overlay to a 96-DPI browser preview rejects valid QR
 * modules because their resampling phases differ. Decode the *actual exported
 * PDF page* instead, and require exactly the original private link.
 *
 * No QR is exempted from the generic artwork pixel audit until this stronger
 * source-to-PDF semantic check has passed for every QR on every page.
 */
async function verifyExportedQrLinks(page,pdfPath){
  const links=await page.locator('.invoice-page').evaluateAll(pages=>pages.flatMap((paper,pageIndex)=>{
    const p=paper.getBoundingClientRect();
    return [...paper.querySelectorAll('.lx-document-qr img')].map(img=>{
      const rect=img.getBoundingClientRect(),anchor=img.closest('a.lx-document-qr');
      if(!anchor||!rect.width||!rect.height)throw new Error('QR has no measurable visible link');
      return {page:pageIndex+1,expected:anchor.href,x:(rect.left-p.left)/p.width,y:(rect.top-p.top)/p.height,w:rect.width/p.width,h:rect.height/p.height};
    });
  }));
  const jsQR=require('jsqr');
  for(const link of links){
    const ppm=execFileSync('pdftoppm',['-f',String(link.page),'-l',String(link.page),'-singlefile','-r','150',pdfPath],{maxBuffer:32*1024*1024});
    const header=ppm.subarray(0,128).toString('ascii').match(/^P6\s+(\d+)\s+(\d+)\s+255\s/);
    if(!header)throw new Error('Could not rasterize exported QR page '+link.page);
    const width=Number(header[1]),height=Number(header[2]),margin=.018;
    const x0=Math.max(0,Math.floor((link.x-margin)*width)),y0=Math.max(0,Math.floor((link.y-margin)*height));
    const x1=Math.min(width,Math.ceil((link.x+link.w+margin)*width)),y1=Math.min(height,Math.ceil((link.y+link.h+margin)*height));
    const cw=x1-x0,ch=y1-y0;
    if(cw<30||ch<30)throw new Error('Exported QR has insufficient printable area on page '+link.page);
    const rgba=new Uint8ClampedArray(cw*ch*4),start=header[0].length;
    for(let y=0;y<ch;y++)for(let x=0;x<cw;x++){
      const from=start+((y+y0)*width+x+x0)*3,to=(y*cw+x)*4;
      rgba[to]=ppm[from];rgba[to+1]=ppm[from+1];rgba[to+2]=ppm[from+2];rgba[to+3]=255;
    }
    const decoded=jsQR(rgba,cw,ch)?.data;
    if(decoded!==link.expected)throw new Error('Exported PDF QR missing, undecodable or wrong on page '+link.page);
  }
  return links.length;
}

async function auditQuotationPdf(page,directory,name){
  await fs.mkdir(directory,{recursive:true});
  const original=await exportQuotationPdf(page,path.join(directory,name+'.pdf'));
  if(original.length!==await page.locator('.invoice-page').count())throw new Error('Exported PDF page count differs from preview');
  const qrCount=await verifyExportedQrLinks(page,path.join(directory,name+'.pdf'));
  const cache={original};
  const result=await auditPaintedContrast(page,async(index,phase)=>{
    if(!cache[phase])cache[phase]=await exportQuotationPdf(page,path.join(directory,name+'-'+phase+'.pdf'));
    if(!cache[phase][index])throw new Error('PDF page count changed during contrast capture');
    return fs.readFile(cache[phase][index]);
  },{qrVerifiedFromPdf:qrCount>0});
  return {...result,pages:original.length,decodedQrCount:qrCount,pdf:name+'.pdf'};
}
module.exports={auditQuotationPdf,exportQuotationPdf,verifyExportedQrLinks};
