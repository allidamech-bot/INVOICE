/**
 * Extract only a user-explicitly named quotation customer from this turn.
 * This merely labels an unsaved Controller draft and does not authorize any
 * customer creation, document save, issue, posting, or guessed stored ID.
 */
export function explicitlyNamedQuotationCustomer(message:string):string{
  const input=String(message||'').normalize('NFKC').replace(/[\u0000-\u001f\u007f]/gu,' ').trim();
  if(!input||input.length>6000)return '';
  const found=/(?:^|[\s،,;:])(?:لعميل|للعميل|العميل|عميل|لزبون|للزبون|الزبون|زبون|for\s+(?:the\s+)?customer|customer)\s*(?:(?:باسم|اسمه|named|name(?:d)?\s*(?:is)?)\s+|[:：]\s*)?([^\n]{2,160})/iu.exec(input);
  if(!found)return '';
  const before=input.slice(Math.max(0,found.index-28),found.index).trimEnd();
  if(/(?:^|[\s،,])(?:بلا|بدون|من\s+دون|no|without|لا)(?:\s+(?:اسم|بيانات|وجود))?$/iu.test(before))return '';
  const raw=found[1]||'';
  const name=raw.split(/(?:[؛،,.:()[\]\n]|\s+(?:(?:بصنفين|بصنف|بندين|الصنف|والصنف|صنفين|صنف|المنتج|والعملة|العملة|الكمية|كمية|السعر|سعر|وفيه|ويتضمن|عدد|with|containing|items?|lines?|quantity|qty|unit\s+price|currency|total)(?=[\s،,;:.!?]|$)))/iu)[0].replace(/\s+/gu,' ').trim();
  if(name.length<2||name.length>100||!/^\p{L}/u.test(name)||/^(?:لا|none|unknown|unnamed|غير محدد)$/iu.test(name))return '';
  return name;
}
