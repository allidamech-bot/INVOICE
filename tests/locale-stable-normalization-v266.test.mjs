import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { importableProducts, planProductImport } from '../dist/src/lib/product-import.js';
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

    const mergeSource=await readFile('src/storage/vault-merge.ts','utf8');
    assert.doesNotMatch(mergeSource,/savedItemSku[^\n]*toLocaleUpperCase\(\)/);
  }finally{
    String.prototype.toLocaleLowerCase=originalLower;
    String.prototype.toLocaleUpperCase=originalUpper;
  }
});
