import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import { defaultCompany, customerSnapshotFrom } from '../dist/src/lib/defaults.js';
import { createBlankDocument } from '../dist/src/lib/documents.js';
import { documentDisplayValue, documentCurrency, hasDocumentLanguageMismatch } from '../dist/src/lib/document-language.js';
import { documentQualityIssues } from '../dist/src/lib/document-quality.js';

test('v151 converts controlled Arabic values to the selected English document language',()=>{
  assert.equal(documentDisplayValue('دولار','en','currency'),'USD');
  assert.equal(documentDisplayValue('كرتون','en','unit'),'Carton');
  assert.equal(documentDisplayValue('رومانيا','en','country'),'Romania');
  assert.equal(documentDisplayValue('المملكة العربية السعودية','en','country'),'Saudi Arabia');
});

test('v151 suppresses wrong-script prose instead of leaking it into a single-language document',()=>{
  assert.equal(documentDisplayValue('شروط دفع عربية فقط','en'),'');
  assert.equal(documentDisplayValue('30 Days مدة التسليم','en'),'30 Days');
  assert.equal(documentDisplayValue('English only remarks','ar'),'');
  assert.equal(documentDisplayValue('English العربية','bilingual'),'English العربية');
  assert.equal(documentDisplayValue('EXW','ar','technical'),'EXW');
});

test('v151 reports language mismatch before PDF, print, share or issue',()=>{
  const company={...defaultCompany(),nameEn:'LOUREX',defaultLanguage:'en',defaultCurrency:'دولار'};
  const doc=createBlankDocument('proforma','PI-2026-0099',company);
  doc.customerSnapshot=customerSnapshotFrom({id:'c1',companyNameEn:'Buyer',companyNameAr:'المشتري',contactPerson:'',addressEn:'Riyadh',addressAr:'الرياض',city:'Riyadh',country:'Saudi Arabia',phone:'',email:'',vatTaxNumber:'',commercialRegistration:''});
  doc.items[0]={...doc.items[0],descriptionEn:'Product',descriptionAr:'منتج',origin:'رومانيا',unit:'كرتون',unitPrice:'10'};
  doc.terms.paymentTerms='30% دفعة مقدمة و70% قبل الشحن';
  doc.terms.finalDestination='المملكة العربية السعودية';
  doc.terms.remarks='ملاحظات عربية فقط';
  doc.notes='ملاحظة عربية';
  assert.equal(documentCurrency(doc),'USD');
  assert.equal(hasDocumentLanguageMismatch(doc),true);
  assert.ok(documentQualityIssues(doc).some(issue=>issue.code==='language-mismatch'&&issue.level==='warning'));
});

test('v151 renderer and offline shell use the central language isolation layer',async()=>{
  const [renderer,review,sw]=await Promise.all([
    readFile('src/templates/TemplateRenderer.tsx','utf8'),
    readFile('src/components/DocumentReviewModal.tsx','utf8'),
    readFile('public/sw.js','utf8')
  ]);
  assert.match(renderer,/documentCurrency/);
  assert.match(renderer,/documentDisplayValue/);
  assert.match(renderer,/safeValue\(doc,t\.finalDestination/);
  assert.match(renderer,/safeValue\(doc,doc\.notes\)/);
  assert.match(review,/language-mismatch/);
  assert.match(sw,/\.\/src\/lib\/document-language\.js/);
  assert.match(sw,/const CACHE = 'lourex-invoice-v151'/);
});

test('English document identity uses English-only text, without Arabic fallback; bilingual output preserves both',async()=>{
  const renderer=await readFile('src/templates/TemplateRenderer.tsx','utf8');
  const section=renderer.slice(renderer.indexOf('function identityOutputValues('),renderer.indexOf('function identityPair('));
  assert.ok(section.startsWith('function identityOutputValues('));
  const ctx={documentDisplayValue};
  vm.runInNewContext(ts.transpileModule(section,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText+';this.identityOutputValues=identityOutputValues;',ctx);
  const value=ctx.identityOutputValues;
  assert.deepEqual(Array.from(value({language:'en'},'','اسم عربي فقط')),[],
    'English print must not display an Arabic-only legal identity');
  assert.deepEqual(Array.from(value({language:'en'},'English Company','اسم عربي')),['English Company']);
  assert.deepEqual(Array.from(value({language:'bilingual'},'English Company','اسم عربي')),['English Company','اسم عربي']);
  assert.deepEqual(Array.from(value({language:'ar'},'English Company','')),['English Company'],
    'Arabic-mode historical fallback remains available');
  assert.match(renderer,/return identityPair\(doc, doc\.companySnapshot\.nameEn, doc\.companySnapshot\.nameAr\)/);
  assert.match(renderer,/return identityPair\(doc, c\?\.companyNameEn \?\? '', c\?\.companyNameAr \?\? ''\)/);
  assert.match(renderer,/if\(doc\.language==='en'\)return documentDisplayValue\(doc\.companySnapshot\.nameEn,'en'\)\|\|'LOUREX'/);
});

test('document review checks the identity visible in the chosen output language and only blocks issuing incomplete new documents',async()=>{
  const review=await readFile('src/components/DocumentReviewModal.tsx','utf8');
  const section=review.slice(review.indexOf('function reviewIdentityName('),review.indexOf('function reviewParty('));
  assert.ok(section.startsWith('function reviewIdentityName('));
  const ctx={documentDisplayValue};
  vm.runInNewContext(ts.transpileModule(section,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText+';this.reviewIdentityName=reviewIdentityName;',ctx);
  const name=ctx.reviewIdentityName;
  assert.equal(name('en','','اسم عربي'),'','English legal identity must not silently use Arabic name');
  assert.equal(name('en','Legal Buyer','اسم عربي'),'Legal Buyer');
  assert.equal(name('ar','Legal Buyer',''),'Legal Buyer');
  assert.equal(name('bilingual','Legal Buyer','اسم عربي'),'Legal Buyer / اسم عربي');
  assert.match(review,/const party=reviewParty\(doc\)/);
  assert.match(review,/const company=reviewIdentityName\(doc\.language,doc\.companySnapshot\.nameEn,doc\.companySnapshot\.nameAr\)/);
  assert.match(review,/const identityReady=Boolean\(party\.name&&company\)/);
  assert.match(review,/const blocked=!final&&!identityReady/);
  assert.match(review,/disabled=\{working\|\|blocked\|\|mode==='issue'&&final\}/);
  assert.match(review,/Document identity incomplete/);
});
