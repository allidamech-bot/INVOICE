import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createBlankDocument} from '../dist/src/lib/documents.js';
import {defaultCompany} from '../dist/src/lib/defaults.js';
import {estimatedDocumentPageCount} from '../dist/src/lib/document-quality.js';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
const example=()=>{
  const company=defaultCompany();
  company.footerText='';
  company.defaultPaymentTerms='';
  company.defaultDeliveryTime='';
  const document=createBlankDocument('proforma','QUO-2026-A4-TEST',company);
  document.language='en';
  document.appearance.showBank=false;
  document.appearance.showSignature=false;
  document.appearance.showStamp=false;
  document.notes='';
  document.terms={incoterm:'',paymentTerms:'',packing:'',deliveryTime:'',portOfLoading:'',
    finalDestination:'',countryOfOrigin:'',validity:'',remarks:''};
  return document;
};

test('closing-page policy keeps ordinary terms on the A4 body without forcing extra pages',async()=>{
  const renderer=await read('src/templates/TemplateRenderer.tsx');
  const quality=await read('src/lib/document-quality.ts');
  for(const source of [renderer,quality]){
    assert.match(source,/const hardOverflow=detailsChars>1900/);
    assert.match(source,/values\.some\(value=>value\.length>520\)/);
    assert.match(source,/if\(hardOverflow\)return true/);
    assert.match(source,/const exceptionalClosing=/);
    assert.match(source,/if\(!exceptionalClosing\)return false/);
    assert.match(source,/const tentative=paginateItems\(/);
    assert.match(source,/const lastWeight=/);
    assert.match(source,/const allowedLastWeight=/);
    assert.doesNotMatch(source,/return score\s*>=\s*10\s*\|\|\s*detailsChars/);
  }
  const doc=example();
  assert.equal(estimatedDocumentPageCount(doc),1);
  doc.terms.portOfLoading='Ambarli Port';
  doc.terms.finalDestination='Riyadh Distribution Center';
  assert.equal(estimatedDocumentPageCount(doc),1);
});

test('a single extremely long trade field earns a dedicated A4 closing page',()=>{
  const doc=example();
  doc.terms.portOfLoading='Port '+ 'A'.repeat(600);
  assert.equal(estimatedDocumentPageCount(doc),2);
  doc.terms.portOfLoading='';
  assert.equal(estimatedDocumentPageCount(doc),1);
  doc.terms.remarks='Long commercial remark '.repeat(65);
  assert.ok(estimatedDocumentPageCount(doc)>=2);
});
