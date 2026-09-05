import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
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

test('English document identity never falls back to Arabic-only names or addresses',async()=>{
  const renderer=await readFile('src/templates/TemplateRenderer.tsx','utf8');
  assert.match(renderer,/if\(doc\.language==='en'\)return <span dir="auto">\{documentDisplayValue\(english,'en'\)\|\|'—'\}<\/span>/);
  assert.doesNotMatch(renderer,/if\(doc\.language==='en'\)[^\n]*english\|\|arabic/);
  assert.match(renderer,/if\(doc\.language==='en'\)return documentDisplayValue\(doc\.companySnapshot\.nameEn,'en'\)\|\|'LOUREX'/);
  assert.doesNotMatch(renderer,/if\(doc\.language==='en'\)return doc\.companySnapshot\.nameEn\.trim\(\)\|\|doc\.companySnapshot\.nameAr\.trim\(\)/);
});

test('final review identity follows rendered document language and blocks only new issue when output identity is missing',async()=>{
  const review=await readFile('src/components/DocumentReviewModal.tsx','utf8');
  assert.doesNotMatch(review,/isArabic\(\)\?\(doc\.customerSnapshot/);
  assert.match(review,/documentDisplayValue/);
  assert.match(review,/function reviewIdentityName/);
  assert.match(review,/if\(language==='en'\)return documentDisplayValue\(en,'en'\)/);
  assert.match(review,/if\(language==='ar'\)return ar\|\|en/);
  assert.match(review,/filter\(Boolean\)\.join\(' \/ '\)/);
  assert.match(review,/const identityReady=Boolean\(customer&&company\)/);
  assert.match(review,/const blocked=!final&&!identityReady/);
  assert.match(review,/disabled=\{working\|\|blocked\|\|mode==='issue'&&final\}/);
  assert.match(review,/Document identity incomplete/);
});
