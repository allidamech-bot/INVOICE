import type { ProductImportField } from './product-import.js';
import type { ProductImportAnalysis, ProductImportColumnMap } from './product-import-intelligence.js';

export interface ProductImportAiSuggestion {index:number;field:ProductImportField|null;confidence:'high'|'medium'|'low';reason:string;}
export interface ProductImportAiResult {model:string;mappings:ProductImportAiSuggestion[];}

export function ambiguousProductImportColumns(analysis:ProductImportAnalysis,mapping:ProductImportColumnMap){
  return analysis.columns.filter(column=>column.confidence==='low'||column.confidence==='unmapped'||!mapping[column.index]).map(column=>({index:column.index,header:column.header,samples:column.samples.slice(0,4)}));
}

export async function requestProductImportAiMapping(analysis:ProductImportAnalysis,mapping:ProductImportColumnMap,signal?:AbortSignal):Promise<ProductImportAiResult>{
  const columns=ambiguousProductImportColumns(analysis,mapping);
  if(!columns.length)return {model:'local',mappings:[]};
  const response=await fetch('/api/product-import-ai',{method:'POST',headers:{'Content-Type':'application/json','X-Requested-With':'LOUREX-Invoice'},body:JSON.stringify({columns}),signal});
  let payload:any={};try{payload=await response.json();}catch{}
  if(!response.ok)throw new Error(String(payload?.message||'AI mapping is temporarily unavailable.'));
  return {model:String(payload?.model||'Gemini'),mappings:Array.isArray(payload?.mappings)?payload.mappings:[]};
}

export function mergeProductImportAiMapping(analysis:ProductImportAnalysis,current:ProductImportColumnMap,suggestions:ProductImportAiSuggestion[]):ProductImportColumnMap{
  const next=[...current];
  const protectedFields=new Set<ProductImportField>();
  for(const column of analysis.columns){if(column.confidence==='high'&&next[column.index])protectedFields.add(next[column.index] as ProductImportField);}
  for(const suggestion of suggestions){
    const column=analysis.columns.find(entry=>entry.index===suggestion.index);
    if(!column||column.confidence==='high'||!suggestion.field||suggestion.confidence==='low')continue;
    if(protectedFields.has(suggestion.field))continue;
    for(let index=0;index<next.length;index+=1){
      const sourceColumn=analysis.columns.find(entry=>entry.index===index);
      if(index!==suggestion.index&&next[index]===suggestion.field&&sourceColumn?.confidence!=='high')next[index]=null;
    }
    next[suggestion.index]=suggestion.field;
  }
  return next;
}
