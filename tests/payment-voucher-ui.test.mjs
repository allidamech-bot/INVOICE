import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {defaultCompany} from '../dist/src/lib/defaults.js';
import {createSupplier,createPurchase,createPurchaseItem,supplierSnapshotFrom} from '../dist/src/lib/operations.js';
const realm={};realm.self=realm;
vm.runInNewContext(await readFile('dist/vendor/react.production.min.js','utf8'),realm);
globalThis.React=realm.React;
globalThis.document={getElementById:()=>({}),body:{classList:{remove(){},add(){}}}};
const {PaymentVoucherModal}=await import('../dist/src/components/PaymentVoucherModal.js');
const {SupplierPayablesPage}=await import('../dist/src/components/SupplierPayablesPage.js');
function nodes(node,result=[]){if(!node||typeof node!=='object')return result;if(Array.isArray(node)){node.forEach(x=>nodes(x,result));return result;}result.push(node);nodes(node.props?.children,result);nodes(node.props?.footer,result);return result;}
function voucher(kind='customer-receipt',date='2099-01-05'){return{kind,recordId:'p',sourceId:'i',sourceNumber:'INV-QA',paymentReference:'R',amount:'25.00',currency:'USD',date,method:'cash',notes:'',partyNameEn:'Synthetic',partyNameAr:'',companyNameEn:'Current Company',companyNameAr:'',companyLogo:''};}
for(const kind of ['customer-receipt','supplier-disbursement'])test(kind+' visibly distinguishes future date without changing amount or source',()=>{
 const v=voucher(kind),before=JSON.stringify(v),modal=new PaymentVoucherModal({voucher:v,onClose(){}});
 const future=nodes(modal.render()).filter(x=>x.props?.['data-voucher-future']!==undefined);
 assert.equal(future.length,1);assert.match(future[0].props.children,/Future-dated payment/);
 assert.equal(nodes(modal.render()).filter(x=>x.props?.['data-voucher-company-current']!==undefined).length,kind==='supplier-disbursement'?1:0);
 assert.equal(JSON.stringify(v),before);
 modal.props={...modal.props,voucher:voucher(kind,'2020-01-05')};
 assert.equal(nodes(modal.render()).filter(x=>x.props?.['data-voucher-future']!==undefined).length,0);
});
test('closing the voucher releases print mode even when the browser omitted afterprint',()=>{
 const classes=new Set(['printing-payment-voucher']);
 document.body.classList={remove:x=>classes.delete(x),add:x=>classes.add(x)};
 const previous={voucher:voucher(),onClose(){}},modal=new PaymentVoucherModal(previous);
 modal.props={...previous,voucher:null};modal.componentDidUpdate?.(previous);
 assert.equal(classes.has('printing-payment-voucher'),false);
});
test('supplier can reach and open the thirteenth recorded payment without posting it again',()=>{
 const company=defaultCompany(),supplier={...createSupplier(),id:'supplier',nameEn:'Synthetic'};
 const purchases=Array.from({length:25},(_,i)=>{const p=createPurchase([],[supplier],'USD');Object.assign(p,{id:'purchase-'+i,number:'PUR-'+i,status:'posted',date:'2026-01-02',postedAt:'2026-01-02T00:00:00.000Z',supplierSnapshot:supplierSnapshotFrom(supplier),workspaceId:'default',branchId:'main'});p.items=[{...createPurchaseItem(),quantity:'1',unitCost:'100',descriptionEn:'Synthetic service'}];return p;});
 const supplierPayments=purchases.map((p,i)=>({id:'payment-'+i,purchaseId:p.id,purchaseNumber:p.number,supplierId:supplier.id,supplierNameEn:supplier.nameEn,supplierNameAr:'',workspaceId:'default',branchId:'main',currency:'USD',amount:'25.00',date:'2026-01-03',method:'cash',reference:'R',notes:'',createdAt:'2026-01-03T00:00:00.000Z',updatedAt:'2026-01-03T00:00:00.000Z'}));
 const props={company,suppliers:[supplier],purchases,supplierPayments,onSaveSupplierPayment:async()=>{throw Error('Unexpected financial write');},onDeleteSupplierPayment:async()=>{throw Error('Unexpected delete');}};
 const page=new SupplierPayablesPage(props);page.setState=next=>Object.assign(page.state,typeof next==='function'?next(page.state,page.props):next);
 const before=JSON.stringify(props),actions=()=>nodes(page.render()).filter(x=>typeof x.props?.children==='string'&&/Voucher \/ PDF/.test(x.props.children));
 // Existing twelve rows remain the first page; loading more must expose 13–24.
 assert.equal(actions().length,12);
 const more=()=>nodes(page.render()).find(x=>x.props?.['data-payments-more']!==undefined);
 assert.ok(more(),'older saved payments need a reachable action');more().props.onClick();assert.equal(actions().length,24);
 actions()[12].props.onClick();
 const view=nodes(page.render()).find(x=>x.type===PaymentVoucherModal);
 assert.equal(view.props.voucher.recordId,'payment-12');assert.equal(view.props.voucher.amount,'25.00');
 more().props.onClick();assert.equal(actions().length,25);assert.equal(more(),undefined);
 assert.equal(JSON.stringify(props),before);
});

test('unmount cancels a pending print so navigation cannot print unrelated UI',()=>{
 const previousWindow=globalThis.window,callbacks=new Map();let prints=0;
 globalThis.window={setTimeout:fn=>{callbacks.set(1,fn);return 1;},clearTimeout:id=>callbacks.delete(id),print:()=>prints++,removeEventListener(){}};
 try{
  const modal=new PaymentVoucherModal({voucher:voucher(),onClose(){}});
  modal.print();modal.componentWillUnmount();
  for(const callback of callbacks.values())callback();
  assert.equal(prints,0);
 }finally{globalThis.window=previousWindow;}
});
