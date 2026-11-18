import {reviewDigest} from './commercial-source.js';
const need=ok=>{if(!ok)throw Error('FISCAL_COST_HISTORY_LOCKED');};
const fields=['workspaceId','branchId','lastUnitCost','lastCostCurrency'];
const same=(a,b)=>a&&b&&reviewDigest(a)===reviewDigest(b);
// Guard previously reviewed cost attribution and prospective catalog basis.
// Unrelated items and ordinary production workspaces are never restricted.
export async function assertFiscalCostContinuity(db,tx,{accountUid,workspaceId},before,candidate){
 const oldItems=new Map((before.savedItems??[]).filter(x=>x.workspaceId===workspaceId).map(x=>[x.id,x])),newItems=new Map((candidate.savedItems??[]).filter(x=>x.workspaceId===workspaceId).map(x=>[x.id,x]));
 const changedItems=new Set([...oldItems.keys()].filter(id=>!newItems.has(id)||fields.some(k=>oldItems.get(id)[k]!==newItems.get(id)[k])));
 const oldMoves=new Map((before.inventoryMovements??[]).filter(x=>x.workspaceId===workspaceId).map(x=>[x.id,x])),newMoves=new Map((candidate.inventoryMovements??[]).filter(x=>x.workspaceId===workspaceId).map(x=>[x.id,x]));
 const changedMoves=new Set([...new Set([...oldMoves.keys(),...newMoves.keys()])].filter(id=>!same(oldMoves.get(id),newMoves.get(id))));
 if(!changedItems.size&&!changedMoves.size)return;
 const snapshot=await tx.get(db.collection('fiscalPrivateV1/'+accountUid+'/workspaces/'+workspaceId+'/purchaseCostCorrections').limit(201));need(snapshot.docs.length<=200);
 for(const x of snapshot.docs){
   const r=x.data();need(r.accountUid===accountUid&&r.workspaceId===workspaceId&&r.environment==='simulation'&&r.purchaseId===x.id&&Array.isArray(r.plan?.updates));
   const history=r.plan.historyBindings??[],tracked=new Set(r.plan.lines.filter(l=>l.itemId).map(l=>l.itemId));
   for(const h of history){const m=newMoves.get(h.movementId);need(m&&reviewDigest(m)===h.digest);}
   // No new backdated stock changes can invalidate a reviewed historical lot.
   for(const id of changedMoves){const m=newMoves.get(id);if(!m||oldMoves.has(id)||!tracked.has(m.itemId)||!history.length)continue;need(m.date>=r.effectiveDate&&typeof m.createdAt==='string'&&Date.parse(m.createdAt)>=Date.parse(r.committedAt));}
   for(const u of r.plan.updates){if(!changedItems.has(u.itemId))continue;const old=oldItems.get(u.itemId),next=newItems.get(u.itemId);need(old&&next&&old.workspaceId===next.workspaceId&&old.branchId===next.branchId);
     // Replacing the catalog basis is only valid with an actual newly posted
     // purchase receipt at the new basis. A stale device/manual override fails.
     const fresh=(candidate.purchases??[]).filter(p=>p.status==='posted'&&p.workspaceId===workspaceId&&p.branchId===next.branchId&&p.currency===next.lastCostCurrency&&p.date>=r.effectiveDate&&!(before.purchases??[]).some(y=>y.id===p.id&&y.status==='posted'));
     const valid=fresh.some(p=>p.items.some(l=>l.savedItemId===next.id&&l.sku===next.sku&&l.unit===next.unit&&(l.landedUnitCost||l.unitCost)===next.lastUnitCost&&[...changedMoves].some(id=>{const m=newMoves.get(id);return !oldMoves.has(id)&&m&&m.sourceId===p.id&&m.type==='purchase'&&m.itemId===next.id&&m.workspaceId===workspaceId&&m.branchId===next.branchId&&m.currency===p.currency&&m.unitCost===next.lastUnitCost&&m.date===p.date&&typeof m.quantity==='string'&&!m.quantity.startsWith('-');})));
     need(valid);
   }
 }
}
