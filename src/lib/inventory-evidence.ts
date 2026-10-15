import type {DocumentAttachment,InventoryMovementRecord} from '../types.js';
import {makeId} from './id.js';

/**
 * Evidence is stored in the authenticated account's UID-scoped Firestore
 * workspace record, not on a public bucket/CDN. The PIN-free workspace is
 * JSON/base64 and is NOT client-side encrypted; Firestore owner rules are required.
 * Do not accept arbitrary remote URLs or inline SVG/HTML.
 */
const MAX_BYTES=2*1024*1024;
const FILE_TYPES=new Set(['application/pdf','image/png','image/jpeg','image/webp','image/heic','image/heif']);
const TEXT_REASON_LIMIT=1000;
export const MOVEMENT_REASON_CATEGORIES=['samples','gift','damage','loss','count','correction','opening','other'] as const;

function validMagic(mime:string,bytes:Uint8Array):boolean{
  if(mime==='application/pdf')return bytes.length>=5&&bytes[0]===37&&bytes[1]===80&&bytes[2]===68&&bytes[3]===70&&bytes[4]===45;
  if(mime==='image/png')return bytes.length>=8&&[137,80,78,71,13,10,26,10].every((n,i)=>bytes[i]===n);
  if(mime==='image/jpeg')return bytes.length>=3&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
  if(mime==='image/webp')return bytes.length>=12&&String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP';
  if(mime==='image/heic'||mime==='image/heif')return bytes.length>=12&&String.fromCharCode(...bytes.slice(4,8))==='ftyp'&&['heic','heix','hevc','hevx','mif1','msf1'].includes(String.fromCharCode(...bytes.slice(8,12)).toLowerCase());
  return false;
}
function safeFilename(name:string):boolean{return name.length>0&&name.length<=180&&!/[\\/\x00-\x1F]/.test(name);}
function fail(msg:string):never{throw new Error(msg);}

export function validateManualMovementEvidence(movement:InventoryMovementRecord):void{
  if(!['opening','issue','adjustment'].includes(movement.type))return;
  const note=movement.note?.trim()||'';
  if(note.length<5||note.length>TEXT_REASON_LIMIT)
    fail('A written inventory movement reason (at least 5 characters) is required.');
  if(!movement.reasonCategory||!MOVEMENT_REASON_CATEGORIES.includes(movement.reasonCategory as typeof MOVEMENT_REASON_CATEGORIES[number]))
    fail('Choose a valid inventory movement reason category.');
  if(!movement.createdBy?.trim())fail('The movement operator identity is required.');
  const evidence=movement.evidence;
  if(!evidence||!safeFilename(evidence.name)||!evidence.id||!evidence.createdAt||!FILE_TYPES.has(evidence.mimeType))
    fail('A saved PDF or image evidence attachment is required.');
  if(!Number.isSafeInteger(evidence.size)||evidence.size<8||evidence.size>MAX_BYTES)
    fail('Movement evidence must be a valid PDF/image smaller than 2 MB.');
  const match=/^data:([a-z]+\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/]+={0,2})$/.exec(evidence.dataUrl||'');
  if(!match||match[1]!==evidence.mimeType)fail('Movement evidence must be stored as a local, verified attachment.');
  const encoded=match[2]!;
  const actualBytes=encoded.length*3/4-(encoded.endsWith('==')?2:encoded.endsWith('=')?1:0);
  if(!Number.isInteger(actualBytes)||actualBytes!==evidence.size)
    fail('Movement evidence content size is inconsistent.');
  let bytes:Uint8Array;
  try{const decoded=atob(encoded.slice(0,32));bytes=Uint8Array.from(decoded,character=>character.charCodeAt(0));}
  catch{fail('Movement evidence content is not valid base64.');}
  if(!validMagic(evidence.mimeType,bytes))fail('Evidence file signature does not match PDF/image type.');
}

export async function readManualMovementEvidence(file:File):Promise<DocumentAttachment>{
  if(!FILE_TYPES.has(file.type)||file.size>MAX_BYTES||file.size<8||!safeFilename(file.name))
    fail('Select a PDF, JPG, PNG, WebP or HEIC file up to 2 MB.');
  const signature=new Uint8Array(await file.slice(0,32).arrayBuffer());
  if(!validMagic(file.type,signature))fail('Attachment signature is invalid.');
  const dataUrl=await new Promise<string>((resolve,reject)=>{
    const reader=new FileReader();
    reader.onerror=()=>reject(new Error('Unable to read the evidence attachment.'));
    reader.onload=()=>typeof reader.result==='string'?resolve(reader.result):reject(new Error('Evidence file did not load.'));
    reader.readAsDataURL(file);
  });
  const attachment:DocumentAttachment={id:makeId('movement-proof'),name:file.name,mimeType:file.type,size:file.size,dataUrl,createdAt:new Date().toISOString()};
  return attachment;
}
