import type { DocumentEventRecord } from '../types.js';
import { commercialTrackingEventKind, createCommercialTrackingEvent, isQuoteLikeDocument } from './commercial-flow.js';
import type { SecureShareRecord } from './secure-share.js';
import { mutateVaultSafely } from '../storage/vault-mutation-bridge.js';

function hasEvidence(events:DocumentEventRecord[],shareId:string,kind:string):boolean{return events.some(event=>event.relatedDocumentId===shareId&&commercialTrackingEventKind(event)===kind);}

export async function syncSecureShareEvidence(shares:SecureShareRecord[]):Promise<void>{
  if(!shares.length)return;
  await mutateVaultSafely(vault=>{
    let changed=false;const events=[...vault.documentEvents];
    for(const share of shares){
      const doc=vault.documents.find(item=>item.id===share.documentId);if(!doc||!isQuoteLikeDocument(doc))continue;
      if(share.viewedAt&&!hasEvidence(events,share.id,'viewed')){events.push(createCommercialTrackingEvent(doc,'viewed','',share.viewedAt,share.id,'Secure share'));changed=true;}
      if(share.customerComment&&share.commentAt&&!hasEvidence(events,share.id,'commented')){events.push(createCommercialTrackingEvent(doc,'commented',share.customerComment,share.commentAt,share.id,'Secure share'));changed=true;}
      if(share.decision&&share.decisionAt&&!hasEvidence(events,share.id,share.decision)){const payload=share.decision==='rejected'?(share.customerComment||'Rejected through secure customer portal.'):share.customerComment;events.push(createCommercialTrackingEvent(doc,share.decision,payload,share.decisionAt,share.id,'Secure share'));changed=true;}
    }
    return changed?{...vault,documentEvents:events}:vault;
  });
}
