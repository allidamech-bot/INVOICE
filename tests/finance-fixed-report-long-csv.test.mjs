import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';

// Real component CSV methods are transpiled; the DOM and browser download are
// replaced with in-memory fixtures. No browser, account, vault, or file writes.
function exporter(kind,language='en'){
  const name=kind==='management'?'ReportsPage':'TaxVatCenter';
  const file=kind==='management'?'src/components/ReportsPage.tsx':'src/components/TaxVatCenter.tsx';
  const source=readFileSync(file,'utf8')
    .replace(/^import .*;\s*$/gm,'')
    .replace(new RegExp('export class '+name+'\\b'),'class '+name);
  const compiled=ts.transpileModule(source,{fileName:file,compilerOptions:{
    target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None,jsx:ts.JsxEmit.React
  }}).outputText;
  let downloadBlob,filename,clicks=0;
  const anchor={href:'',download:'',click(){clicks++;filename=this.download;},remove(){}};
  const company={nameEn:'LOUREX Test',nameAr:'لوريكس للاختبار'};
  const props={company,customers:[],documents:[],payments:[],suppliers:[],purchases:[],items:[]};
  const context={
    React:{Component:class{constructor(initialProps){this.props=initialProps;}}},
    t:(en,ar)=>language==='ar'?ar:en,
    getUiLanguage:()=>language,
    todayIso:()=> '2026-10-24',
    document:{body:{appendChild(){}},createElement:()=>anchor},
    URL:{createObjectURL(blob){downloadBlob=blob;return 'blob:synthetic';},revokeObjectURL(){}},
    Blob,window:{setTimeout(){}}
  };
  const Component=runInNewContext(compiled+'\n'+name+';',context,{filename:file});
  const instance=new Component(props);
  return {instance,props,download:async()=>{
    // Blob.text() strips UTF-8 BOM by specification; test the actual bytes.
    const bytes=Buffer.from(await downloadBlob.arrayBuffer());
    assert.deepEqual([...bytes.subarray(0,3)],[0xef,0xbb,0xbf],
      'physical CSV starts with UTF-8 BOM bytes');
    return {text:bytes.toString('utf8'),filename,clicks};
  }};
}

// Deliberately independent RFC-4180 style parser: validates text, quoted
// newlines/commas, escaped quotes and row counts without normalizing content.
function csvRows(text){
  assert.ok(text.startsWith('\uFEFF'),'UTF-8 BOM');
  const rows=[],row=[];let value='',quoted=false;
  const s=text.slice(1);
  for(let i=0;i<s.length;i++){
    const c=s[i];
    if(c==='"'){
      if(quoted&&s[i+1]==='"'){value+='"';i++;}
      else quoted=!quoted;
    }else if(!quoted&&(c===','||c==='\r'||c==='\n')){
      row.push(value);value='';
      if(c!==','){rows.push([...row]);row.length=0;if(c==='\r'&&s[i+1]==='\n')i++;}
    }else value+=c;
  }
  row.push(value);if(row.some(Boolean))rows.push(row);
  assert.equal(quoted,false,'balanced quotes');
  return rows;
}
function performance(id,currency='USD'){
  return {customerId:id,customerName:'Snapshot '+id,currency,netSales:'2000.00',
    grossProfit:'800.00',marginPercent:'40.00',collected:'500.00',
    outstanding:'1500.00',overdue:'250.00',issuedInvoices:2,
    creditNotes:1,profitComplete:true};
}
function vat(id,currency='USD',creditNote=false){
  return {documentId:id,issueDate:'2026-10-24',creditNote,
    number:'TAX-'+id,customerName:'Synthetic '+id,currency,
    taxRate:'20',taxableAmount:creditNote?'-100.00':'1000.00',
    outputVat:creditNote?'-20.00':'200.00',
    grandTotal:creditNote?'-120.00':'1200.00'};
}
const longArabic='عميل-تجريبي-محاسبي-'.repeat(120);
const longEnglish='PURCHASE-REFERENCE-2026-'.repeat(105);

test('original item 11: management CSV retains full extreme bilingual name, punctuation and numbers',async()=>{
  const h=exporter('management','ar');
  const full=longArabic+', "Central"\r\n'+longEnglish;
  h.props.customers=[{id:'c1',companyNameAr:full,companyNameEn:'Fallback English'}];
  const before=JSON.stringify(h.props.customers);
  h.instance.exportCsv([performance('c1')]);
  const file=await h.download(),rows=csvRows(file.text);
  assert.equal(file.clicks,1);
  assert.equal(rows.length,2);assert.equal(rows[0].length,11);
  assert.equal(rows[1][1],full);
  assert.deepEqual(rows[1].slice(2),['2000.00','800.00','40.00','500.00',
    '1500.00','250.00','2','1','نعم']);
  assert.equal(JSON.stringify(h.props.customers),before,'read-only export');
  assert.ok(file.filename.includes('2026-10-24'));
});

test('original item 11: management CSV keeps all 205 filtered rows and neutralizes leading formulas',async()=>{
  const h=exporter('management');
  const rows=Array.from({length:205},(_,i)=>performance('c'+i,i%2?'EUR':'USD'));
  h.props.customers=rows.map((r,i)=>({id:r.customerId,
    companyNameEn:i===1?'=HYPERLINK("https://example.invalid","x")'+longEnglish:
      'CUSTOMER-'+String(i).padStart(3,'0')+'-'+longArabic}));
  const before=JSON.stringify(h.props.customers);
  h.instance.exportCsv(rows);
  const parsed=csvRows((await h.download()).text);
  assert.equal(parsed.length,206);
  assert.equal(parsed[2][1],"'=HYPERLINK(\"https://example.invalid\",\"x\")"+longEnglish);
  assert.equal(parsed[2][0],'EUR');
  assert.equal(parsed[205][1],h.props.customers[204].companyNameEn);
  assert.equal(JSON.stringify(h.props.customers),before);
});

test('original item 11: VAT CSV preserves extreme reference/customer and signed credit in separate currencies',async()=>{
  const h=exporter('vat','ar');
  const a=vat('LONG-1'),b=vat('LONG-2','EUR',true);
  a.number=longEnglish+'-'+longArabic;
  a.customerName='اسم العميل: '+longArabic+', "Overseas"\r\n'+longEnglish;
  b.number='CN-'+longArabic;
  const docs=[a,b],before=JSON.stringify(docs);
  h.instance.exportCsv(docs);
  const output=await h.download(),parsed=csvRows(output.text);
  assert.equal(parsed.length,3);assert.equal(parsed[0].length,9);
  assert.equal(parsed[1][1],'فاتورة');
  assert.equal(parsed[1][2],a.number);assert.equal(parsed[1][3],a.customerName);
  assert.deepEqual(parsed[1].slice(4),['USD','20','1000.00','200.00','1200.00']);
  assert.equal(parsed[2][1],'إشعار دائن');assert.equal(parsed[2][2],b.number);
  assert.deepEqual(parsed[2].slice(4),['EUR','20','-100.00','-20.00','-120.00']);
  assert.equal(JSON.stringify(docs),before,'read-only VAT export');
});

test('original item 11: VAT CSV exports 205 records without screen cap and escapes dangerous identifiers',async()=>{
  const h=exporter('vat');
  const docs=Array.from({length:205},(_,i)=>vat(String(i),i%2?'EUR':'USD',i%5===0));
  docs[1].number='=1+1'+longEnglish;
  docs[1].customerName='@SUM(A1)'+longArabic;
  docs[2].number='Quoted "reference", continuation\r\n'+longEnglish;
  const before=JSON.stringify(docs);
  h.instance.exportCsv(docs);
  const parsed=csvRows((await h.download()).text);
  assert.equal(parsed.length,206);
  assert.equal(parsed[2][2],"'"+docs[1].number);
  assert.equal(parsed[2][3],"'"+docs[1].customerName);
  assert.equal(parsed[3][2],docs[2].number);
  assert.equal(parsed[205][2],docs[204].number);
  assert.equal(JSON.stringify(docs),before);
});