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

async function auditQuotationPdf(page,directory,name){
  await fs.mkdir(directory,{recursive:true});
  const original=await exportQuotationPdf(page,path.join(directory,name+'.pdf'));
  if(original.length!==await page.locator('.invoice-page').count())throw new Error('Exported PDF page count differs from preview');
  const cache={original};
  const result=await auditPaintedContrast(page,async(index,phase)=>{
    if(!cache[phase])cache[phase]=await exportQuotationPdf(page,path.join(directory,name+'-'+phase+'.pdf'));
    if(!cache[phase][index])throw new Error('PDF page count changed during contrast capture');
    return fs.readFile(cache[phase][index]);
  });
  return {...result,pages:original.length,pdf:name+'.pdf'};
}
module.exports={auditQuotationPdf};
