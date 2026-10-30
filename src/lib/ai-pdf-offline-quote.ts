import {exactSpreadsheetQuote, type DeterministicQuoteSheet} from './ai-spreadsheet-quote.js';
import type {SpreadsheetSheet} from './spreadsheet-reader.js';

/** Local, provider-free path for a PDF whose extracted text explicitly retains
 * a complete pipe-delimited table. Never guess column positions, skip unknown
 * business rows, interpret costs as selling prices, or invent blank prices. */
export function exactPdfTextQuote(text:string):DeterministicQuoteSheet|null{
  const lines=String(text||'').split(/\r?\n/).map(line=>line.trim()).filter(Boolean);
  if(!lines.length||lines.length>180)return null;
  const rows:unknown[][]=[];
  let foundTable=false;
  for(const line of lines){
    if(/^Page\s+\d{1,3}$/i.test(line))continue;
    // Page headers and repeated table headings are never silently ignored.
    if(!line.includes('|'))return null;
    const fields=line.split('|').map(part=>part.trim());
    if(fields.length<3||fields.some(part=>part.length>300))return null;
    rows.push(fields);
    foundTable=true;
  }
  if(!foundTable)return null;
  const matrix=rows;
  const sheet:SpreadsheetSheet={
    name:'PDF named-column table',
    matrix,
    nonEmptyRows:matrix.length,
    columnCount:Math.max(...matrix.map(row=>row.length))
  };
  try{
    const parsed=exactSpreadsheetQuote([sheet]);
    if(!parsed||parsed.items.length!==matrix.length-1)return null;
    return parsed;
  }catch(error){
    // If a table resembles a supported quote but contains ambiguous
    // numbers/missing rows, preserve a hard blocker instead of sending it
    // to a model that might silently change commercial meaning.
    if(error instanceof Error&&error.message.startsWith('SOURCE_INCOMPLETE:'))throw error;
    return null;
  }
}
