import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root=new URL('../',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');

test('v64 final review explains the irreversible workflow step before issuing',async()=>{
  const source=await read('src/components/DocumentReviewModal.tsx');
  assert.match(source,/Final check before issue/);
  assert.match(source,/Confirming will save this exact version as Final/);
  assert.match(source,/lock it against accidental edits/);
  assert.match(source,/Back to document/);
  assert.match(source,/Confirm & Issue/);
});

test('review shows the exact document, counterparty, item count and correct financial total',async()=>{
  const source=await read('src/components/DocumentReviewModal.tsx');
  assert.match(source,/const party=reviewParty\(doc\)/);
  assert.match(source,/<small>\{doc\.number\}<\/small>/);
  assert.match(source,/<span>\{party\.label\}<\/span><strong>\{party\.name\|\|'—'\}<\/strong>/);
  assert.match(source,/doc\.items\.length/);
  assert.match(source,/const nonFinancial=documentPriceOptional\(doc\.kind\)/);
  assert.match(source,/nonFinancial\?<div className="issue-total-check is-nonfinancial"/);
  assert.match(source,/formatMoney\(totals\.grandTotal,doc\.currency\)/);
  assert.match(source,/issue-total-check/);
  assert.match(source,/disabled=\{working\|\|blocked\|\|mode==='issue'&&final\}/);
});

test('only active final standard quotations or proforma invoices expose conversion in editor',async()=>{
  const [editor,core,css,documents,kinds]=await Promise.all([
    read('src/components/EditorPage.tsx'),
    read('src/components/EditorPageCore.tsx'),
    read('src/styles/editor-workflow-v61.css'),
    read('src/lib/documents.ts'),
    read('src/lib/document-kinds.ts')
  ]);
  assert.doesNotMatch(core,/convert-invoice-button/);
  assert.doesNotMatch(css,/\.app-ui \.convert-invoice-button\{display:none!important\}/);
  assert.match(kinds,/documentCanConvertToInvoice\(kind:DocumentKind\):boolean\{return kind==='proforma'\|\|kind==='proforma-invoice';\}/);
  assert.match(editor,/documentCanConvertToInvoice\(props\.document\.kind\)&&props\.document\.role==='standard'&&props\.document\.status==='final'&&props\.document\.lifecycleStatus!=='voided'/);
  assert.match(editor,/linkedInvoice=finalQuote\?props\.documents\.find\(item=>item\.kind==='invoice'&&item\.role==='standard'&&item\.convertedFromId===props\.document\.id&&item\.lifecycleStatus!=='voided'\)/);
  assert.match(editor,/if\(linkedInvoice\)return/);
  assert.match(editor,/onClick=\{this\.convertFinalQuote\}/);
  assert.match(documents,/source\.role!=='standard'\|\|source\.status!=='final'\|\|source\.lifecycleStatus==='voided'/);
  assert.match(documents,/kind: 'invoice', role:'standard', convertedFromId: source\.id, dueDate: '', status: 'draft'/);
});

test('document workspace opens a live linked invoice rather than creating a duplicate',async()=>{
  const source=await read('src/components/DocumentsPage.tsx');
  assert.match(source,/private linkedInvoiceForQuote=/);
  assert.match(source,/if\(!documentCanConvertToInvoice\(doc\.kind\)\|\|doc\.role!=='standard'\)return undefined/);
  assert.match(source,/item\.kind==='invoice'&&item\.role==='standard'&&item\.convertedFromId===doc\.id&&item\.lifecycleStatus!=='voided'/);
  assert.match(source,/const canConvert=Boolean\(this\.props\.onConvert&&documentCanConvertToInvoice\(doc\.kind\)&&doc\.role==='standard'&&doc\.status==='final'&&doc\.lifecycleStatus!=='voided'&&!linkedInvoice&&!salesOrderForQuotation\(doc\.id,this\.props\.documentEvents\)\)/);
  assert.match(source,/linkedInvoice\?<button[^>]*onClick=\{\(\)=>this\.runAction\(\(\)=>this\.setState\(\{detailId:linkedInvoice\.id\}\)\)\}/);
  assert.match(source,/Open linked invoice \$\{linkedInvoice\.number\}/);
  assert.match(source,/فتح الفاتورة المرتبطة \$\{linkedInvoice\.number\}/);
});
test('conversion function rejects draft voided and nonstandard sources and preserves the final source',async()=>{
  const ts=await import('typescript');
  const vm=await import('node:vm');
  const all=await read('src/lib/documents.ts');
  const source=all.slice(all.indexOf('export function convertToInvoice'),all.indexOf('export function refreshCompanySnapshot'));
  assert.ok(source.startsWith('export function convertToInvoice('));
  const compiled=ts.default.transpileModule(source,{compilerOptions:{module:ts.default.ModuleKind.CommonJS,target:ts.default.ScriptTarget.ES2022}}).outputText;
  const context={exports:{},
    documentCanConvertToInvoice:kind=>kind==='proforma'||kind==='proforma-invoice',
    duplicateDocument:(doc,number)=>({...doc,number,terms:{...doc.terms}}),
    conversionReference:doc=>'Reference: '+doc.number,
    t:(english)=>english
  };
  vm.runInNewContext(compiled,context);
  const convert=context.exports.convertToInvoice;
  const sourceDoc={id:'quote-original',number:'QUO-2026-0042',kind:'proforma',role:'standard',status:'final',lifecycleStatus:'active',terms:{remarks:'Original terms'},revision:2};
  for(const input of [
    {...sourceDoc,status:'draft'}, {...sourceDoc,lifecycleStatus:'voided'},
    {...sourceDoc,role:'credit-note'}, {...sourceDoc,kind:'invoice'}
  ])assert.throws(()=>convert(input,'INV-2026-0007'),/Only an active Final quotation or proforma invoice/);
  for(const kind of ['proforma','proforma-invoice']){
    const result=convert({...sourceDoc,kind},'INV-2026-0007');
    assert.equal(result.kind,'invoice');
    assert.equal(result.role,'standard');
    assert.equal(result.convertedFromId,sourceDoc.id);
    assert.equal(result.number,'INV-2026-0007');
    assert.equal(result.status,'draft');
    assert.equal(result.lifecycleStatus,'active');
    assert.equal(result.revision,1);
    assert.equal(result.dueDate,'');
    assert.match(result.terms.remarks,/Reference: QUO-2026-0042/);
    assert.match(result.terms.remarks,/Original terms/);
    assert.equal(sourceDoc.status,'final','conversion must not alter the source');
    assert.equal(sourceDoc.number,'QUO-2026-0042');
  }
});

test('rapid repeated conversion clicks are ignored before another invoice number can be reserved',async()=>{
  const [editor,documents]=await Promise.all([
    read('src/components/EditorPage.tsx'),
    read('src/components/DocumentsPage.tsx')
  ]);
  assert.match(editor,/quoteConversionRunning=false/);
  assert.match(editor,/if\(this\.quoteConversionRunning\)return/);
  assert.match(editor,/onClick=\{this\.convertFinalQuote\}/);
  assert.match(documents,/quoteConversions=new Set<string>\(\)/);
  assert.match(documents,/if\(this\.quoteConversions\.has\(doc\.id\)\)return/);
  assert.match(documents,/this\.quoteConversions\.add\(doc\.id\)/);
  assert.match(documents,/finally\(\(\)=>this\.quoteConversions\.delete\(doc\.id\)\)/);
});

test('review-confirmed output arms only after the final save path succeeds',async()=>{
  const [editor,review,core]=await Promise.all([
    read('src/components/EditorPage.tsx'),
    read('src/components/DocumentReviewModal.tsx'),
    read('src/components/EditorPageCore.tsx')
  ]);
  assert.match(editor,/printWithPreparedMode/);
  assert.match(editor,/__LOUREX_PREPARE_PDF__\?\.\(mode\)/);
  assert.match(editor,/onPrint=\{this\.printWithPreparedMode\}/);
  assert.doesNotMatch(review,/__LOUREX_PREPARE_PDF__/);
  const workflow=core.slice(core.indexOf('private issueAndContinue=async()=>'),core.indexOf('private unlockFinal='));
  const saveAt=workflow.indexOf('await this.props.onSave(finalDoc,false)');
  const outputAt=workflow.indexOf('await this.props.onPrint(finalDoc,mode)');
  assert.ok(saveAt>=0&&outputAt>saveAt,'output must begin only after the final snapshot save succeeds');
});

test('v64 workflow assets remain present in later PWA releases',async()=>{
  const sw=await read('public/sw.js');
  assert.match(sw,/lourex-invoice-v\d+/);
  assert.ok(sw.includes('./src/components/DocumentReviewModal.js'));
  assert.ok(sw.includes('./src/components/EditorPageCore.js'));
  assert.ok(sw.includes('./styles/editor-workflow-v61.css'));
});
