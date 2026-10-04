import { requestAiJson } from './ai-request.js';
import { readablePdfText } from './pdf-source.js';
import { readSpreadsheetFile, spreadsheetSheetsAsText } from './spreadsheet-reader.js';

export type ConversationAttachmentRoute='customer'|'supplier'|'supplier_purchase'|'quote_request'|'product_list'|'unknown';
export interface ConversationAttachmentClassification{route:ConversationAttachmentRoute;documentType:string;confidence:number;reason:string;}
export interface ConversationAttachmentSource{
  id:string;
  fileName:string;
  mimeType:string;
  size:number;
  route:ConversationAttachmentRoute;
  documentType:string;
  confidence:number;
  reason:string;
  extracted:string;
}
export interface ConversationAttachmentAnalysis{source:ConversationAttachmentSource;file:File;}

type AiPayload={kind:'text'|'file';mimeType:string;text?:string;data?:string};

export const CONVERSATION_ATTACHMENT_ACCEPT='image/*,.pdf,.xlsx,.xls,.csv,.txt,text/plain,application/pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv';
export const MAX_CONVERSATION_ATTACHMENTS=4;
export const MAX_CONVERSATION_ATTACHMENT_TOTAL_BYTES=16_000_000;
const MAX_BINARY_BYTES=2_600_000;
const MAX_DOCUMENT_BYTES=12_000_000;
const MAX_TEXT_CHARS=120_000;
const MAX_EXTRACT_CHARS=12_000;

function id():string{return`conversation-source-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;}
function bytesToBase64(buffer:ArrayBuffer):string{const bytes=new Uint8Array(buffer);let binary='';for(let offset=0;offset<bytes.length;offset+=0x8000)binary+=String.fromCharCode(...bytes.subarray(offset,Math.min(offset+0x8000,bytes.length)));return btoa(binary);}
function boundedText(value:unknown,max=MAX_EXTRACT_CHARS):string{return String(value??'').normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,max);}
function compactJson(value:unknown,max=MAX_EXTRACT_CHARS):string{try{return JSON.stringify(value).slice(0,max);}catch{return boundedText(value,max);}}

export function validateConversationFiles(files:File[]):File[]{
  const selected=files.filter(Boolean).slice(0,MAX_CONVERSATION_ATTACHMENTS);
  if(files.length>MAX_CONVERSATION_ATTACHMENTS)throw new Error(`Attach up to ${MAX_CONVERSATION_ATTACHMENTS} files at a time.`);
  const total=selected.reduce((sum,file)=>sum+file.size,0);if(total>MAX_CONVERSATION_ATTACHMENT_TOTAL_BYTES)throw new Error('Attached files exceed the 16 MB conversation limit.');
  return selected;
}

export async function conversationAttachmentPayload(file:File):Promise<AiPayload>{
  const name=file.name.toLowerCase();
  if(name.endsWith('.pdf')||file.type==='application/pdf'){
    if(file.size>MAX_DOCUMENT_BYTES)throw new Error('PDF must be 12 MB or smaller.');
    const text=await readablePdfText(file,MAX_TEXT_CHARS);
    if(text.trim())return{kind:'text',mimeType:'text/plain',text};
  }
  if(name.endsWith('.xlsx')||name.endsWith('.xls')||name.endsWith('.csv')){
    if(file.size>MAX_DOCUMENT_BYTES)throw new Error('Spreadsheet must be 12 MB or smaller.');
    const sheets=await readSpreadsheetFile(file);const text=spreadsheetSheetsAsText(sheets,MAX_TEXT_CHARS);
    if(!text.trim())throw new Error('Spreadsheet has no readable business data.');
    return{kind:'text',mimeType:'text/csv',text};
  }
  if(name.endsWith('.txt')||file.type==='text/plain'){
    if(file.size>1_000_000)throw new Error('Text file is too large.');
    const text=await file.text();if(!text.trim())throw new Error('Text file is empty.');if(text.length>MAX_TEXT_CHARS)throw new Error('Text exceeds the analysis limit.');
    return{kind:'text',mimeType:'text/plain',text};
  }
  const mime=file.type||(name.endsWith('.png')?'image/png':/\.jpe?g$/.test(name)?'image/jpeg':name.endsWith('.webp')?'image/webp':'');
  if(!['application/pdf','image/png','image/jpeg','image/webp'].includes(mime))throw new Error('Use PDF, image, Excel, CSV or TXT.');
  if(file.size>MAX_BINARY_BYTES)throw new Error('Scanned PDF/image must be below 2.6 MB for safe AI analysis.');
  return{kind:'file',mimeType:mime,data:bytesToBase64(await file.arrayBuffer())};
}

function extractionEndpoint(route:ConversationAttachmentRoute):string{
  if(route==='customer')return'/api/customer-capture-ai';
  if(route==='supplier')return'/api/supplier-capture-ai';
  if(route==='supplier_purchase')return'/api/supplier-document-ai';
  if(route==='quote_request')return'/api/quote-source-ai';
  if(route==='product_list')return'/api/product-source-ai';
  return'';
}
function extractedPayload(route:ConversationAttachmentRoute,body:any):unknown{
  if(route==='customer'||route==='supplier')return body?.proposal??null;
  if(route==='supplier_purchase'||route==='quote_request'||route==='product_list')return body?.draft??null;
  return null;
}

export async function analyzeConversationAttachment(file:File,signal?:AbortSignal):Promise<ConversationAttachmentAnalysis>{
  const payload=await conversationAttachmentPayload(file);
  const classificationBody=await requestAiJson('/api/ai-inbox',{fileName:file.name,...payload},signal,30_000);
  const raw=classificationBody?.classification??{};const route=(['customer','supplier','supplier_purchase','quote_request','product_list','unknown'].includes(String(raw.route))?String(raw.route):'unknown') as ConversationAttachmentRoute;
  const classification:ConversationAttachmentClassification={route,documentType:boundedText(raw.documentType,80)||'unknown',confidence:Math.max(0,Math.min(1,Number(raw.confidence)||0)),reason:boundedText(raw.reason,300)};
  let extracted='';const endpoint=extractionEndpoint(route);
  if(endpoint){
    const body=await requestAiJson(endpoint,{fileName:file.name,...payload},signal,45_000);
    extracted=compactJson(extractedPayload(route,body));
  }else if(payload.kind==='text')extracted=boundedText(payload.text,MAX_EXTRACT_CHARS);
  return{file,source:{id:id(),fileName:boundedText(file.name,180),mimeType:boundedText(file.type||payload.mimeType,100),size:file.size,route:classification.route,documentType:classification.documentType,confidence:classification.confidence,reason:classification.reason,extracted}};
}

export function conversationSourcePrompt(sources:ConversationAttachmentSource[]):string{
  if(!sources.length)return'';
  return sources.slice(0,MAX_CONVERSATION_ATTACHMENTS).map((source,index)=>`Attachment ${index+1}: ${source.fileName}; type=${source.documentType}; route=${source.route}; confidence=${source.confidence.toFixed(2)}; reason=${source.reason}; extracted=${source.extracted||'[no structured extraction]'}`).join('\n').slice(0,36_000);
}
