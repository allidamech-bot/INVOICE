const money=v=>{if(typeof v!=='string'||!/^(?:0|[1-9]\d{0,17})\.\d{2}$/.test(v))throw Error('FISCAL_RECON_MONEY_INVALID');return BigInt(v.replace('.',''));};
const format=n=>(n<0n?'-':'')+String((n<0n?-n:n)/100n)+'.'+String((n<0n?-n:n)%100n).padStart(2,'0');
const scaled=(v,d)=>{if(typeof v!=='string'||!/^\d+(?:\.\d+)?$/.test(v)||v.length>40)throw Error('FISCAL_RECON_DECIMAL_INVALID');const [a,b='']=v.split('.');if(b.length>d)throw Error('FISCAL_RECON_DECIMAL_INVALID');return BigInt(a+b.padEnd(d,'0'));};
const day=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
const value=(q,c)=>(q*scaled(c,12)+50000000000000n)/100000000000000n;
const scope=(a,b)=>a.workspaceId===b.workspaceId&&a.branchId===b.branchId&&a.currency===b.currency;
// This proves original inbound cost and supplier-payment consistency only.
// It never allocates recoverable VAT to lines or treats a preview as a filing.
export function reconcileDomesticPurchase({purchase,amount,landedTotal,payableTotal=landedTotal,movements,payments,through}){
 if(!day(through)||!day(purchase.date)||purchase.date>through||purchase.status!=='posted'||amount.kind!=='invoice'||amount.treatment!=='domestic'||!purchase.supplierSnapshot?.sourceSupplierId)throw Error('FISCAL_RECON_PURCHASE_INVALID');
 const legacy=money(landedTotal),commercialPayable=money(payableTotal),gross=money(amount.gross),net=money(amount.net),vat=money(amount.vat),deductible=money(amount.deductibleVat);
 if(net+vat!==gross||deductible>vat)throw Error('FISCAL_RECON_PURCHASE_INVALID');
 let expectedStock=0n,actualStock=0n,paid=0n,stockMatches=true,paymentsMatch=true;
 const expected=new Map(),actual=new Map(),movementIds=new Set(),paymentIds=new Set();
 const add=(map,key,q,c)=>{const old=map.get(key)||[0n,0n];map.set(key,[old[0]+q,old[1]+c]);};
 for(const line of purchase.items){if(!line.savedItemId)continue;const q=scaled(line.quantity,4),c=value(q,line.landedUnitCost||line.unitCost);if(q<=0n)throw Error('FISCAL_RECON_PURCHASE_INVALID');expectedStock+=c;add(expected,line.savedItemId,q,c);}
 for(const m of movements){if(m.sourceId!==purchase.id||!['purchase','purchase-reversal'].includes(m.type))continue;
   if(!day(m.date)){stockMatches=false;continue;}if(m.date>through)continue;
   if(!scope(m,purchase)||!m.id||movementIds.has(m.id)||m.type!=='purchase'||m.date!==purchase.date){stockMatches=false;continue;}movementIds.add(m.id);
   const q=scaled(m.quantity,4),c=value(q,m.unitCost);if(q<=0n){stockMatches=false;continue;}actualStock+=c;add(actual,m.itemId,q,c);
 }
 if(expected.size!==actual.size||[...expected].some(([id,[q,c]])=>actual.get(id)?.[0]!==q||actual.get(id)?.[1]!==c))stockMatches=false;
 for(const p of payments){if(p.purchaseId!==purchase.id)continue;if(!day(p.date)){paymentsMatch=false;continue;}if(p.date>through)continue;
   if(!scope(p,purchase)||p.supplierId!==purchase.supplierSnapshot.sourceSupplierId||!p.id||paymentIds.has(p.id)||p.purchaseNumber!==purchase.number||p.date<purchase.date){paymentsMatch=false;continue;}paymentIds.add(p.id);
   if(p.voidedAt){const voidDate=String(p.voidedAt).slice(0,10);if(!day(voidDate)||voidDate<p.date){paymentsMatch=false;continue;}if(voidDate<=through)continue;}
   const n=money(p.amount);if(n<=0n){paymentsMatch=false;continue;}paid+=n;
 }
 if(paid>gross)paymentsMatch=false;
 const fiscalCost=gross-deductible;
 return {legacyPayable:format(commercialPayable),fiscalPayable:format(gross),paid:format(paid),legacyOutstanding:format(commercialPayable-paid),fiscalOutstanding:format(gross-paid),legacyCost:format(legacy),fiscalCost:format(fiscalCost),costDifference:format(legacy-fiscalCost),expectedInboundStock:format(expectedStock),recordedInboundStock:format(actualStock),stockMatches,paymentsMatch,matched:commercialPayable===gross&&legacy===fiscalCost&&stockMatches&&paymentsMatch};
}
