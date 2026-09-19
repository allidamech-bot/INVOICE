import test from 'node:test';
import assert from 'node:assert/strict';
import { importableProducts, planProductImport } from '../dist/src/lib/product-import.js';
import { normalizeSavedItemIdentity, normalizeSavedItemSku } from '../dist/src/lib/saved-items.js';

test('v266 product import and saved-item identity stay stable under Turkish locale casing',()=>{
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
  }finally{
    String.prototype.toLocaleLowerCase=originalLower;
    String.prototype.toLocaleUpperCase=originalUpper;
  }
});
