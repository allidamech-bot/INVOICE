import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { importableProducts, planProductImport } from '../dist/src/lib/product-import.js';
import { analyzeProductImport } from '../dist/src/lib/product-import-intelligence.js';
import { normalizeSavedItemIdentity, normalizeSavedItemSku } from '../dist/src/lib/saved-items.js';
import { receivableCustomerId } from '../dist/src/lib/receivables.js';
import { paymentTermPresetByLabel } from '../dist/src/lib/commercial-controls.js';

test('v266 business identity stays stable under Turkish locale casing',async()=>{
  const originalLower=String.prototype.toLocaleLowerCase;
  const originalUpper=String.prototype.toLocaleUpperCase;
  String.prototype.toLocaleLowerCase=function(...args){return args.length?originalLower.apply(this,args):originalLower.call(this,'tr-TR');};
  String.prototype.toLocaleUpperCase=function(...args){return args.length?originalUpper.apply(this,args):originalUpper.call(this,'tr-TR');};
  try{
    const matrix=[
      ['ITEM CODE','PRODUCT NAME','SELLING PRICE USD','UNIT COST USD'],
      ['item-i','INDIGO BISCUIT','1.25','0.80']
    ];
    const analysis=analyzeProductImport(matrix);
    assert.equal(analysis.headerIndex,0);
    assert.equal(analysis.columns.find(column=>column.header==='ITEM CODE')?.field,'sku');
    assert.equal(analysis.columns.find(column=>column.header==='SELLING PRICE USD')?.field,'lastUnitPrice');
    assert.equal(analysis.columns.find(column=>column.header==='UNIT COST USD')?.field,'lastUnitCost');

    const plan=planProductImport(matrix,[],'SAR',true);
    assert.deepEqual(plan.counts,{create:1,update:0,skip:0,error:0});
    const item=importableProducts(plan)[0];
    assert.equal(item.sku,'item-i');
    assert.equal(item.lastUnitPrice,'1.25');
    assert.equal(item.lastCurrency,'USD');
    assert.equal(item.lastUnitCost,'0.80');
    assert.equal(normalizeSavedItemSku('item-i'),'ITEM-I');
    assert.equal(normalizeSavedItemIdentity('INDIGO BISCUIT'),'indigo biscuit');

    const legacyDoc={id:'doc-i',customerSnapshot:{sourceCustomerId:'',companyNameEn:'INDIGO IMPORT',companyNameAr:'',email:'INFO@INDIGO.EXAMPLE',phone:''}};
    assert.equal(receivableCustomerId(legacyDoc),'legacy:indigo import|info@indigo.example');

    const company={commercial:{paymentTermPresets:[{id:'net-invoice',label:'INVOICE TERMS',days:30}]}};
    assert.equal(paymentTermPresetByLabel(company,'invoice terms')?.id,'net-invoice');

    const sourcePaths=[
      'src/storage/vault-merge.ts',
      'src/lib/product-pricing-intelligence.ts',
      'src/lib/supplier-purchasing-intelligence.ts',
      'src/lib/ai-finance.ts',
      'src/lib/product-import-intelligence.ts',
      'src/components/ReportsPage.tsx',
      'src/components/ReceivablesPage.tsx',
      'src/components/CustomersPage.tsx',
      'src/components/ProductLibraryWorkspace.tsx',
      'src/components/SavedItemsModal.tsx',
      'src/components/AiCopilot.tsx',
      'src/components/SupplierDocumentImport.tsx'
    ];
    const sources=await Promise.all(sourcePaths.map(path=>readFile(path,'utf8')));
    const mergeSource=sources[0];
    assert.doesNotMatch(mergeSource,/savedItemSku[^\n]*toLocaleUpperCase\(\)/);
    for(let index=1;index<sources.length;index+=1){
      assert.doesNotMatch(sources[index],/\.toLocaleLowerCase\(\)/,`${sourcePaths[index]} must not use environment-dependent lower casing for matching`);
      assert.doesNotMatch(sources[index],/\.toLocaleUpperCase\(\)/,`${sourcePaths[index]} must not use environment-dependent upper casing for matching`);
    }
  }finally{
    String.prototype.toLocaleLowerCase=originalLower;
    String.prototype.toLocaleUpperCase=originalUpper;
  }
});
