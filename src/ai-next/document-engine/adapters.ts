/**
 * R02 format adapters. All parsers are injected or deterministic; this module
 * never imports a provider, Firebase, financial service, or remote URL.
 * Real PDF.js / SheetJS runtimes can be passed by a future authorized client.
 */
import {
  DocumentProcessingError, R02_LIMITS, type DocumentSourceAdapter,
  type SegmentDescriptor, type SourceFile, type SourceManifest, type SegmentRead,
} from './engine.js';

const abortIf = (signal?: AbortSignal): void => {
  if (signal?.aborted) throw new DocumentProcessingError('PROCESSING_CANCELLED');
};
const decode = (b: Uint8Array): string => {
  try {return new TextDecoder('utf-8',{fatal:true}).decode(b).replace(/^\uFEFF/u,'');}
  catch {throw new DocumentProcessingError('INVALID_UTF8_SOURCE');}
};
const toSegment = (
  segmentId:string,pageNumber:number|null,sheetName:string|null,
  rowNumber:number|null,tableId:string|null,
): SegmentDescriptor => ({segmentId,pageNumber,sheetName,rowNumber,tableId});
const letters = (n:number):string => {
  let s='',k=n;
  while(k>0){k--;s=String.fromCharCode(65+k%26)+s;k=Math.floor(k/26);}
  return s;
};
const tableName = (sheet:string,idx:number):string => 'sheet-'+idx;
export function normalizeArabicPersianNumerals(raw:string):string {
  return String(raw).replace(/[٠-٩]/gu,d=>String(d.charCodeAt(0)-0x660))
    .replace(/[۰-۹]/gu,d=>String(d.charCodeAt(0)-0x6f0))
    .replace(/٫/gu,'.').replace(/٬/gu,',');
}
/** Parse without running formulas or evaluating cell content. Includes blank rows. */
export function parseCsvRows(text:string):string[][] {
  const rows:string[][]=[];
  let row:string[]=[],cell='',quoted=false,afterQuote=false;
  const pushCell=()=>{row.push(cell);cell='';afterQuote=false;};
  const pushRow=()=>{pushCell();rows.push(row);row=[];};
  for(let i=0;i<text.length;i++){
    const c=text[i]!;
    if(quoted){
      if(c==='"' && text[i+1]==='"'){cell+='"';i++;}
      else if(c==='"'){quoted=false;afterQuote=true;}
      else cell+=c;
    }else if(afterQuote){
      if(c===',')pushCell();
      else if(c==='\n'){pushRow();}
      else if(c==='\r'){if(text[i+1]==='\n')i++;pushRow();}
      else if(c===' '||c==='\t'){} // trailing external whitespace only
      else throw new DocumentProcessingError('MALFORMED_CSV_AFTER_QUOTE');
    }else if(c==='"'){
      if(cell!=='') throw new DocumentProcessingError('MALFORMED_CSV_QUOTE');
      quoted=true;
    }else if(c===',')pushCell();
    else if(c==='\n')pushRow();
    else if(c==='\r'){if(text[i+1]==='\n')i++;pushRow();}
    else cell+=c;
    if(cell.length>R02_LIMITS.maxCellChars)
      throw new DocumentProcessingError('CELL_TOO_LARGE');
  }
  if(quoted)throw new DocumentProcessingError('MALFORMED_CSV_UNCLOSED_QUOTE');
  if(row.length||cell.length||afterQuote||(!rows.length && text.length===0))pushRow();
  if(rows.length>R02_LIMITS.maxSegments)throw new DocumentProcessingError('ROW_COUNT_LIMIT_EXCEEDED');
  return rows;
}
export class CsvSourceAdapter implements DocumentSourceAdapter {
  readonly format='csv' as const;
  private cache=new WeakMap<Uint8Array,string[][]>();
  private rows(file:SourceFile):string[][] {
    // Cached parser instances are scoped to this input's complete byte content.
    // R02 objects are synthetic; do not use this cache as cross-request authority.
    const cached=this.cache.get(file.bytes);
    if (cached) return cached;
    const rows=parseCsvRows(decode(file.bytes));
    this.cache.set(file.bytes,rows);
    return rows;
  }
  async discover(file:SourceFile,signal?:AbortSignal):Promise<SourceManifest>{
    abortIf(signal);
    const rows=this.rows(file);
    if(!rows.length)throw new DocumentProcessingError('EMPTY_WORKSHEET');
    return {sourceFormat:'csv',
      parts:rows.map((_,i)=>toSegment('csv:row:'+(i+1),null,'CSV',i+1,'sheet-1')),
      expectedPageCount:null,expectedSheets:['CSV'],
      expectedTableRows:[{tableId:'sheet-1',count:rows.length}]};
  }
  async read(file:SourceFile,part:SegmentDescriptor,signal?:AbortSignal):Promise<SegmentRead>{
    abortIf(signal);
    if(part.sheetName!=='CSV'||part.tableId!=='sheet-1'||
      !part.rowNumber || part.segmentId!=='csv:row:'+part.rowNumber)
      throw new DocumentProcessingError('INVALID_CSV_LOCATOR');
    const row=this.rows(file)[part.rowNumber-1];
    if(!row) throw new DocumentProcessingError('MISSING_CSV_ROW');
    if(row.length>16384)throw new DocumentProcessingError('COLUMN_COUNT_LIMIT_EXCEEDED');
    return {extractionMethod:'spreadsheet_parser',
      cells:row.map((rawValue,i)=>({columnNumber:i+1,rawValue})),
      confidence:null};
  }
}

export interface WorksheetObject { [ref:string]: unknown }
export interface WorkbookSheet { sheetName:string; range:{startRow:number;endRow:number;startCol:number;endCol:number};cells:ReadonlyMap<string,string> }
export interface SpreadsheetRuntime {
  read(bytes:Uint8Array,options:Record<string,unknown>):{
    SheetNames:string[];Sheets:Record<string,WorksheetObject>;
  };
  utils:{decode_range(ref:string):{s:{r:number;c:number};e:{r:number;c:number}}};
}
/**
 * An injected SheetJS runtime reader. Uses worksheet cell addresses, NEVER
 * sheet_to_json(blankrows:false) that can drop physical row numbering.
 */
export class SpreadsheetSourceAdapter implements DocumentSourceAdapter {
  readonly format: 'xlsx'|'xls';
  private cache = new WeakMap<Uint8Array,WorkbookSheet[]>();
  constructor(private readonly xlsx:SpreadsheetRuntime,format:'xlsx'|'xls'='xlsx'){
    this.format=format;
  }
  private sheets(file:SourceFile):WorkbookSheet[]{
    const cached=this.cache.get(file.bytes);
    if(cached)return cached;
    if(this.format==='xlsx' &&
      !(file.bytes[0]===0x50&&file.bytes[1]===0x4b))
      throw new DocumentProcessingError('INVALID_XLSX_SIGNATURE');
    if(this.format==='xls' &&
      !(file.bytes[0]===0xd0&&file.bytes[1]===0xcf))
      throw new DocumentProcessingError('INVALID_XLS_SIGNATURE');
    const wb=this.xlsx.read(new Uint8Array(file.bytes),{
      type:'array',cellDates:false,cellFormula:false,bookVBA:false,bookFiles:false,
    });
    if(!wb || !Array.isArray(wb.SheetNames) || wb.SheetNames.length===0)
      throw new DocumentProcessingError('INVALID_WORKBOOK');
    const sheets:WorkbookSheet[]=[],names=new Set<string>();
    for (let i=0;i<wb.SheetNames.length;i++){
      const sheetName=wb.SheetNames[i]!;
      if(!sheetName||sheetName.length>120||names.has(sheetName))
        throw new DocumentProcessingError('DUPLICATE_SHEET_NAME');
      names.add(sheetName);
      const ws=wb.Sheets[sheetName];
      if(!ws || typeof ws['!ref']!=='string')
        throw new DocumentProcessingError('MISSING_WORKSHEET_RANGE');
      const range=this.xlsx.utils.decode_range(ws['!ref'] as string);
      const startRow=range.s.r+1,endRow=range.e.r+1;
      const startCol=range.s.c+1,endCol=range.e.c+1;
      if(startRow<1||startCol<1||endRow<startRow||endCol<startCol ||
        endCol>16384||endRow-startRow+1>R02_LIMITS.maxSegments ||
        (endRow-startRow+1)*(endCol-startCol+1)>500_000)
        throw new DocumentProcessingError('WORKBOOK_DIMENSIONS_EXCEED_LIMIT');
      const cells=new Map<string,string>();
      for(let row=startRow;row<=endRow;row++){
        for(let col=startCol;col<=endCol;col++){
          const address=letters(col)+row;
          const cell=ws[address] as {v?:unknown;w?:unknown;t?:string;f?:string}|undefined;
          if(!cell)continue;
          // Formula strings are inert evidence, never executed.
          const raw=cell.f? '=' + cell.f : cell.w !== undefined ?
            String(cell.w) : cell.v===undefined?'':String(cell.v);
          if(raw.length>R02_LIMITS.maxCellChars)
            throw new DocumentProcessingError('CELL_TOO_LARGE');
          cells.set(address,raw);
        }
      }
      sheets.push({sheetName,range:{startRow,endRow,startCol,endCol},cells});
    }
    this.cache.set(file.bytes,sheets);
    return sheets;
  }
  async discover(file:SourceFile,signal?:AbortSignal):Promise<SourceManifest>{
    abortIf(signal);
    const sheets=this.sheets(file),parts:SegmentDescriptor[]=[],tables:SourceManifest['expectedTableRows']=[];
    for(const [index,sheet] of sheets.entries()){
      const table=tableName(sheet.sheetName,index+1);
      for(let row=sheet.range.startRow;row<=sheet.range.endRow;row++)
        parts.push(toSegment(table+':row:'+row,null,sheet.sheetName,row,table));
      tables.push({tableId:table,count:sheet.range.endRow-sheet.range.startRow+1});
    }
    if(parts.length>R02_LIMITS.maxSegments)
      throw new DocumentProcessingError('ROW_COUNT_LIMIT_EXCEEDED');
    return {sourceFormat:this.format,parts,expectedPageCount:null,
      expectedSheets:sheets.map(x=>x.sheetName),expectedTableRows:tables};
  }
  async read(file:SourceFile,part:SegmentDescriptor,signal?:AbortSignal):Promise<SegmentRead>{
    abortIf(signal);
    const sheets=this.sheets(file);
    const index=sheets.findIndex(s=>s.sheetName===part.sheetName);
    const sheet=sheets[index];
    if(!sheet||!part.rowNumber||
      part.rowNumber<sheet.range.startRow||part.rowNumber>sheet.range.endRow||
      part.tableId!==tableName(sheet.sheetName,index+1)||
      part.segmentId!==part.tableId+':row:'+part.rowNumber)
      throw new DocumentProcessingError('INVALID_WORKSHEET_ROW_LOCATOR');
    const cells=[] as {columnNumber:number;rawValue:string}[];
    for(let col=sheet.range.startCol;col<=sheet.range.endCol;col++){
      cells.push({columnNumber:col,rawValue:sheet.cells.get(letters(col)+part.rowNumber)||''});
    }
    return {extractionMethod:'spreadsheet_parser',cells,confidence:null};
  }
}

export interface PdfTextItem {str?:string;hasEOL?:boolean}
export interface PdfPage {
  getTextContent():Promise<{items:PdfTextItem[]}>;
  getOperatorList?():Promise<{fnArray:number[]}>;
  cleanup?():void;
}
export interface PdfDocument {
  numPages:number;
  getPage(pageNumber:number):Promise<PdfPage>;
  destroy?():Promise<void>;
}
export interface PdfRuntime {
  OPS?:Record<string,number>;
  getDocument(opts:{data:Uint8Array;isEvalSupported:false}):{
    promise:Promise<PdfDocument>;
    destroy?():Promise<void>;
  };
}
/** OCR/vision must be explicitly injected after a separate privacy decision. */
export type PageOcr = (input:{
  page:PdfPage;pageNumber:number;signal?:AbortSignal;
})=>Promise<{text:string;confidence?:number}>;
export class PdfSourceAdapter implements DocumentSourceAdapter {
  readonly format='pdf' as const;
  private cache=new WeakMap<Uint8Array,PdfDocument>();
  constructor(private readonly runtime:PdfRuntime,private readonly ocr?:PageOcr){}
  private async document(file:SourceFile):Promise<PdfDocument>{
    const b=file.bytes;
    if(b.length<5||String.fromCharCode(...b.slice(0,5))!=='%PDF-')
      throw new DocumentProcessingError('INVALID_PDF_SIGNATURE');
    const cached=this.cache.get(b);
    if(cached)return cached;
    const task=this.runtime.getDocument({data:new Uint8Array(b),isEvalSupported:false});
    const pdf=await task.promise;
    if(!Number.isSafeInteger(pdf.numPages)||pdf.numPages<1||
      pdf.numPages>R02_LIMITS.maxSegments)
      throw new DocumentProcessingError('INVALID_PDF_PAGE_COUNT');
    this.cache.set(b,pdf);
    return pdf;
  }
  async discover(file:SourceFile,signal?:AbortSignal):Promise<SourceManifest>{
    abortIf(signal);
    const pdf=await this.document(file);abortIf(signal);
    return {sourceFormat:'pdf',
      parts:Array.from({length:pdf.numPages},(_,i)=>toSegment('page:'+(i+1),i+1,null,null,null)),
      expectedPageCount:pdf.numPages,expectedSheets:[],expectedTableRows:[]};
  }
  async read(file:SourceFile,part:SegmentDescriptor,signal?:AbortSignal):Promise<SegmentRead>{
    abortIf(signal);
    const pdf=await this.document(file);
    if(!part.pageNumber || part.pageNumber>pdf.numPages ||
      part.segmentId!=='page:'+part.pageNumber)
      throw new DocumentProcessingError('INVALID_PDF_PAGE_LOCATOR');
    const page=await pdf.getPage(part.pageNumber);
    try {
      const content=await page.getTextContent();
      const text=content.items.map(x=>typeof x.str==='string' ? x.str+(x.hasEOL?'\n':' '):'').join('');
      let image=false;
      if(text.trim().length<150 && page.getOperatorList){
        const codes=this.runtime.OPS || {};
        const images=['paintImageXObject','paintImageXObjectRepeat',
          'paintJpegXObject','paintInlineImageXObject','paintInlineImageXObjectGroup']
          .map(k=>codes[k]).filter((v):v is number=>typeof v==='number');
        const ops=await page.getOperatorList();
        image=ops.fnArray.some(code=>images.includes(code));
      }
      const visible=Array.from(text.matchAll(/[\p{L}\p{N}]/gu)).length;
      if(visible >= 24 && (!image || visible >= 150))
        return {text,extractionMethod:'selectable_text',requiresReview:false,confidence:null};
      if(!this.ocr) throw new DocumentProcessingError('OCR_NOT_CONFIGURED');
      abortIf(signal);
      const recognized=await this.ocr({page,pageNumber:part.pageNumber,signal});
      abortIf(signal);
      if(!recognized || typeof recognized.text!=='string' ||
        !recognized.text.trim())throw new DocumentProcessingError('OCR_PAGE_UNREADABLE');
      return {text:recognized.text,extractionMethod:'ocr',
        requiresReview:true,confidence:recognized.confidence??null};
    } finally {page.cleanup?.();}
  }
}

export type ImageOcr = (file:SourceFile,signal?:AbortSignal)=>Promise<{text:string;confidence?:number}>;
export class ImageSourceAdapter implements DocumentSourceAdapter {
  readonly format='image' as const;
  constructor(private readonly ocr?:ImageOcr){}
  async discover(file:SourceFile,signal?:AbortSignal):Promise<SourceManifest>{
    abortIf(signal);
    const b=file.bytes;
    const png=b.length>8&&[137,80,78,71,13,10,26,10].every((x,i)=>b[i]===x);
    const jpg=b.length>3&&b[0]===255&&b[1]===216&&b[2]===255;
    if(!png&&!jpg)throw new DocumentProcessingError('INVALID_IMAGE_SIGNATURE');
    return {sourceFormat:'image',parts:[toSegment('page:1',1,null,null,null)],
      expectedPageCount:1,expectedSheets:[],expectedTableRows:[]};
  }
  async read(file:SourceFile,part:SegmentDescriptor,signal?:AbortSignal):Promise<SegmentRead>{
    if(part.segmentId!=='page:1')throw new DocumentProcessingError('INVALID_IMAGE_LOCATOR');
    if(!this.ocr)throw new DocumentProcessingError('OCR_NOT_CONFIGURED');
    const result=await this.ocr(file,signal);abortIf(signal);
    if(!result?.text?.trim())throw new DocumentProcessingError('OCR_PAGE_UNREADABLE');
    return {text:result.text,extractionMethod:'ocr',confidence:result.confidence??null,
      requiresReview:true};
  }
}
export class TextSourceAdapter implements DocumentSourceAdapter {
  readonly format='text' as const;
  async discover(file:SourceFile,signal?:AbortSignal):Promise<SourceManifest>{
    abortIf(signal);
    const text=decode(file.bytes);
    if(!text.length)throw new DocumentProcessingError('EMPTY_TEXT_SOURCE');
    const count=Math.ceil(text.length / R02_LIMITS.evidenceTextChunk);
    if(count>R02_LIMITS.maxSegments)throw new DocumentProcessingError('TEXT_SEGMENT_LIMIT');
    return {sourceFormat:'text',
      parts:Array.from({length:count},(_,i)=>toSegment('chunk:'+(i+1),i+1,null,null,null)),
      expectedPageCount:count,expectedSheets:[],expectedTableRows:[]};
  }
  async read(file:SourceFile,part:SegmentDescriptor,signal?:AbortSignal):Promise<SegmentRead>{
    abortIf(signal);
    if(!part.pageNumber||part.segmentId!=='chunk:'+part.pageNumber)
      throw new DocumentProcessingError('INVALID_TEXT_SEGMENT');
    const text=decode(file.bytes),i=part.pageNumber-1;
    const chunk=text.slice(i*R02_LIMITS.evidenceTextChunk,(i+1)*R02_LIMITS.evidenceTextChunk);
    if(!chunk)throw new DocumentProcessingError('MISSING_TEXT_CHUNK');
    return {text:chunk,extractionMethod:'selectable_text',requiresReview:false};
  }
}
