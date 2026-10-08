import type {Customer,Supplier,VaultPayload} from '../types.js';
import {makeId} from './id.js';

type PartyType='customer'|'supplier';
type PartyMode='create'|'update';
type EditableField='phone'|'email'|'city'|'country'|'contactPerson'|'paymentTerms'|'notes';
export interface AiPartyMasterIntent{party:PartyType;mode:PartyMode;name:string;fields:Partial<Record<EditableField,string>>;}
export interface AiPartyMasterBatch{
  party:PartyType;mode:PartyMode;workspaceId:string;recordId:string;beforeUpdatedAt:string;
  before:Record<string,string>;after:Record<string,string>;
  preview:{itemId:string;name:string;before:Record<string,string>;after:Record<string,string>};
}
const labels:Record<string,EditableField>={
  phone:'phone','الهاتف':'phone','هاتف':'phone','الجوال':'phone','جوال':'phone','رقم الهاتف':'phone',
  email:'email','البريد':'email','البريد الإلكتروني':'email','الايميل':'email','إيميل':'email',
  city:'city','المدينة':'city',country:'country','الدولة':'country','البلد':'country',
  contact:'contactPerson','contact person':'contactPerson','جهة الاتصال':'contactPerson','المسؤول':'contactPerson',
  payment:'paymentTerms','payment terms':'paymentTerms','شروط الدفع':'paymentTerms',
  notes:'notes','ملاحظات':'notes'
};
const lengths:Record<EditableField,number>={phone:60,email:160,city:100,country:100,contactPerson:120,paymentTerms:160,notes:1000};
const keys:EditableField[]=['phone','email','city','country','contactPerson','paymentTerms','notes'];
function text(value:unknown,max:number):string{
  if(typeof value!=='string'||value.length>max*2||/[\u0000-\u001f\u007f]/u.test(value))throw new Error('Invalid or oversized customer/supplier field.');
  const clean=value.normalize('NFKC').trim();
  if(clean.length>max)throw new Error('Customer/supplier field exceeds its permitted length.');
  return clean;
}
function normalizeName(input:string):string{return input.normalize('NFKC').trim().replace(/\s+/gu,' ').toLocaleLowerCase();}
function displayName(record:Customer|Supplier,party:PartyType):string{
  return party==='customer'?((record as Customer).companyNameEn||(record as Customer).companyNameAr):((record as Supplier).nameEn||(record as Supplier).nameAr);
}
function names(record:Customer|Supplier,party:PartyType):string[]{return party==='customer'?[(record as Customer).companyNameEn,(record as Customer).companyNameAr]:[(record as Supplier).nameEn,(record as Supplier).nameAr];}
function companyScope(row:{workspaceId?:string}):string{return row.workspaceId||'default';}
function rowsOf(vault:VaultPayload,party:PartyType):Array<Customer|Supplier>{
  return party==='customer'?vault.customers:vault.suppliers;
}
function assertFields(fields:Record<string,unknown>):Partial<Record<EditableField,string>>{
  if(!Object.keys(fields).length||Object.keys(fields).length>keys.length)throw new Error('Provide at least one supported contact field.');
  const out:Partial<Record<EditableField,string>>={};
  for(const [key,value] of Object.entries(fields)){
    if(!keys.includes(key as EditableField))throw new Error('Unsupported customer/supplier field: '+key);
    const field=key as EditableField,v=text(value,lengths[field]);
    if(field==='email'&&v&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(v))throw new Error('Invalid contact email.');
    if(field==='phone'&&v&&!/^[+\d()\-\s]{5,60}$/u.test(v))throw new Error('Invalid contact phone.');
    out[field]=v;
  }
  return out;
}
/** Explicit, bounded header and semicolon-delimited fields only; no inferred identities. */
export function parseAiPartyMasterIntent(message:string):AiPartyMasterIntent|null{
  const raw=String(message||'').normalize('NFKC').trim();
  if(!raw||raw.length>1600||/(?:do not|don't|never|preview only|only preview|لا\s*(?:تسجل|تسجّل|تضيف|تنشئ|تعدّل|تعدل|تغير)|بدون\s*(?:حفظ|تسجيل|تعديل))/iu.test(raw))return null;
  const segments=raw.split(/\s*[;؛]\s*/u);
  if(segments.length<2||segments.length>9)return null;
  const header=segments.shift()!.trim();
  const ar=/^(أضف|اضف|سجّل|سجل|أنشئ|انشئ|عدّل|عدل|غيّر|غير|حدّث|حدث)\s+(?:(?:لي)\s+)?(عميل|مورد)\s*:\s*(.{2,160})$/iu.exec(header);
  const en=/^(create|add|register|update|edit|change)\s+(?:a\s+|an\s+)?(customer|supplier)\s*:\s*(.{2,160})$/iu.exec(header);
  const m=ar||en;if(!m)return null;
  const verb=m[1]!.toLowerCase(),party:PartyType=/^(?:عميل|customer)$/iu.test(m[2]!)?'customer':'supplier';
  const mode:PartyMode=/^(?:عدّل|عدل|غيّر|غير|حدّث|حدث|update|edit|change)$/iu.test(verb)?'update':'create';
  const name=text(m[3]!,160);
  if(!name||name.length<2)throw new Error('Customer/supplier name is required.');
  const fields:Record<string,unknown>={};
  for(const segment of segments){
    const sep=segment.indexOf(':');
    if(sep<=0)throw new Error('Use label: value for every requested contact field.');
    const key=segment.slice(0,sep).toLowerCase().trim(),label=labels[key];
    if(!label)throw new Error('Unsupported contact field: '+key);
    if(label in fields)throw new Error('Repeated contact field: '+key);
    fields[label]=segment.slice(sep+1).trim();
  }
  return{party,mode,name,fields:assertFields(fields)};
}
function dataFields(row:Customer|Supplier):Record<string,string>{
  const data:Record<string,string>={};
  for(const field of keys)data[field]=String(row[field]||'');
  return data;
}
function createRecord(batch:AiPartyMasterBatch):Customer|Supplier{
  const empty=Object.fromEntries(keys.map(key=>[key,''])) as Record<EditableField,string>;
  const ar=/[\u0600-\u06ff]/u.test(batch.after.name||'');
  const base={id:batch.recordId,workspaceId:batch.workspaceId,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),...empty,...batch.after};
  if(batch.party==='customer')return{...base,companyNameEn:ar?'':batch.after.name,companyNameAr:ar?batch.after.name:'',addressEn:'',addressAr:'',vatTaxNumber:'',commercialRegistration:'',preferredCurrency:'',paymentTermPresetId:'',paymentDueDays:'',creditLimit:'',creditCurrency:''} as Customer;
  return{...base,nameEn:ar?'':batch.after.name,nameAr:ar?batch.after.name:'',address:'',vatTaxNumber:'',commercialRegistration:'',defaultCurrency:''} as Supplier;
}
function assertNotDuplicated(rows:Array<Customer|Supplier>,party:PartyType,name:string,recordId:string,email:string):void{
  const n=normalizeName(name),em=email.trim().toLowerCase();
  if(rows.some(row=>row.id!==recordId&&(names(row,party).some(value=>value&&normalizeName(value)===n)||(em&&row.email.trim().toLowerCase()===em))))
    throw new Error('Duplicate party name or email in the current company. No changes made.');
}
function batchPreview(batch:AiPartyMasterBatch):AiPartyMasterBatch['preview']{
  return{itemId:batch.recordId,name:batch.after.name||'',before:{...batch.before},after:{...batch.after}};
}
export function prepareAiPartyMaster(vault:VaultPayload,intent:AiPartyMasterIntent):AiPartyMasterBatch{
  if(!intent||!['customer','supplier'].includes(intent.party)||!['create','update'].includes(intent.mode))
    throw new Error('Invalid customer/supplier operation.');
  const name=text(intent.name,160),fields=assertFields(intent.fields);
  const workspaceId=vault.appSettings.activeWorkspaceId||'default';
  const rows=rowsOf(vault,intent.party).filter(row=>companyScope(row)===workspaceId);
  let record:Customer|Supplier|undefined;
  if(intent.mode==='update'){
    const matches=rows.filter(row=>names(row,intent.party).some(value=>value&&normalizeName(value)===normalizeName(name)));
    if(matches.length!==1)throw new Error(matches.length?'Ambiguous customer/supplier identity.':'No exact customer/supplier record in the current company.');
    record=matches[0];
  }else if(rows.some(row=>names(row,intent.party).some(value=>value&&normalizeName(value)===normalizeName(name)))){
    throw new Error('Party already exists. Choose an exact update command instead.');
  }
  const before:Record<string,string>=record?{name:displayName(record,intent.party),...dataFields(record)}:{};
  const after:Record<string,string>={...before,...(record?{}:{name}),...fields};
  if(record&&Object.entries(fields).every(([key,value])=>before[key]===value))throw new Error('No effective contact changes to review.');
  assertNotDuplicated(rows,intent.party,record?displayName(record,intent.party):name,record?.id||'',after.email||'');
  const batch:AiPartyMasterBatch={party:intent.party,mode:intent.mode,workspaceId,recordId:record?.id||makeId(intent.party),beforeUpdatedAt:record?.updatedAt||'',before,after,preview:{itemId:'',name:'',before:{},after:{}}};
  batch.preview=batchPreview(batch);
  return batch;
}
/** Re-check company, identity, old values and duplicate data within one vault mutation. */
export function applyAiPartyMaster(vault:VaultPayload,batch:AiPartyMasterBatch):VaultPayload{
  if(!batch||!['customer','supplier'].includes(batch.party)||!['create','update'].includes(batch.mode)||!batch.recordId||batch.recordId.length>140)
    throw new Error('Invalid party approval.');
  if((vault.appSettings.activeWorkspaceId||'default')!==batch.workspaceId)throw new Error('Active company changed. No party record was saved.');
  if(!batch.after||typeof batch.after.name!=='string')throw new Error('Approved party name is missing.');
  const fields:Record<string,unknown>={};
  for(const [key,value] of Object.entries(batch.after)){
    if(key==='name')continue;
    if(!keys.includes(key as EditableField))throw new Error('Unapproved party field. Approved party preview changed.');
    fields[key]=value;
  }
  const cleaned=assertFields(fields);
  if(JSON.stringify(batch.preview)!==JSON.stringify(batchPreview(batch)))throw new Error('Approved party preview changed. Review again.');
  const rows=rowsOf(vault,batch.party);
  const current=rows.find(row=>row.id===batch.recordId);
  const inWorkspace=rows.filter(row=>companyScope(row)===batch.workspaceId);
  if(batch.mode==='create'){
    if(current)throw new Error('The new party record ID already exists.');
    if(Object.keys(batch.before).length||batch.beforeUpdatedAt)throw new Error('Creation preview has unexpected prior state.');
    assertNotDuplicated(inWorkspace,batch.party,text(batch.after.name,160),'',cleaned.email||'');
    const newBatch={...batch,after:{name:batch.after.name,...cleaned}};
    const created=createRecord(newBatch);
    return batch.party==='customer'?{...vault,customers:[...vault.customers,created as Customer]}:{...vault,suppliers:[...vault.suppliers,created as Supplier]};
  }
  if(!current||companyScope(current)!==batch.workspaceId)throw new Error('Party disappeared or belongs to another company.');
  if(current.updatedAt!==batch.beforeUpdatedAt||JSON.stringify({name:displayName(current,batch.party),...dataFields(current)})!==JSON.stringify(batch.before))
    throw new Error('Party changed since preview. Review again.');
  if(displayName(current,batch.party)!==batch.after.name)throw new Error('Party rename requires a separate explicit workflow.');
  assertNotDuplicated(inWorkspace,batch.party,batch.after.name,current.id,cleaned.email||'');
  const amended={...current,...cleaned,updatedAt:new Date().toISOString()};
  if(batch.party==='customer')return{...vault,customers:vault.customers.map(row=>row.id===current.id?amended as Customer:row)};
  return{...vault,suppliers:vault.suppliers.map(row=>row.id===current.id?amended as Supplier:row)};
}
