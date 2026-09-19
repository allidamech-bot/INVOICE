import { parseCsvMatrix } from './product-import.js';

export const XLSX_RUNTIME='./vendor/xlsx.full.min.js';

export interface SpreadsheetSheet {
  name:string;
  matrix:unknown[][];
  nonEmptyRows:number;
  columnCount:number;
}

let runtimePromise:Promise<any>|null=null;

export function ensureXlsxRuntime():Promise<any>{
  const existing=(window as any).XLSX;
  if(existing?.read&&existing?.utils?.sheet_to_json)return Promise.resolve(existing);
  if(runtimePromise)return runtimePromise;
  runtimePromise=new Promise((resolve,reject)=>{
    let script=document.querySelector(`script[src="${XLSX_RUNTIME}"]`) as HTMLScriptElement|null;
    if(script?.dataset.lourexFailed==='true'){script.remove();script=null;}
    const created=!script;
    if(!script){script=document.createElement('script');script.src=XLSX_RUNTIME;script.async=true;script.dataset.lourexXlsx='true';}
    let settled=false;
    const finish=(error?:Error)=>{
      if(settled)return;settled=true;window.clearTimeout(timeout);
      if(error){script!.dataset.lourexFailed='true';runtimePromise=null;reject(error);return;}
      const loaded=(window as any).XLSX;
      if(!loaded?.read||!loaded?.utils?.sheet_to_json){runtimePromise=null;reject(new Error('The local Excel reader did not initialize correctly.'));return;}
      script!.dataset.lourexLoaded='true';resolve(loaded);
    };
    const timeout=window.setTimeout(()=>finish(new Error('The local Excel reader took too long to start. Close this window and try again.')),10000);
    script.addEventListener('load',()=>finish(),{once:true});
    script.addEventListener('error',()=>finish(new Error('Unable to load the local Excel reader. Reopen LOUREX and try again.')),{once:true});
    if(script.dataset.lourexLoaded==='true')finish();
    else if(created)document.head.appendChild(script);
  });
  return runtimePromise;
}

function fillMergedCells(matrix:unknown[][],merges:any[],XLSX:any):void{
  if(!Array.isArray(merges)||!XLSX?.utils?.decode_range)return;
  for(const merge of merges){
    const range=typeof merge==='string'?XLSX.utils.decode_range(merge):merge;
    if(!range?.s||!range?.e||range.s.r>29)continue;
    const value=matrix[range.s.r]?.[range.s.c];if(value===null||value===undefined||String(value).trim()==='')continue;
    for(let row=range.s.r;row<=Math.min(range.e.r,29);row+=1){
      if(!matrix[row])matrix[row]=[];
      for(let column=range.s.c;column<=range.e.c;column+=1){
        if(matrix[row]![column]===null||matrix[row]![column]===undefined||String(matrix[row]![column]).trim()==='')matrix[row]![column]=value;
      }
    }
  }
}

function sheetSummary(name:string,matrix:unknown[][]):SpreadsheetSheet{
  const nonEmptyRows=matrix.filter(row=>row.some(value=>String(value??'').trim()!=='')).length;
  const columnCount=Math.max(...matrix.map(row=>row.length),0);
  return {name,matrix,nonEmptyRows,columnCount};
}

export async function readSpreadsheetFile(file:File):Promise<SpreadsheetSheet[]>{
  const name=file.name.toLowerCase();
  if(name.endsWith('.csv')||name.endsWith('.txt'))return [sheetSummary(file.name,parseCsvMatrix(await file.text()))];
  if(!name.endsWith('.xlsx')&&!name.endsWith('.xls'))throw new Error('Use an Excel (.xlsx/.xls) or CSV file.');
  const XLSX=await ensureXlsxRuntime();
  const workbook=XLSX.read(await file.arrayBuffer(),{type:'array',cellDates:false});
  const names:Array<string>=Array.isArray(workbook.SheetNames)?workbook.SheetNames:[];
  if(!names.length)throw new Error('The Excel workbook does not contain a worksheet.');
  const sheets=names.map(sheetName=>{
    const worksheet=workbook.Sheets[sheetName];
    const matrix=XLSX.utils.sheet_to_json(worksheet,{header:1,raw:false,defval:'',blankrows:false}) as unknown[][];
    fillMergedCells(matrix,worksheet?.['!merges']??[],XLSX);
    return sheetSummary(sheetName,matrix);
  }).filter(sheet=>sheet.nonEmptyRows>0&&sheet.columnCount>0);
  if(!sheets.length)throw new Error('The Excel workbook does not contain readable rows.');
  return sheets;
}

export function spreadsheetSheetsAsText(sheets:SpreadsheetSheet[],maxChars=120000):string{
  const chunks:string[]=[];
  for(const sheet of sheets.slice(0,12)){
    const lines=sheet.matrix.map(row=>row.map(value=>{
      const text=String(value??'');
      return /[",\n\r]/.test(text)?`"${text.replace(/"/g,'""')}"`:text;
    }).join(','));
    chunks.push(`--- SHEET: ${sheet.name} ---\n${lines.join('\n')}`);
    if(chunks.join('\n').length>=maxChars)break;
  }
  return chunks.join('\n').slice(0,maxChars);
}
