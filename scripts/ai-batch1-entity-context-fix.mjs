import {readFile,writeFile} from 'node:fs/promises';

async function patch(target,className,body){
  let source=await readFile(target,'utf8');
  const marker=`__lourexBatch1EntityContext_${className}`;
  if(source.includes(marker))throw new Error(`${className} entity context is already installed.`);
  if(!source.includes(`export class ${className}`))throw new Error(`AI Batch 1 could not find ${className}.`);
  source=`import { registerAssistantEntity } from '../lib/ai-assistant-foundation.js';\n${source}\n${body}\nconst ${marker}=true;\n`;
  await writeFile(target,source);
}

await patch('dist/src/components/ProductLibraryWorkspace.js','ProductLibraryWorkspace',`
function __lourexBatch1SyncProductEntity(instance){
  const edit=instance.state?.editing;
  const saved=edit&&instance.props?.items?.find(item=>item.id===edit.id);
  if(!saved){registerAssistantEntity('items',null);return;}
  registerAssistantEntity('items',{type:'product',id:saved.id,label:(saved.descriptionEn||saved.descriptionAr||saved.sku||'Product').trim(),meta:{sku:saved.sku||''}});
}
const __lourexProductMount=ProductLibraryWorkspace.prototype.componentDidMount;
ProductLibraryWorkspace.prototype.componentDidMount=function(){__lourexProductMount?.call(this);__lourexBatch1SyncProductEntity(this);};
const __lourexProductUpdate=ProductLibraryWorkspace.prototype.componentDidUpdate;
ProductLibraryWorkspace.prototype.componentDidUpdate=function(...args){__lourexProductUpdate?.apply(this,args);__lourexBatch1SyncProductEntity(this);};
const __lourexProductUnmount=ProductLibraryWorkspace.prototype.componentWillUnmount;
ProductLibraryWorkspace.prototype.componentWillUnmount=function(){registerAssistantEntity('items',null);__lourexProductUnmount?.call(this);};
`);

await patch('dist/src/components/OperationsPage.js','OperationsPage',`
function __lourexBatch1SyncOperationsEntity(instance){
  const profileId=String(instance.state?.supplierProfileId||'');
  const profile=profileId&&instance.props?.suppliers?.find(row=>row.id===profileId);
  if(profile){registerAssistantEntity('operations',{type:'supplier',id:profile.id,label:(profile.nameEn||profile.nameAr||profile.contactPerson||'Supplier').trim()});return;}
  const supplierEdit=instance.state?.supplierEdit;
  const savedSupplier=supplierEdit&&instance.props?.suppliers?.find(row=>row.id===supplierEdit.id);
  if(savedSupplier){registerAssistantEntity('operations',{type:'supplier',id:savedSupplier.id,label:(savedSupplier.nameEn||savedSupplier.nameAr||savedSupplier.contactPerson||'Supplier').trim()});return;}
  const purchaseEdit=instance.state?.purchaseEdit;
  const savedPurchase=purchaseEdit&&instance.props?.purchases?.find(row=>row.id===purchaseEdit.id);
  if(savedPurchase){registerAssistantEntity('operations',{type:'purchase',id:savedPurchase.id,label:savedPurchase.number||'Purchase',meta:{status:savedPurchase.status||'',currency:savedPurchase.currency||''}});return;}
  registerAssistantEntity('operations',null);
}
const __lourexOperationsMount=OperationsPage.prototype.componentDidMount;
OperationsPage.prototype.componentDidMount=function(){__lourexOperationsMount?.call(this);__lourexBatch1SyncOperationsEntity(this);};
const __lourexOperationsUpdate=OperationsPage.prototype.componentDidUpdate;
OperationsPage.prototype.componentDidUpdate=function(...args){__lourexOperationsUpdate?.apply(this,args);__lourexBatch1SyncOperationsEntity(this);};
const __lourexOperationsUnmount=OperationsPage.prototype.componentWillUnmount;
OperationsPage.prototype.componentWillUnmount=function(){registerAssistantEntity('operations',null);__lourexOperationsUnmount?.call(this);};
`);

await patch('dist/src/components/ReportsPage.js','ReportsPage',`
function __lourexBatch1SyncReportEntity(instance){
  const state=instance.state||{};
  registerAssistantEntity('reports',{type:'report',id:'current-report',label:'Current report filters',meta:{view:String(state.view||'performance'),from:String(state.from||''),to:String(state.to||''),currency:String(state.currency||'ALL'),query:String(state.query||''),preset:String(state.preset||'')}});
}
const __lourexReportsMount=ReportsPage.prototype.componentDidMount;
ReportsPage.prototype.componentDidMount=function(){__lourexReportsMount?.call(this);__lourexBatch1SyncReportEntity(this);};
const __lourexReportsUpdate=ReportsPage.prototype.componentDidUpdate;
ReportsPage.prototype.componentDidUpdate=function(...args){__lourexReportsUpdate?.apply(this,args);__lourexBatch1SyncReportEntity(this);};
const __lourexReportsUnmount=ReportsPage.prototype.componentWillUnmount;
ReportsPage.prototype.componentWillUnmount=function(){registerAssistantEntity('reports',null);__lourexReportsUnmount?.call(this);};
`);

console.log('LOUREX AI Batch 1 exact entity context installed for products, suppliers/purchases and report filters.');
