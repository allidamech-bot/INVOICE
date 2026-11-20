import {hashArtifact} from './fiscal-artifacts.js';
import {validateSourceBinding} from './commercial-source.js';

const MAX=512*1024;
function need(ok,code='FISCAL_PREPARATION_NOT_ELIGIBLE'){if(!ok)throw Error(code);}
export function readApprovedIntent(row,scope,documentId){
  const v=row.exists?row.data():null;
  need(v&&['simulation','production'].includes(scope?.environment)&&v.environment===scope.environment&&v.accountUid===scope.accountUid&&v.workspaceId===scope.workspaceId&&v.egsId===scope.egsId&&v.documentId===documentId&&v.state==='approved'&&typeof v.bytes==='string'&&v.bytes.length<=Math.ceil(MAX/3)*4);
  const bytes=Buffer.from(v.bytes,'base64');
  need(bytes.length>0&&bytes.length<=MAX&&bytes.toString('base64')===v.bytes&&hashArtifact(bytes)===v.sha256);
  let payload;try{payload=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{need(false);}
  need(payload&&payload.document?.id===documentId&&typeof payload.generatedAt==='string'&&payload.generatedAt===v.generatedAt&&payload.document.revision===v.documentRevision);
  validateSourceBinding(payload.source);
  return {payload,bytes,digest:v.sha256};
}
