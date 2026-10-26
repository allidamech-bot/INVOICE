import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {normalizeDecimalInput,decimalToScaled} from '../dist/src/lib/money.js';

// Exercise the actual client sanitizer, including its identity/price guards.
const source=readFileSync('src/components/AiCopilot.tsx','utf8');
const helpers=source.slice(source.indexOf('const MONEY_INPUT='),source.indexOf('function draftReference('));
const item=source.slice(source.indexOf('function safeDraftItem('),source.indexOf('function safeTermsPatch('));
const context={exports:{},normalizeDecimalInput,decimalToScaled};
vm.runInNewContext(ts.transpile(helpers+item+'\nexports.safeDraftItem=safeDraftItem;',{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}),context);
const sanitize=(message,unit,patch={})=>context.exports.safeDraftItem({savedItemId:'',descriptionEn:'QA Chips',descriptionAr:'',quantity:'50',unit,unitPrice:'',...patch},{drafting:{items:[]}},message,'USD');

test('explicit carton unit survives Arabic/English translation without linking an ungrounded product',()=>{
 for(const [message,unit] of [
  ['سويلي عرض سعر ب٥٠ كرتون منه','Carton'],
  ['سويلي عرض سعر ب50 كرتونة منه','CTN'],
  ['سويلي عرض سعر ٥٠ كراتين منه','cartons'],
  ['Prepare a quotation for 50 cartons of it','كرتون'],
 ]){
  const row=sanitize(message,unit);assert.equal(row.quantity,'50');assert.equal(row.unit,unit);
  assert.equal(row.savedItemId,'');assert.equal(row.unitPrice,'');
 }
});
test('missing or unrelated units, fabricated prices and unknown IDs remain ungrounded',()=>{
 for(const message of ['سويلي عرض سعر ب٥٠ منه','Prepare 50 pieces','اعرض ٥٠ كرتونيات'])assert.equal(sanitize(message,'Carton').unit,'');
 assert.equal(sanitize('سويلي عرض سعر ب٥٠ كرتون منه','').unit,'','Do not invent an omitted model unit');
 assert.equal(sanitize('سويلي عرض سعر ب٥٠ كرتون منه','box').unit,'','Carton does not authorize a box conversion');
 const row=sanitize('سويلي عرض سعر ب٥٠ كرتون منه','Carton',{savedItemId:'unverified-id',unitPrice:'7.50'});
 assert.equal(row.savedItemId,'');assert.equal(row.unitPrice,'');assert.equal(row.unit,'Carton');
});
