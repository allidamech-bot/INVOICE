import type {Customer,Supplier,VaultPayload} from '../types.js';

export type ApprovedPartyKind='customer'|'supplier';
export interface ApprovedPartyPatch{
  party:ApprovedPartyKind;
  recordId:string;
  workspaceId:string;
  beforeUpdatedAt:string;
  before:Record<string,string>;
  patch:Record<string,string>;
  preview:{itemId:string;name:string;before:Record<string,string>;after:Record<string,string>};
}

const CUSTOMER_FIELDS:Readonly<Record<string,number>>={
  companyNameEn:160,companyNameAr:160,contactPerson:120,addressEn:240,addressAr:240,
  city:100,country:100,phone:60,email:160,vatTaxNumber:80,commercialRegistration:80,
  preferredCurrency:8,paymentTerms:160,creditLimit:40,creditCurrency:8,notes:1000
};
const SUPPLIER_FIELDS:Readonly<Record<string,number>>={
  nameEn:160,nameAr:160,contactPerson:120,address:240,city:100,country:100,phone:60,
  email:160,vatTaxNumber:80,commercialRegistration:80,defaultCurrency:8,paymentTerms:160,notes:1000
};
type PartyRecord=Customer|Supplier;
function workspaceOf(row:{workspaceId?:string}):string{return row.workspaceId||'default';}
function fieldsFor(party:ApprovedPartyKind){return party==='customer'?CUSTOMER_FIELDS:SUPPLIER_FIELDS;}
function rowsFor(vault:VaultPayload,party:ApprovedPartyKind):PartyRecord[]{return party==='customer'?vault.customers:vault.suppliers;}
function nameFor(row:PartyRecord,party:ApprovedPartyKind):string{
  return party==='customer'?((row as Customer).companyNameEn||(row as Customer).companyNameAr):
    ((row as Supplier).nameEn||(row as Supplier).nameAr);
}
function cleanedPatch(party:ApprovedPartyKind,input:unknown):Record<string,string>{
  if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Party patch must be an explicit object.');
  const entries=Object.entries(input);
  if(!entries.length||entries.length>Object.keys(fieldsFor(party)).length)throw new Error('Party patch has no supported changes.');
  const patch:Record<string,string>={},allowed=fieldsFor(party);
  for(const [key,value] of entries){
    const max=allowed[key];
    if(!max)throw new Error('Unapproved customer/supplier field: '+key);
    if(typeof value!=='string'||/[\u0000-\u001f\u007f]/u.test(value)||value.length>max*2)
      throw new Error('Invalid customer/supplier field: '+key);
    const cleaned=value.normalize('NFKC').replace(/\s+/gu,' ').trim();
    if(cleaned.length>max)throw new Error('Customer/supplier field is too long: '+key);
    patch[key]=cleaned;
  }
  return patch;
}
function previewFor(batch:Omit<ApprovedPartyPatch,'preview'>):ApprovedPartyPatch['preview']{
  return{itemId:batch.recordId,name:batch.before.partyName||'',before:{...batch.before},
    after:{...batch.before,...batch.patch}};
}
function checkDuplicateIdentity(vault:VaultPayload,party:ApprovedPartyKind,recordId:string,workspaceId:string,next:PartyRecord):void{
  const getNames=(row:PartyRecord):string[]=>party==='customer'?
    [(row as Customer).companyNameEn,(row as Customer).companyNameAr]:
    [(row as Supplier).nameEn,(row as Supplier).nameAr];
  const norm=(value:unknown)=>String(value||'').normalize('NFKC').trim().toLocaleLowerCase();
  const names=new Set(getNames(next).map(norm).filter(Boolean)),email=norm(next.email);
  for(const other of rowsFor(vault,party)){
    if(other.id===recordId||workspaceOf(other)!==workspaceId)continue;
    if(getNames(other).some(n=>names.has(norm(n)))||(email&&norm(other.email)===email))
      throw new Error('Another customer/supplier already has the approved name or email. Review again.');
  }
}
/** Stage exact party state for visible review. The AI cannot choose the prior revision. */
export function prepareApprovedPartyPatch(vault:VaultPayload,party:ApprovedPartyKind,recordId:string,input:unknown):ApprovedPartyPatch{
  const id=String(recordId||'').trim();
  const active=vault.appSettings.activeWorkspaceId||'default',rows=rowsFor(vault,party);
  const matches=rows.filter(row=>row.id===id);
  if(!id||matches.length!==1||workspaceOf(matches[0]!)!==active)
    throw new Error('Selected customer/supplier is not unique or belongs to another company.');
  const current=matches[0]!,patch=cleanedPatch(party,input);
  if(!current.updatedAt)throw new Error('Missing party revision; refresh the record and review again.');
  const before:Record<string,string>={partyName:nameFor(current,party)};
  for(const key of Object.keys(patch))before[key]=String((current as unknown as Record<string,unknown>)[key]??'');
  if(Object.keys(patch).every(key=>before[key]===patch[key]))throw new Error('No customer/supplier changes to approve.');
  checkDuplicateIdentity(vault,party,id,active,{...current,...patch});
  const batch={party,recordId:id,workspaceId:active,beforeUpdatedAt:current.updatedAt,before,patch};
  return{...batch,preview:previewFor(batch)};
}
/** Run inside the atomic vault mutation, not merely before the user presses Approve. */
export function applyApprovedPartyPatch(vault:VaultPayload,proposal:ApprovedPartyPatch):VaultPayload{
  if(!proposal||!['customer','supplier'].includes(proposal.party))
    throw new Error('Invalid approved customer/supplier operation.');
  const active=vault.appSettings.activeWorkspaceId||'default';
  if(!proposal.workspaceId||active!==proposal.workspaceId)
    throw new Error('Active company changed after approval. No record was changed.');
  const rows=rowsFor(vault,proposal.party),matches=rows.filter(row=>row.id===proposal.recordId);
  if(matches.length!==1||workspaceOf(matches[0]!)!==active)
    throw new Error('Customer/supplier disappeared or belongs to another company.');
  const current=matches[0]!,patch=cleanedPatch(proposal.party,proposal.patch);
  if(!proposal.beforeUpdatedAt||current.updatedAt!==proposal.beforeUpdatedAt)
    throw new Error('Customer/supplier changed since review. Review again.');
  const batch:Omit<ApprovedPartyPatch,'preview'>={party:proposal.party,recordId:proposal.recordId,
    workspaceId:proposal.workspaceId,beforeUpdatedAt:proposal.beforeUpdatedAt,before:proposal.before,patch};
  if(JSON.stringify(proposal.preview)!==JSON.stringify(previewFor(batch)))
    throw new Error('Customer/supplier approval preview changed. Review again.');
  if(!proposal.before||proposal.before.partyName!==nameFor(current,proposal.party))
    throw new Error('Customer/supplier identity changed since review.');
  for(const key of Object.keys(patch)){
    if(proposal.before[key]!==String((current as unknown as Record<string,unknown>)[key]??''))
      throw new Error('Customer/supplier field changed since review. Review again.');
  }
  if(Object.keys(patch).every(key=>proposal.before[key]===patch[key]))
    throw new Error('No approved customer/supplier changes remain.');
  const updated={...current,...patch,updatedAt:new Date().toISOString()};
  checkDuplicateIdentity(vault,proposal.party,proposal.recordId,active,updated);
  if(proposal.party==='customer')return{...vault,customers:vault.customers.map(row=>
    row.id===proposal.recordId?updated as Customer:row)};
  return{...vault,suppliers:vault.suppliers.map(row=>
    row.id===proposal.recordId?updated as Supplier:row)};
}
