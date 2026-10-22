import type {LourexDocument} from '../types.js';
import {automaticElectronicDocument} from './secure-share.js';

export interface AiChatPdfQrPlan {
  document:LourexDocument;
  electronicShareId:string;
  offlineCopy:boolean;
}

/**
 * A required electronic QR cannot disappear silently when cloud sharing fails.
 * A separate explicit, user-chosen LOCAL preview may be exported with a visible
 * watermark, without changing the issued document or its stored snapshot.
 */
export async function planAiChatPdfQr(
  document:LourexDocument,
  createShare:()=>Promise<string>,
  allowOfflineCopy=false
):Promise<AiChatPdfQrPlan>{
  if(!automaticElectronicDocument(document))
    return{document,electronicShareId:'',offlineCopy:false};
  if(allowOfflineCopy){
    const copy=structuredClone(document);
    copy.appearance={
      ...copy.appearance,
      watermark:{...copy.appearance.watermark,enabled:true,type:'text',text:'LOCAL COPY - NO QR',pattern:'single'}
    };
    return{document:copy,electronicShareId:'',offlineCopy:true};
  }
  const token=await createShare(); // Propagate failures: QR is required by default.
  if(!token)throw new Error('Electronic QR reference is missing. Retry the QR connection.');
  return{document,electronicShareId:token,offlineCopy:false};
}
