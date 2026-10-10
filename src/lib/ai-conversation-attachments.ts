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
export type ConversationAttachmentPhase='reading'|'classifying'|'extracting'|'fallback'|'complete';
export type ConversationAttachmentProgress=(phase:ConversationAttachmentPhase)=>void;

type AiPayload={kind:'text'|'file';mimeType:string;text?:string;data?:string};

export const CONVERSATION_ATTACHMENT_ACCEPT='image/*,.pdf,.xlsx,.xls,.csv,.txt,text/plain,application/pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv';
export const MAX_CONVERSATION_ATTACHMENTS=4;
export const MAX_CONVERSATION_ATTACHMENT_TOTAL_BYTES=16_000_000;
const MAX_BINARY_BYTES=2_600_000;
const MAX_DOCUMENT_BYTES=12_000_000;
const MAX_TEXT_CHARS=120_000;
const MAX_EXTRACT_CHARS=12_000;
// The product-list reader can return 120 complete rows. Keep the structured
// payload available for local approval; never send the full list to the LLM planner.
const MAX_PRODUCT_LIST_EXTRACT_CHARS=72_000;

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

async function verifyBinarySource(file:File,mime:string):Promise<void>{
  const b=new Uint8Array(await file.slice(0,12).arrayBuffer());
  const ascii=(start:number,length:number)=>String.fromCharCode(...b.slice(start,start+length));
  const valid=mime==='application/pdf'?ascii(0,5)==='%PDF-':mime==='image/png'?b.length>=8&&b[0]===0x89&&ascii(1,3)==='PNG'&&b[4]===13&&b[5]===10&&b[6]===26&&b[7]===10:mime==='image/jpeg'?b.length>=3&&b[0]===255&&b[1]===216&&b[2]===255:mime==='image/webp'?b.length>=12&&ascii(0,4)==='RIFF'&&ascii(8,4)==='WEBP':false;
  if(!valid)throw new Error('Attachment content does not match its PDF/image type. Choose a valid supported file.');
}

export async function conversationAttachmentPayload(file:File):Promise<AiPayload>{
  const name=file.name.toLowerCase();
  if(name.endsWith('.pdf')||file.type==='application/pdf'){
    if(file.size>MAX_DOCUMENT_BYTES)throw new Error('PDF must be 12 MB or smaller.');
    await verifyBinarySource(file,'application/pdf');
    const text=await readablePdfText(file,MAX_TEXT_CHARS);
    if(text.trim())return{kind:'text',mimeType:'text/plain',text};
  }
  if(name.endsWith('.xlsx')||name.endsWith('.xls')||name.endsWith('.csv')){
    if(file.size>MAX_DOCUMENT_BYTES)throw new Error('Spreadsheet must be 12 MB or smaller.');
    const sheets=await readSpreadsheetFile(file);
    if(sheets.length>12)throw new Error('Spreadsheet has more than 12 worksheets. Use the full Product Import workflow to review every sheet.');
    const text=spreadsheetSheetsAsText(sheets,MAX_TEXT_CHARS+1);
    if(text.length>MAX_TEXT_CHARS)throw new Error('Spreadsheet text exceeds the safe AI source limit. Use full-file Product Import; no rows have been registered.');
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
  await verifyBinarySource(file,mime);
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
  return body?.source??null;
}
async function genericExtraction(fileName:string,payload:AiPayload,signal?:AbortSignal):Promise<string>{
  const body=await requestAiJson('/api/ai-inbox',{mode:'source-summary',fileName,...payload},signal,30_000);
  if(!body?.source||typeof body.source!=='object'||Array.isArray(body.source)||!Object.keys(body.source).length)throw new Error('Source extraction returned no readable data. Try again or use a clearer file.');
  return compactJson(body.source);
}

export async function analyzeConversationAttachment(file:File,signal?:AbortSignal,onProgress?:ConversationAttachmentProgress):Promise<ConversationAttachmentAnalysis>{
  onProgress?.('reading');
  if(signal?.aborted)throw new DOMException('Cancelled','AbortError');
  const payload=await conversationAttachmentPayload(file);
  if(signal?.aborted)throw new DOMException('Cancelled','AbortError');
  onProgress?.('classifying');
  let classification:ConversationAttachmentClassification={route:'unknown',documentType:'unknown',confidence:0,reason:'LOUREX Inbox could not classify this source reliably; general read-only extraction was used.'};
  try{
    const classificationBody=await requestAiJson('/api/ai-inbox',{fileName:file.name,...payload},signal,30_000);
    const raw=classificationBody?.classification??{};const route=(['customer','supplier','supplier_purchase','quote_request','product_list','unknown'].includes(String(raw.route))?String(raw.route):'unknown') as ConversationAttachmentRoute;
    classification={route,documentType:boundedText(raw.documentType,80)||'unknown',confidence:Math.max(0,Math.min(1,Number(raw.confidence)||0)),reason:boundedText(raw.reason,300)};
  }catch(error){if(signal?.aborted)throw error;}
  if(signal?.aborted)throw new DOMException('Cancelled','AbortError');
  onProgress?.('extracting');
  let extracted='';const endpoint=extractionEndpoint(classification.route);
  if(!endpoint){
    extracted=await genericExtraction(file.name,payload,signal);
  }else{
    try{
      const body=await requestAiJson(endpoint,{fileName:file.name,...payload},signal,45_000);
      const result=extractedPayload(classification.route,body);
      if(!result||typeof result!=='object'||Array.isArray(result)||!Object.keys(result).length)throw new Error('Specific extraction returned no structured data.');
      extracted=compactJson(result,classification.route==='product_list'?MAX_PRODUCT_LIST_EXTRACT_CHARS:MAX_EXTRACT_CHARS);
    }catch(error){
      if(signal?.aborted)throw error;
      onProgress?.('fallback');
      extracted=await genericExtraction(file.name,payload,signal);
      classification={...classification,reason:[classification.reason,'Specific extraction was uncertain; general read-only source extraction was used.'].filter(Boolean).join(' ').slice(0,300)};
    }
  }
  if(!extracted&&payload.kind==='text')extracted=boundedText(payload.text,MAX_EXTRACT_CHARS);
  if(signal?.aborted)throw new DOMException('Cancelled','AbortError');
  onProgress?.('complete');
  return{file,source:{id:id(),fileName:boundedText(file.name,180),mimeType:boundedText(file.type||payload.mimeType,100),size:file.size,route:classification.route,documentType:classification.documentType,confidence:classification.confidence,reason:classification.reason,extracted}};
}

export function conversationSourcePrompt(sources:ConversationAttachmentSource[]):string{
  if(!sources.length)return'';
  return sources.slice(0,MAX_CONVERSATION_ATTACHMENTS).map((source,index)=>`Attachment ${index+1}: ${source.fileName}; type=${source.documentType}; route=${source.route}; confidence=${source.confidence.toFixed(2)}; reason=${source.reason}; extracted=${source.extracted||'[no structured extraction]'}`).join('\n').slice(0,36_000);
}
