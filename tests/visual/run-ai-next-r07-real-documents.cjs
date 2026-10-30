// R07C genuine binary integration acceptance: R02 adapters + vendored runtimes
// in real Chromium and WebKit. All document content is synthetic and local.
// No external API/model calls or real customer data.
const assert=require('node:assert/strict');
const {chromium,webkit}=require('playwright');
const {deflateSync}=require('node:zlib');

function makePdf(pageCount,{scanned=false}={}){
  const objects=[null];
  const add=bytes=>{objects.push(Buffer.isBuffer(bytes)?bytes:Buffer.from(bytes,'latin1'));return objects.length-1;};
  const replace=(n,bytes)=>{objects[n]=Buffer.isBuffer(bytes)?bytes:Buffer.from(bytes,'latin1');};
  const catalog=add(''),pages=add('');
  const font=add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  let imageId=null;
  if(scanned){
    const pixel=deflateSync(Buffer.from([255,0,0]));
    imageId=add(Buffer.concat([
      Buffer.from('<< /Type /XObject /Subtype /Image /Width 1 /Height 1 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length '+pixel.length+' >>\nstream\n','latin1'),
      pixel,Buffer.from('\nendstream\n','latin1'),
    ]));
  }
  const pageRefs=[];
  const escapePdf=s=>s.replaceAll('\\','\\\\').replaceAll('(','\\(').replaceAll(')','\\)');
  for(let page=1;page<=pageCount;page++){
    const stream=scanned
      ? 'q 350 0 0 350 90 300 cm /Im0 Do Q\n'
      : 'BT /F1 8 Tf 11 TL 35 775 Td\n'+
        Array.from({length:32},(_,i)=>'('+escapePdf(
          'Page '+page+' row '+(i+1)+': SKU-'+page+'-'+(i+1)+
          ' item repeated test USD 125.00 QTY 3 PCS source exact'
        )+') Tj T*\n').join('')+'ET\n';
    const body=Buffer.from(stream,'latin1');
    const streamId=add(Buffer.concat([
      Buffer.from('<< /Length '+body.length+' >>\nstream\n','latin1'),
      body,Buffer.from('endstream\n','latin1'),
    ]));
    const pageObj=add('<< /Type /Page /Parent '+pages+' 0 R /MediaBox [0 0 612 792] '+
      '/Resources << /Font << /F1 '+font+' 0 R >>'+
      (scanned?' /XObject << /Im0 '+imageId+' 0 R >>':'')+
      ' >> /Contents '+streamId+' 0 R >>');
    pageRefs.push(pageObj);
  }
  replace(catalog,'<< /Type /Catalog /Pages '+pages+' 0 R >>');
  replace(pages,'<< /Type /Pages /Kids ['+pageRefs.map(n=>n+' 0 R').join(' ')+
    '] /Count '+pageRefs.length+' >>');
  const chunks=[Buffer.from('%PDF-1.7\n%\xE2\xE3\xCF\xD3\n','latin1')];
  const offsets=[0];
  let length=chunks[0].length;
  for(let n=1;n<objects.length;n++){
    offsets.push(length);
    const chunk=Buffer.concat([
      Buffer.from(n+' 0 obj\n','latin1'),
      objects[n],Buffer.from('\nendobj\n','latin1'),
    ]);
    chunks.push(chunk);length+=chunk.length;
  }
  const xref=length;
  let table='xref\n0 '+objects.length+'\n0000000000 65535 f \n';
  for(let n=1;n<objects.length;n++)
    table+=String(offsets[n]).padStart(10,'0')+' 00000 n \n';
  table+='trailer\n<< /Size '+objects.length+' /Root '+catalog+
    ' 0 R >>\nstartxref\n'+xref+'\n%%EOF\n';
  chunks.push(Buffer.from(table,'latin1'));
  return Buffer.concat(chunks);
}
const longPdf=makePdf(35);
const scanPdf=makePdf(8,{scanned:true});
assert.equal(longPdf.slice(0,5).toString('latin1'),'%PDF-');
assert.ok(longPdf.length>24_000);

async function check(engine,name){
  const browser=await engine.launch({headless:true});
  try{
    const page=await browser.newPage({viewport:{width:390,height:844},
      locale:'ar-SA',isMobile:name==='webkit'});
    const pageErrors=[];
    page.on('pageerror',e=>pageErrors.push(String(e)));
    let apiCalls=0;
    await page.route('**/api/**',route=>{apiCalls++;return route.abort();});
    await page.goto('http://127.0.0.1:4173/tests/visual/ai-next-r07-real-binaries.html',
      {waitUntil:'domcontentloaded'});
    await page.addScriptTag({url:'/dist/vendor/xlsx.full.min.js'});
    const report=await page.evaluate(async({longB64,scanB64})=>{
      const [{
        ingestDocument,SyntheticSourceRepository,sha256,sourceScopeKey,
      },{
        PdfSourceAdapter,SpreadsheetSourceAdapter,CsvSourceAdapter,
      }]=await Promise.all([
        import('/dist/src/ai-next/document-engine/engine.js'),
        import('/dist/src/ai-next/document-engine/adapters.js'),
      ]);
      const pdfjs=await import('/dist/vendor/pdf.mjs');
      pdfjs.GlobalWorkerOptions.workerSrc='/dist/vendor/pdf.worker.mjs';
      const workbookRuntime=window.XLSX;
      if(!workbookRuntime?.read||!workbookRuntime?.write)
        throw Error('VENDORED_XLSX_RUNTIME_NOT_READY');
      const bytes=base64=>Uint8Array.from(atob(base64),c=>c.charCodeAt(0));
      const scope={
        ownerUid:'synthetic-owner',accountId:'synthetic-account',
        companyId:'synthetic-company',branchId:'synthetic-branch',
        threadId:'synthetic-thread',actorId:'synthetic-owner',
        role:'owner',scopeType:'business',authorizationVersion:1,
      };
      const now='2026-10-30T16:00:00.000Z';
      const source=(documentId,format,data,fileName,mimeType)=>({
        documentId,format,bytes:data,fileName,mimeType,
      });
      const run=async(file,adapter)=>{
        const repository=new SyntheticSourceRepository();
        const result=await ingestDocument({
          source:file,scope,adapter,repository,
          runId:'r07c-'+file.documentId,now,
        });
        const kept=await repository.read(sourceScopeKey(scope),file.documentId);
        if(!kept||await sha256(kept.bytes)!==result.sourceSha256)
          throw Error('SOURCE_NOT_PRESERVED');
        return result;
      };
      const searchable=await run(source('real-searchable','pdf',bytes(longB64),
        'real-searchable.pdf','application/pdf'),new PdfSourceAdapter(pdfjs));
      const longText=searchable.evidence.map(x=>x.rawValue).join('');
      const searchableSummary={
        status:searchable.coverage.status,
        expectedPages:searchable.coverage.expectedPageCount,
        observedPages:searchable.coverage.observedPageCount,
        pages:[...new Set(searchable.evidence.map(x=>x.locator.pageNumber))],
        length:longText.length,
        lastPage:longText.includes('Page 35 row 32'),
        financialEligible:searchable.financialDraftEligible,
      };
      const scanRaw=bytes(scanB64);
      const scannedWithoutOcr=await run(source('scan-raw','pdf',scanRaw,
        'scan-raw.pdf','application/pdf'),new PdfSourceAdapter(pdfjs));
      const scannedWithPartialOcr=await run(source('scan-reviewed','pdf',scanRaw,
        'scan-reviewed.pdf','application/pdf'),new PdfSourceAdapter(pdfjs,
        async({pageNumber})=>{
          if(pageNumber===4)throw Error('OCR_PAGE_UNREADABLE');
          return {text:'Human review required for synthetic OCR page '+pageNumber+
            ' line item unknown selling price',confidence:0.75};
        }));
      const spreadsheet=workbookRuntime.utils.book_new();
      const primary=workbookRuntime.utils.aoa_to_sheet([
        ['Description','Quantity','Selling Price'],
        ['Tea','2','20.50'],[],['Tea','3',''],
      ]);
      const secondary=workbookRuntime.utils.aoa_to_sheet([
        ['المنتج','الكمية','الوحدة'],
        ['عطر','۱۲۳','KG'],
        ['عود','٤٥٦','PCS'],
      ]);
      workbookRuntime.utils.book_append_sheet(spreadsheet,primary,'Main');
      workbookRuntime.utils.book_append_sheet(spreadsheet,secondary,'Arabic');
      const xlsx=new Uint8Array(workbookRuntime.write(spreadsheet,{
        bookType:'xlsx',type:'array',
      }));
      const xls=new Uint8Array(workbookRuntime.write(spreadsheet,{
        bookType:'biff8',type:'array',
      }));
      const spreadsheetFile=(format,data)=>source('real-'+format,format,data,
        'real.'+format,format==='xlsx'?
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
          'application/vnd.ms-excel');
      const sheetXlsx=await run(spreadsheetFile('xlsx',xlsx),
        new SpreadsheetSourceAdapter(workbookRuntime,'xlsx'));
      const sheetXls=await run(spreadsheetFile('xls',xls),
        new SpreadsheetSourceAdapter(workbookRuntime,'xls'));
      const resultSheet=r=>({
        status:r.coverage.status,
        expectedSheets:r.coverage.expectedSheets,
        observedSheets:r.coverage.observedSheets,
        rowCount:r.coverage.observedTableRows.reduce((a,b)=>a+b.count,0),
        repeats:r.evidence.filter(e=>e.rawValue==='Tea'&&e.locator.columnId==='A').length,
        physicalRow:r.evidence.some(e=>e.locator.sheetName==='Main'&&
          e.locator.cellReference==='C4'&&e.rawValue===''),
        arabicDigits:r.evidence.some(e=>e.locator.sheetName==='Arabic'&&
          e.locator.cellReference==='B2'&&e.rawValue==='۱۲۳'),
        financialEligible:r.financialDraftEligible,
      });
      const csvText='Description,Quantity,Selling Price\r\nTea,2,20.50\r\n\r\n'+
        '"Tea,\nherbal",3,\r\nTea,4,';
      const csv=await run(source('real-csv','csv',new TextEncoder().encode(csvText),
        'real.csv','text/csv'),new CsvSourceAdapter());
      return {
        searchable:searchableSummary,
        scannedNoOcr:{
          status:scannedWithoutOcr.coverage.status,
          expectedPages:scannedWithoutOcr.coverage.expectedPageCount,
          missing:scannedWithoutOcr.coverage.unprocessedSegments.length,
          evidence:scannedWithoutOcr.evidence.length,
        },
        scannedPartial:{
          status:scannedWithPartialOcr.coverage.status,
          expectedPages:scannedWithPartialOcr.coverage.expectedPageCount,
          unreadable:scannedWithPartialOcr.coverage.unprocessedSegments,
          reviewEvidence:scannedWithPartialOcr.evidence.length,
          verified:scannedWithPartialOcr.evidence.some(e=>e.provenanceStatus==='verified'),
        },
        xlsx:resultSheet(sheetXlsx),xls:resultSheet(sheetXls),
        csv:{status:csv.coverage.status,rows:csv.coverage.observedTableRows[0]?.count,
          multiline:csv.evidence.some(e=>e.rawValue==='Tea,\nherbal'),
          blankRow:csv.evidence.some(e=>e.locator.rowId==='csv:row:3'&&e.rawValue===''),
          financialEligible:csv.financialDraftEligible},
      };
    },{longB64:longPdf.toString('base64'),scanB64:scanPdf.toString('base64')});
    assert.deepEqual(pageErrors,[],'Browser PDF/spreadsheet runtime must not throw');
    assert.equal(apiCalls,0,'Real binary test must never call an AI endpoint');
    assert.equal(report.searchable.status,'complete');
    assert.equal(report.searchable.expectedPages,35);
    assert.equal(report.searchable.observedPages,35);
    assert.deepEqual(report.searchable.pages,Array.from({length:35},(_,i)=>i+1));
    assert.ok(report.searchable.length>24_000);
    assert.equal(report.searchable.lastPage,true);
    assert.equal(report.searchable.financialEligible,false);
    assert.equal(report.scannedNoOcr.status,'blocked');
    assert.equal(report.scannedNoOcr.expectedPages,8);
    assert.equal(report.scannedNoOcr.missing,8);
    assert.equal(report.scannedNoOcr.evidence,0);
    assert.notEqual(report.scannedPartial.status,'complete');
    assert.equal(report.scannedPartial.expectedPages,8);
    assert.deepEqual(report.scannedPartial.unreadable,['page:4']);
    assert.ok(report.scannedPartial.reviewEvidence>=7);
    assert.equal(report.scannedPartial.verified,false);
    for(const fmt of ['xlsx','xls']){
      const s=report[fmt];
      assert.equal(s.status,'complete');
      assert.deepEqual(s.expectedSheets,['Main','Arabic']);
      assert.deepEqual(s.observedSheets,['Main','Arabic']);
      assert.equal(s.rowCount,7);
      assert.equal(s.repeats,2);
      assert.equal(s.physicalRow,true);
      assert.equal(s.arabicDigits,true);
      assert.equal(s.financialEligible,false);
    }
    assert.equal(report.csv.status,'complete');
    assert.equal(report.csv.rows,5);
    assert.equal(report.csv.multiline,true);
    assert.equal(report.csv.blankRow,true);
    assert.equal(report.csv.financialEligible,false);
    console.log(name+' R07C real binaries: 35/35 PDF pages, 8/8 scan blocked/reviewed,'+
      ' 2/2 workbook formats, 2/2 sheets, CSV blank/multiline PASS');
    return report;
  }finally{await browser.close();}
}
(async()=>{
  await check(chromium,'chromium');
  await check(webkit,'webkit');
})().catch(error=>{console.error(error);process.exitCode=1;});
