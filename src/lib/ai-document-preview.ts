export interface PreviewDocumentLine {savedItemId?:string;descriptionEn?:string;descriptionAr?:string;quantity?:string;unit?:string;unitPrice?:string;}
export interface PreviewDocumentEdit {itemId:string;descriptionEn?:string;descriptionAr?:string;quantity?:string;unit?:string;unitPrice?:string;}
export interface PreviewDocumentCreate {kind:'proforma'|'invoice';currency:string;language:string;customerId:string;customerDraft?:{companyNameEn?:string;companyNameAr?:string}|null;items:PreviewDocumentLine[];incoterm?:string;paymentTerms?:string;deliveryTime?:string;validity?:string;remarks?:string;notes?:string;}
export interface PreviewDocumentUpdate {documentId:string;language?:string;addItems:PreviewDocumentLine[];itemEdits:PreviewDocumentEdit[];termsPatch:Record<string,string|undefined>;notes?:string;}
function clean(value:unknown):string{return typeof value==='string'?value.trim().replace(/[\u0000-\u001f\u007f]/gu,' ').slice(0,1600):'';}
function title(en:string,ar:string,language:'en'|'ar'):string{return language==='ar'?ar:en;}
function itemText(item:PreviewDocumentLine,index:number,language:'en'|'ar'):string{
 const name=clean(item.descriptionEn)||clean(item.descriptionAr)||clean(item.savedItemId)||title('Name unspecified','الاسم غير محدد',language);
 const quantity=clean(item.quantity)||title('unspecified','غير محددة',language);
 const price=clean(item.unitPrice)||title('unspecified','غير محدد',language);
 return [index+1,'. ',name,' | ',title('Qty','الكمية',language),': ',quantity,' ',clean(item.unit),' | ',title('Unit price','سعر الوحدة',language),': ',price].join('');
}
export function formatAiDocumentCreationPreview(data:PreviewDocumentCreate,language:'en'|'ar'):string{
 if(!Array.isArray(data.items)||!data.items.length||data.items.length>20)throw new Error('Document approval must show all 1–20 rows.');
 const name=clean(data.customerDraft?.companyNameEn)||clean(data.customerDraft?.companyNameAr)||clean(data.customerId)||title('not specified','غير محدد',language);
 const lines=[
  title('Type','النوع',language)+': '+(data.kind==='invoice'?title('Invoice draft','مسودة فاتورة',language):title('Quotation draft','مسودة عرض سعر',language)),
  title('Customer','العميل',language)+': '+name,
  title('Currency','العملة',language)+': '+clean(data.currency),
  title('Language','اللغة',language)+': '+clean(data.language),
  title('All items','جميع البنود',language)+' ('+data.items.length+'):'
 ];
 data.items.forEach((item,i)=>lines.push(itemText(item,i,language)));
 const fields:[keyof PreviewDocumentCreate,string,string][]=[['incoterm','Incoterm','شروط التسليم'],['paymentTerms','Payment terms','شروط الدفع'],['deliveryTime','Delivery time','مدة التسليم'],['validity','Validity','الصلاحية'],['remarks','Remarks','ملاحظات تجارية'],['notes','Notes','ملاحظات']];
 for(const [key,en,ar] of fields){const value=clean(data[key]);if(value)lines.push(title(en,ar,language)+': '+value);}
 lines.push(title('Explicit approval required before saving.','يتطلب الحفظ موافقة صريحة.',language));
 return lines.join('\n');
}
export function formatAiDocumentUpdatePreview(data:PreviewDocumentUpdate,language:'en'|'ar'):string{
 if(!Array.isArray(data.addItems)||data.addItems.length>20||!Array.isArray(data.itemEdits)||data.itemEdits.length>30)throw new Error('Document approval cannot silently omit rows or edits.');
 const lines=[title('Draft','المسودة',language)+': '+clean(data.documentId)];
 if(data.language)lines.push(title('Language','اللغة',language)+': '+clean(data.language));
 lines.push(title('Added items','الأصناف المضافة',language)+' ('+data.addItems.length+'):');
 data.addItems.forEach((item,i)=>lines.push(itemText(item,i,language)));
 lines.push(title('Item edits','تعديلات الأصناف',language)+' ('+data.itemEdits.length+'):');
 data.itemEdits.forEach((edit,i)=>{
  const parts=(['descriptionEn','descriptionAr','quantity','unit','unitPrice'] as const).filter(key=>clean(edit[key])).map(key=>key+': '+clean(edit[key]));
  lines.push((i+1)+'. '+clean(edit.itemId)+' → '+parts.join('; '));
 });
 const changes=Object.entries(data.termsPatch||{}).filter(([,val])=>clean(val));
 if(changes.length){lines.push(title('Terms','الشروط',language)+':');for(const [key,val] of changes)lines.push(key+': '+clean(val));}
 if(data.notes)lines.push(title('Notes','ملاحظات',language)+': '+clean(data.notes));
 lines.push(title('Explicit approval required before saving.','يتطلب الحفظ موافقة صريحة.',language));
 return lines.join('\n');
}
