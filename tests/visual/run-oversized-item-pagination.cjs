const {chromium,webkit}=require('playwright');
const fs=require('node:fs/promises');
const path=require('node:path');
const assert=require('node:assert/strict');

const root=process.cwd();
const expected=Array.from({length:140},(_,i)=>String(i+1).padStart(3,'0'));
const en=expected.map(n=>'SPEC'+n+' commercial specification').join(' ');
const ar=expected.map(n=>'بند'+n+' مواصفات تجارية').join(' ');
const inject=[
  'documentData.items=[{...documentData.items[0],descriptionEn:'+JSON.stringify(en)+',descriptionAr:'+JSON.stringify(ar)+',quantity:"3",unit:"Carton",unitPrice:"25.00"}];',
  'documentData.adjustments.taxEnabled=false;',
  'window.__originalPaginationDocument=JSON.stringify(documentData);',
  'window.__readPaginationDocument=()=>JSON.stringify(documentData);'
].join('\n');

(async()=>{
  let cases=0;
  for(const [name,type] of [['chromium',chromium],['webkit',webkit]]){
    const browser=await type.launch({headless:true});
    try{
      const page=await browser.newPage({viewport:{width:1280,height:1400}});
      const errors=[];
      page.on('pageerror',error=>errors.push(String(error)));
      await page.route('http://lourex.test/**',async route=>{
        const file=path.resolve(root,'.'+decodeURIComponent(new URL(route.request().url()).pathname));
        if(!file.startsWith(root+path.sep))return route.fulfill({status:403,body:''});
        try{
          let body=await fs.readFile(file);
          if(file.endsWith('/tests/visual/template-visual-qa.js')){
            const source=body.toString();
            const marker='  const rendered=React.createElement';
            assert.ok(source.includes(marker),'fixture injection boundary');
            body=source.replace(marker,inject+'\n'+marker);
          }
          await route.fulfill({body,contentType:({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.ttf':'font/ttf','.woff2':'font/woff2'})[path.extname(file)]||'application/octet-stream'});
        }catch(error){errors.push(String(error));await route.fulfill({status:404,body:''});}
      });
      for(const language of ['en','ar','bilingual']){
        await page.goto('http://lourex.test/tests/visual/template-visual-qa.html?'+new URLSearchParams({
          template:'executive',language,items:'1',profile:'showcase',mode:'print',bank:'false',signing:'false',qr:'false'
        }));
        await page.waitForFunction(()=>document.querySelector('.invoice-pages')?.dataset.paginationReady==='true',null,{timeout:20000});
        const result=await page.evaluate(()=>{
          const pages=[...document.querySelectorAll('.invoice-page')];
          const rows=[...document.querySelectorAll('.items-table tbody tr')];
          const text=rows.map(row=>row.querySelector('.description-cell').textContent).join(' ');
          return {
            pages:pages.length,
            sourceIds:[...new Set(rows.map(row=>row.dataset.sourceItemId))],
            fragments:rows.map(row=>Number(row.dataset.sourceFragment)),
            originals:rows.filter(row=>row.dataset.sourceFragment==='0').length,
            quantities:rows.map(row=>row.querySelector('.quantity-cell').textContent).filter(Boolean),
            prices:rows.map(row=>row.querySelector('.money-cell').textContent).filter(Boolean),
            lineTotals:rows.map(row=>row.querySelector('.money-cell.strong').textContent).filter(Boolean),
            grandTotals:[...document.querySelectorAll('.grand-total strong')].map(el=>el.textContent),
            en:text.match(/SPEC\d{3}/g)||[],ar:text.match(/بند\d{3}/g)||[],
            closing:document.querySelectorAll('.final-details').length,
            unchanged:window.__originalPaginationDocument===window.__readPaginationDocument(),
            overflow:pages.some(paper=>{
              const boundary=paper.querySelector('.doc-footer').getBoundingClientRect().top;
              return paper.scrollHeight>paper.clientHeight+2||paper.scrollWidth>paper.clientWidth+2||
                [...paper.querySelectorAll('.doc-body *')].some(el=>el.getBoundingClientRect().height>0&&el.getBoundingClientRect().bottom>boundary+1);
            })
          };
        });
        const label=name+'/'+language;
        assert.ok(result.pages>1,label+': oversized item must span pages');
        assert.deepEqual(result.sourceIds,['qa-item-1'],label+': source identity');
        assert.deepEqual(result.fragments,result.fragments.map((_,i)=>i),label+': fragment order');
        assert.equal(result.originals,1,label+': original appears once');
        assert.deepEqual(result.quantities,['3'],label+': quantity once');
        assert.deepEqual(result.prices,['25.00'],label+': price once');
        assert.deepEqual(result.lineTotals,['75.00'],label+': line total once');
        assert.equal(result.grandTotals.length,1,label+': grand total once');
        assert.match(result.grandTotals[0],/75[.,]00/,label+': unchanged total');
        assert.deepEqual(result.en,language==='ar'?[]:expected.map(n=>'SPEC'+n),label+': English text sequence');
        assert.deepEqual(result.ar,language==='en'?[]:expected.map(n=>'بند'+n),label+': Arabic text sequence');
        assert.equal(result.closing,1,label+': one closing');
        assert.equal(result.unchanged,true,label+': source document unchanged');
        assert.equal(result.overflow,false,label+': no A4 overflow or footer overlap');
        if(name==='chromium'){
          // Use the shipped application export, as quotation-pdf-pixels.cjs does.
          for(const asset of ['vendor/html2canvas.min.js','vendor/jspdf.umd.min.js','ios-print-bridge.js']){
            await page.addScriptTag({url:'http://lourex.test/dist/'+asset});
          }
          const pdf=await page.evaluate(async()=>{
            const file=await window.__LOUREX_BUILD_CHAT_PDF__(document.querySelector('.qa-stage'),'Synthetic oversized item');
            const text=await file.text();
            return {size:file.size,pages:(text.match(/\/Type\s*\/Page\b/g)||[]).length};
          });
          assert.ok(pdf.size>10000,label+': nonempty exported PDF');
          assert.equal(pdf.pages,result.pages,label+': exported PDF page count');
        }
        assert.deepEqual(errors,[],label+': browser and resource errors');
        console.log('PASS '+label+': '+result.pages+' pages, complete text, amounts once, source unchanged');
        cases++;
      }
    }finally{await browser.close();}
  }
  console.log(cases+' oversized-item browser cases passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
