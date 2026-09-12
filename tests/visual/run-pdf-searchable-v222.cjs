const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const {mkdirSync,writeFileSync}=require('node:fs');

const output='visual-qa-output/pdf-searchable-v222';
const url='http://127.0.0.1:4173/tests/visual/pdf-searchable-v222.html';

(async()=>{
  mkdirSync(output,{recursive:true});
  const browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:900,height:1200}});
  const failures=[];
  page.on('pageerror',error=>failures.push(`pageerror: ${String(error)}`));
  try{
    await page.goto(url,{waitUntil:'load'});
    await page.waitForFunction(()=>Boolean(window.jspdf?.jsPDF&&window.__LOUREX_ADD_SEARCHABLE_TEXT_LAYER__));
    const result=await page.evaluate(async()=>{
      const pdf=new window.jspdf.jsPDF({orientation:'portrait',unit:'mm',format:'a4',compress:false});
      await window.__LOUREX_ADD_SEARCHABLE_TEXT_LAYER__(pdf,document.getElementById('page'));
      const buffer=pdf.output('arraybuffer');
      const bytes=new Uint8Array(buffer);
      const source=new TextDecoder('latin1').decode(bytes);
      const lower=source.toLowerCase();
      return {
        size:bytes.length,
        hasToUnicode:source.includes('/ToUnicode'),
        hasInvisibleText:/\b3\s+Tr\b/.test(source),
        hasLatinL:lower.includes('004c'),
        hasLatinO:lower.includes('004f'),
        hasArabicFa:lower.includes('0641'),
        hasArabicAlef:lower.includes('0627'),
        hasArabicTeh:lower.includes('062a'),
        fontListed:Object.prototype.hasOwnProperty.call(pdf.getFontList(),'LOUREXSearchText')
      };
    });
    assert.ok(result.size>10000,`generated PDF unexpectedly small: ${JSON.stringify(result)}`);
    assert.equal(result.fontListed,true,'embedded searchable font must be registered');
    assert.equal(result.hasToUnicode,true,'embedded text font must publish a ToUnicode CMap');
    assert.equal(result.hasInvisibleText,true,'search layer must use invisible PDF text rendering mode');
    assert.equal(result.hasLatinL,true,'Latin Unicode mapping must survive into the PDF');
    assert.equal(result.hasLatinO,true,'Latin Unicode mapping must survive into the PDF');
    assert.equal(result.hasArabicFa,true,'Arabic ف Unicode mapping must survive into the PDF');
    assert.equal(result.hasArabicAlef,true,'Arabic ا Unicode mapping must survive into the PDF');
    assert.equal(result.hasArabicTeh,true,'Arabic ت Unicode mapping must survive into the PDF');
    writeFileSync(`${output}/report.json`,JSON.stringify(result,null,2));
    await page.screenshot({path:`${output}/fixture.png`,fullPage:true,animations:'disabled'});
  }catch(error){
    failures.push(error?.stack||String(error));
    writeFileSync(`${output}/report.json`,JSON.stringify({failures},null,2));
  }finally{
    await page.close();
    await browser.close();
  }
  assert.equal(failures.length,0,failures.join('\n\n'));
  console.log('Searchable PDF v222: embedded invisible bilingual text layer passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
