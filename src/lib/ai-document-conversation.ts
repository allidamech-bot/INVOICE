import type {AiDocumentDraftProposal,AiDocumentUpdateProposal,AiDraftItemInput,AiContextEnvelope} from '../components/AiCopilot.js';

type Proposal=AiDocumentDraftProposal|AiDocumentUpdateProposal;
type DraftReference=AiContextEnvelope['drafting'];
export interface StagedDocumentRevision {proposal:Proposal;message:string;changed:boolean;}
const AR='٠١٢٣٤٥٦٧٨٩',FA='۰۱۲۳۴۵۶۷۸۹';
function latinDigits(value:string):string{return [...value.normalize('NFKC')].map(c=>AR.includes(c)?String(AR.indexOf(c)):FA.includes(c)?String(FA.indexOf(c)):c).join('');}
function number(value:string,positive:boolean):string{
  const input=latinDigits(value.trim()).replace(/٫/g,'.').replace(/,/g,'.');
  if(!/^(?:0|[1-9]\d{0,12})(?:\.\d{1,6})?$/.test(input)||(positive&&Number(input)<=0))
    throw new Error(positive?'Quantity must be a positive decimal.':'Price must be a non-negative decimal.');
  return input;
}
function result(proposal:Proposal,ar:boolean):StagedDocumentRevision{return{
  proposal,changed:true,message:ar?'تم تعديل المسودة غير المحفوظة. راجع جميع الأصناف والأسعار والإجمالي، ثم استخدم زر الموافقة للحفظ.':'The unsaved draft was updated. Review every line, price and subtotal, then use the approval button to save.'
};}
function rejected(proposal:Proposal,error:string,ar:boolean):StagedDocumentRevision{
  return{proposal,changed:false,message:(ar?'لم يتم تعديل المسودة: ':'Draft unchanged: ')+error+(ar?' يمكنك تصحيح الأمر وإعادة المحاولة.':' Correct the command and retry.')};
}
function quantityOrPriceChange(input:string):{index:number;field:'quantity'|'unitPrice';value:string}|null{
  const field='(?:سعر|السعر|كمية|الكمية|price|quantity|qty)';
  const row='(?:الصنف|صنف|البند|بند|item|line)';
  const head='(?:غيّر|غير|عدّل|عدل|اجعل|خلي|خلّي|change|set|update)';
  const a=new RegExp('^'+head+'\\s+('+field+')\\s+(?:ال)?'+row+'\\s*(?:رقم|number|no\\.?)?\\s*([0-9٠-٩۰-۹]{1,2})\\s*(?:إلى|الى|to|=|بسعر)\\s*(\\S+(?:\\s*(?:USD|EUR|SAR|TRY))?)$','iu');
  const b=new RegExp('^'+head+'\\s+(?:ال)?'+row+'\\s*(?:رقم|number|no\\.?)?\\s*([0-9٠-٩۰-۹]{1,2})\\s+('+field+')\\s*(?:إلى|الى|to|=|بسعر)\\s*(\\S+(?:\\s*(?:USD|EUR|SAR|TRY))?)$','iu');
  const matchA=input.match(a),matchB=matchA?null:input.match(b);
  if(!matchA&&!matchB)return null;
  const rawField=String(matchA?matchA[1]:matchB![2]);
  return{index:Number(latinDigits(String(matchA?matchA[2]:matchB![1]))),field:/سعر|price/i.test(rawField)?'unitPrice':'quantity',value:String(matchA?matchA[3]:matchB![3])};
}
function removeLineIndex(input:string):number|null{
  const match=input.match(/^(?:احذف|أحذف|امسح|remove|delete)\s+(?:الصنف|صنف|البند|بند|item|line)\s*(?:رقم|number|no\.?)?\s*([0-9٠-٩۰-۹]{1,2})$/iu);
  return match?Number(latinDigits(match[1]!)):null;
}
function parseAddedLine(input:string):{name:string;quantity:string;unitPrice:string;unit:string;sku:string}|null{
  const match=input.match(/^(?:أضف|اضف|add)\s+(?:صنف|منتج|item|product)\s*[:：]\s*(.+)$/isu);
  if(!match)return null;
  const fields=match[1]!.split(/[;؛\n]+/).map(part=>part.trim()).filter(Boolean);
  if(fields.length<3||fields.length>5)throw new Error('Provide item name; quantity: N; price: N, optionally unit: text and sku: code.');
  const name=fields.shift()!.trim();
  if(!name||name.length>160)throw new Error('Explicit item name is missing or too long.');
  const result={name,quantity:'',unitPrice:'',unit:'',sku:''};
  const seen=new Set<string>();
  for(const entry of fields){
    const pair=entry.match(/^([^:=：]{2,24})\s*[:=：]\s*(.{1,100})$/u);
    if(!pair)throw new Error('Use clearly labeled quantity, price, unit or SKU fields.');
    const key=pair[1]!.trim().toLowerCase(),value=pair[2]!.trim();
    const target=/^(?:الكمية|كمية|quantity|qty)$/.test(key)?'quantity':/^(?:السعر|سعر|price|unit price)$/.test(key)?'unitPrice':/^(?:الوحدة|وحدة|unit)$/.test(key)?'unit':/^(?:sku|الكود|كود)$/.test(key)?'sku':null;
    if(!target||seen.has(target))throw new Error('Unknown or repeated item field.');
    seen.add(target);result[target]=value;
  }
  if(!result.quantity||!result.unitPrice)throw new Error('Quantity and selling price are required for a new item.');
  result.quantity=number(result.quantity,true);
  result.unitPrice=number(result.unitPrice,false);
  if(result.unit.length>40||result.sku.length>80)throw new Error('Unit or SKU is too long.');
  return result;
}
function sameDraftReference(proposal:AiDocumentUpdateProposal,drafting:DraftReference):boolean{
  return drafting.activeDocument?.id===proposal.documentId&&drafting.activeDocument.status==='draft';
}
function setLineValue(proposal:Proposal,drafting:DraftReference,index:number,field:'quantity'|'unitPrice',value:string):Proposal{
  if(!Number.isInteger(index)||index<1)throw new Error('Item index must start at 1.');
  if(proposal.capability==='document.createDraft'){
    if(index>proposal.items.length)throw new Error('Selected item index is outside this draft.');
    return{...proposal,items:proposal.items.map((row,i)=>i===index-1?{...row,[field]:value}:row)};
  }
  if(!sameDraftReference(proposal,drafting))throw new Error('The target document is no longer the active draft.');
  const rows=drafting.activeDocument!.items;
  if(index>rows.length+proposal.addItems.length)throw new Error('Selected item index is outside this draft.');
  if(index>rows.length){
    const position=index-rows.length-1;
    return{...proposal,addItems:proposal.addItems.map((row,i)=>i===position?{...row,[field]:value}:row)};
  }
  const line=rows[index-1]!;
  const previous=proposal.itemEdits.find(edit=>edit.itemId===line.id);
  return{...proposal,itemEdits:[...proposal.itemEdits.filter(edit=>edit.itemId!==line.id),{...previous,itemId:line.id,[field]:value}]};
}
/** Edits only a user-reviewed proposal, never the vault. A new command with
 * unsupported syntax returns null so other business requests retain normal routing. */
export function reviseAiPendingDocumentDraft(proposal:Proposal,message:string,drafting:DraftReference,language:'en'|'ar'):StagedDocumentRevision|null{
  const input=String(message||'').trim().slice(0,6000);if(!input)return null;
  const ar=language==='ar';
  if(/^(?:موافق|اعتمد|احفظ|سجّل|سجل|approve|confirm|save|register)(?:\s+المسودة|\s+draft)?[.!؟\s]*$/iu.test(input))
    return rejected(proposal,ar?'الحفظ يتطلب الضغط على زر الموافقة؛ لا تنفّذ المحادثة الحفظ.':'Saving requires the approval button; a chat message cannot authorize persistence.',ar);
  const change=quantityOrPriceChange(input);
  if(change){
    try{
      const raw=change.value.trim();
      const matched=raw.match(/^(.+?)(?:\s+([A-Z]{3}))?$/i);
      const currency=(proposal.capability==='document.createDraft'?proposal.currency:drafting.activeDocument?.currency)||'';
      const statedCurrency=matched?.[2]?.toUpperCase()||'';
      if(statedCurrency&&statedCurrency!==currency)throw new Error('Price currency differs from the draft; no conversion is performed.');
      const value=number(matched?.[1]||raw,change.field==='quantity');
      const updated=setLineValue(proposal,drafting,change.index,change.field,value);
      return result(updated,ar);
    }catch(error){return rejected(proposal,error instanceof Error?error.message:String(error),ar);}
  }
  const remove=removeLineIndex(input);
  if(remove!==null){
    if(proposal.capability==='document.updateDraft')return rejected(proposal,'Removal of saved draft lines is not supported from chat; use the document editor.',ar);
    if(remove<1||remove>proposal.items.length)return rejected(proposal,'Selected item index is outside this draft.',ar);
    return result({...proposal,items:proposal.items.filter((_,i)=>i!==remove-1)},ar);
  }
  if(/^(?:أضف|اضف|add)\s+(?:صنف|منتج|item|product)\s*[:：]/iu.test(input)){
    try{
      const parsed=parseAddedLine(input);
      if(!parsed)throw new Error('Invalid item fields.');
      const count=proposal.capability==='document.createDraft'?proposal.items.length:proposal.addItems.length;
      if(count>=20)throw new Error('Maximum of 20 newly prepared lines. No row was dropped.');
      const match=parsed.sku?drafting.items.filter(row=>row.sku&&row.sku.toLowerCase()===parsed.sku.toLowerCase()):[];
      if(parsed.sku&&match.length!==1)throw new Error('SKU must identify exactly one product in the active company.');
      const row:AiDraftItemInput={savedItemId:match[0]?.id||'',descriptionEn:parsed.name,descriptionAr:'',quantity:parsed.quantity,unitPrice:parsed.unitPrice,unit:parsed.unit||match[0]?.unit||''};
      if(proposal.capability==='document.createDraft')return result({...proposal,items:[...proposal.items,row]},ar);
      if(!sameDraftReference(proposal,drafting))throw new Error('The target draft has changed.');
      return result({...proposal,addItems:[...proposal.addItems,row]},ar);
    }catch(error){return rejected(proposal,error instanceof Error?error.message:String(error),ar);}
  }
  const terms=input.match(/^(?:غيّر|غير|عدّل|عدل|اجعل|set|change|update)\s+(?:شروط\s*الدفع|payment\s*terms)\s*(?:إلى|الى|to|=|:)\s*(.{1,120})$/iu);
  if(terms){
    const value=terms[1]!.trim();
    if(proposal.capability==='document.createDraft')return result({...proposal,paymentTerms:value},ar);
    return result({...proposal,termsPatch:{...proposal.termsPatch,paymentTerms:value}},ar);
  }
  return null;
}
