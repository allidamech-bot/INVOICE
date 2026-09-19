import test from 'node:test';
import assert from 'node:assert/strict';
import { createBlankDocument } from '../dist/src/lib/documents.js';
import { defaultCompany } from '../dist/src/lib/defaults.js';
import { buildAiFinanceContext } from '../dist/src/lib/ai-finance.js';

function invoiceWithCost(unitCost){
  const doc=createBlankDocument('invoice','INV-2026-9901',defaultCompany());
  doc.status='final';
  doc.issueDate='2026-09-19';
  doc.dueDate='2026-10-19';
  doc.items=[{
    id:'line-1',descriptionEn:'Precision item',descriptionAr:'صنف دقة',hsCode:'',origin:'',packing:'',
    quantity:'1000',unit:'PCS',unitPrice:'2.00',unitCost
  }];
  return doc;
}

test('v266 AI finance product performance preserves high-precision landed unit costs',()=>{
  const context=buildAiFinanceContext({documents:[invoiceWithCost('1.00001')],payments:[],customers:[]},'product profitability','2026-09-19');
  assert.ok(context.productLinePerformance);
  const row=context.productLinePerformance.rows.find(item=>item.name==='Precision item');
  assert.ok(row);
  assert.equal(row.lineRevenue,'2000.00');
  assert.equal(row.lineCost,'1000.01');
  assert.equal(row.lineGrossProfit,'999.99');
  assert.equal(row.profitComplete,true);
  assert.equal(row.missingCostItems,0);
});

test('v266 AI finance rejects a negative micro-cost instead of rounding it to zero',()=>{
  const context=buildAiFinanceContext({documents:[invoiceWithCost('-0.00001')],payments:[],customers:[]},'product profitability','2026-09-19');
  assert.ok(context.productLinePerformance);
  const row=context.productLinePerformance.rows.find(item=>item.name==='Precision item');
  assert.ok(row);
  assert.equal(row.lineCost,'');
  assert.equal(row.lineGrossProfit,'');
  assert.equal(row.marginPercent,'');
  assert.equal(row.profitComplete,false);
  assert.equal(row.missingCostItems,1);
});
