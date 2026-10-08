import type {AiContextEnvelope,AiDocumentDraftProposal,AiDocumentUpdateProposal,AiDraftItemInput} from '../components/AiCopilot.js';
import {decimalToScaled,lineTotal} from './money.js';

export interface AiDocumentReview { text:string; blockers:string[]; }
type Drafting=AiContextEnvelope['drafting'];
const validQuantity=(value:string)=>/^(?:0|[1-9]\d{0,12})(?:\.\d{1,6})?$/.test(value)&&Number(value)>0;
const validPrice=(value:string)=>/^(?:0|[1-9]\d{0,12})(?:\.\d{1,6})?$/.test(value);
const money=(cents:bigint):string=>{const abs=cents<0n?-cents:cents;return (cents<0n?'-':'')+String(abs/100n)+'.'+String(abs%100n).padStart(2,'0');};

function itemIdentity(item:AiDraftItemInput,drafting:Drafting):string{
  const catalog=drafting.items.find(row=>row.id===item.savedItemId);
  return catalog?.name||item.descriptionEn||item.descriptionAr||'';
}
function resolvedPrice(item:AiDraftItemInput,drafting:Drafting,currency:string):string{
  if(item.unitPrice)return item.unitPrice;
  const catalog=drafting.items.find(row=>row.id===item.savedItemId);
  return catalog?.lastCurrency===currency?catalog.lastUnitPrice:'';
}
function previewRows(items:AiDraftItemInput[],drafting:Drafting,currency:string,ar:boolean,blockers:string[],offset=0):{text:string;subtotal:bigint|null}{
  const rows:string[]=[];let subtotal=0n,complete=true;
  for(let i=0;i<items.length;i++){
    const item=items[i]!,name=itemIdentity(item,drafting),price=resolvedPrice(item,drafting,currency);
    const number=i+offset+1;
    const catalog=item.savedItemId?drafting.items.find(row=>row.id===item.savedItemId):null;
    if(item.savedItemId&&!catalog)blockers.push((ar?'الصنف المرجعي غير متاح للسطر ':'Referenced product unavailable at line ')+number);
    if(!name)blockers.push((ar?'وصف الصنف مفقود في السطر ':'Missing item description at line ')+number);
    if(!validQuantity(item.quantity))blockers.push((ar?'الكمية غير صالحة في السطر ':'Invalid quantity at line ')+number);
    if(!validPrice(price))blockers.push((ar?'سعر البيع مفقود أو غير صالح في السطر ':'Missing/invalid selling price at line ')+number);
    const valid=Boolean(name&&validQuantity(item.quantity)&&validPrice(price)&&(!item.savedItemId||catalog));
    if(!valid)complete=false;
    const amount=valid?lineTotal(item.quantity,price):'—';
    if(valid)subtotal+=decimalToScaled(amount,2);
    rows.push(String(number)+'. '+(name||'—')+(catalog?.sku?' [SKU '+catalog.sku+']':'')+
      '\n   '+(ar?'الكمية: ':'Qty: ')+(item.quantity||'—')+(item.unit?' '+item.unit:'')+
      '  ·  '+(ar?'السعر: ':'Unit: ')+(price||'—')+' '+currency+
      '  ·  '+(ar?'الإجمالي: ':'Line: ')+amount+' '+currency);
  }
  return{text:rows.join('\n'),subtotal:complete?subtotal:null};
}

/** The display is derived from the exact proposal that the user will approve; no AI-generated totals. */
export function reviewAiDocumentProposal(proposal:AiDocumentDraftProposal|AiDocumentUpdateProposal,drafting:Drafting,language:'ar'|'en'):AiDocumentReview{
  const ar=language==='ar',blockers:string[]=[];
  if(proposal.capability==='document.createDraft'){
    const existing=drafting.customers.find(row=>row.id===proposal.customerId);
    const customer=existing?.name||proposal.customerDraft?.companyNameEn||proposal.customerDraft?.companyNameAr||'';
    if(!customer)blockers.push(ar?'حدد عميلًا مسجلًا أو قدم اسم عميل جديدًا.':'Select an existing customer or provide a new customer name.');
    if(!proposal.items.length)blockers.push(ar?'أضف صنفًا واحدًا على الأقل.':'Add at least one line item.');
    const rows=previewRows(proposal.items,drafting,proposal.currency,ar,blockers);
    const terms=[
      [ar?'شروط الدفع':'Payment terms',proposal.paymentTerms],
      [ar?'الإنكوترمز':'Incoterm',proposal.incoterm],
      [ar?'مدة التسليم':'Delivery',proposal.deliveryTime],
      [ar?'الصلاحية':'Validity',proposal.validity],
      [ar?'ملاحظات العرض':'Remarks',proposal.remarks],
      [ar?'ملاحظات أخرى':'Notes',proposal.notes]
    ].filter(([,value])=>Boolean(value)).map(([key,value])=>key+': '+value);
    const text=[
      (ar?'مسودة ':'Draft ')+(proposal.kind==='invoice'?(ar?'فاتورة':'invoice'):(ar?'عرض سعر':'quotation')),
      (ar?'العميل: ':'Customer: ')+(customer||'—'),
      (ar?'العملة: ':'Currency: ')+proposal.currency+'  ·  '+(ar?'اللغة: ':'Language: ')+proposal.language,
      (ar?'الأصناف ('+proposal.items.length+'):':'Line items ('+proposal.items.length+'):'),
      rows.text,
      ar?'المجموع الفرعي للأصناف: ':'Item subtotal: '+'' 
    ];
    text[text.length-1]=(ar?'المجموع الفرعي للأصناف: ':'Item subtotal: ')+(rows.subtotal===null?'—':money(rows.subtotal)+' '+proposal.currency);
    if(terms.length)text.push(...terms);
    text.push(ar?'المجموع الفرعي لا يشمل الضرائب أو الخصومات أو الشحن. لا يُحفظ المستند إلا بعد الموافقة.':'Subtotal excludes taxes, discounts and shipping. Nothing is saved until approval.');
    if(blockers.length)text.push((ar?'بيانات تحتاج إكمالًا:':'Information required:')+'\n'+blockers.map(issue=>'• '+issue).join('\n'));
    return{text:text.filter(Boolean).join('\n'),blockers};
  }
  const active=drafting.activeDocument;
  if(!active||active.id!==proposal.documentId||active.status!=='draft'){
    return{text:ar?'المسودة المطلوبة غير متاحة للمراجعة.':'Target draft is not available for review.',blockers:[ar?'افتح المسودة الصحيحة وأعد المحاولة.':'Open the correct draft and retry.']};
  }
  const edits=new Map(proposal.itemEdits.map(edit=>[edit.itemId,edit]));
  const existing=active.items.map(item=>{
    const edit=edits.get(item.id);
    return {...item,...edit,savedItemId:''};
  });
  const merged=[...existing,...proposal.addItems];
  const rows=previewRows(merged,drafting,active.currency,ar,blockers);
  // Existing unfinished rows must not prevent a terms-only update.
  const added=previewRows(proposal.addItems,drafting,active.currency,ar,[],existing.length);
  const changes=proposal.itemEdits.map(edit=>{
    const original=active.items.find(item=>item.id===edit.itemId);
    if(!original){blockers.push((ar?'سطر تعديل غير معروف: ':'Unknown edited line: ')+edit.itemId);return '';}
    const values=Object.entries(edit).filter(([key])=>key!=='itemId').map(([key,value])=>key+': '+String(value)).join(', ');
    return '• '+(original.descriptionEn||original.descriptionAr||edit.itemId)+': '+values;
  }).filter(Boolean);
  const changedTerms=Object.entries(proposal.termsPatch).map(([key,value])=>key+': '+value);
  const text=[
    (ar?'مراجعة تعديل المسودة: ':'Review draft update: ')+active.number,
    (ar?'العملة: ':'Currency: ')+active.currency,
    (ar?'الأصناف بعد التعديل ('+merged.length+'):':'Items after change ('+merged.length+'):'),
    rows.text,
    (ar?'المجموع الفرعي بعد التعديل: ':'Updated item subtotal: ')+(rows.subtotal===null?'—':money(rows.subtotal)+' '+active.currency),
    changes.length?(ar?'تعديلات الأسطر:':'Edited lines:')+'\n'+changes.join('\n'):'',
    proposal.addItems.length?(ar?'الأصناف الجديدة:':'New lines:')+'\n'+added.text:'',
    changedTerms.length?(ar?'الشروط المعدلة:':'Updated terms:')+'\n'+changedTerms.join('\n'):'',
    proposal.language?(ar?'اللغة الجديدة: ':'New language: ')+proposal.language:'',
    proposal.notes!==undefined?(ar?'ملاحظات جديدة: ':'New notes: ')+proposal.notes:'',
    ar?'لا يُحفظ التعديل إلا بعد الموافقة.':'Changes are not saved until approval.'
  ];
  // Only newly added or explicitly edited quantities/prices are blocking; old incomplete draft rows are shown as unknown.
  const updateBlockers:string[]=[];
  previewRows(proposal.addItems,drafting,active.currency,ar,updateBlockers,existing.length);
  for(const edit of proposal.itemEdits){
    if(edit.quantity!==undefined&&!validQuantity(edit.quantity))updateBlockers.push((ar?'كمية تعديل غير صالحة: ':'Invalid edited quantity: ')+edit.itemId);
    if(edit.unitPrice!==undefined&&!validPrice(edit.unitPrice))updateBlockers.push((ar?'سعر تعديل غير صالح: ':'Invalid edited price: ')+edit.itemId);
  }
  updateBlockers.push(...blockers.filter(issue=>issue.includes('Unknown edited line')||issue.includes('غير معروف')));
  if(updateBlockers.length)text.push((ar?'بيانات تحتاج إكمالًا:':'Information required:')+'\n'+updateBlockers.map(issue=>'• '+issue).join('\n'));
  return{text:text.filter(Boolean).join('\n'),blockers:updateBlockers};
}
