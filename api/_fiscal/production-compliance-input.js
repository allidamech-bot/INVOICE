import {createHash} from 'node:crypto';
const HEX=/^[a-f0-9]{64}$/;
const UUID=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const HASH=/^[A-Za-z0-9+/]{42}[AEIMQUYcgkosw048]=$/;
const first='NWZlY2ViNjZmZmM4NmYzOGQ5NTI3ODZjNmQ2OTZjNzljMmRiYzIzOWRkNGU5MWI0NjcyOWQ3M2EyN2ZiNTdlOQ==';
const TYPES=['standard-invoice','standard-credit','standard-debit','simplified-invoice','simplified-credit','simplified-debit'];
const need=ok=>{if(!ok)throw Error('PRODUCTION_COMPLIANCE_INPUT_INVALID');};
const sha=b=>createHash('sha256').update(b).digest('hex');
const text=v=>typeof v==='string'&&v.trim()&&v.length<=250&&!/[\x00-\x1f\x7f]/.test(v);
function party(p){need(p?.country==='SA'&&/^3\d{13}3$/.test(p.vatNumber)&&/^\d{10}$/.test(p.crn)&&/^\d{4}$/.test(p.building)&&/^\d{5}$/.test(p.postal)&&['street','district','city','name'].every(k=>text(p[k])));return Object.fromEntries(['country','vatNumber','crn','building','postal','street','district','city','name'].map(k=>[k,p[k]]));}
export function complianceSeller(company,profile,unit){
 need(profile?.details?.sellerIdScheme==='CRN'&&profile.version===unit.profileVersion&&company.vatNumber.trim()===unit.issuer.vatNumber&&company.nameAr.trim()===unit.issuer.legalName);
 const d=profile.details;
 return party({country:'SA',vatNumber:unit.issuer.vatNumber,crn:company.commercialRegistration.trim(),building:d.buildingNumber,postal:d.postalCode,street:d.street,district:d.district,city:company.city.trim(),name:unit.issuer.legalName});
}
export function makeComplianceInput({type,seller,testBuyer,prior,uuid,at,required}){
 need(Array.isArray(required)&&[3,6].includes(required.length)&&new Set(required).size===required.length&&required.every(t=>TYPES.includes(t))&&Array.isArray(prior)&&prior.length<required.length&&required[prior.length]===type&&UUID.test(uuid??'')&&typeof at==='string'&&Number.isFinite(Date.parse(at))&&new Date(at).toISOString()===at);
 need(prior.every((v,i)=>v.type===required[i]&&v.icv===String(i+1)&&UUID.test(v.uuid??'')&&HASH.test(v.invoiceHash??'')&&typeof v.number==='string'&&/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(v.issueDate))&&!prior.some(v=>v.uuid===uuid));
 const [mode,code]=type.split('-'),kind=code==='invoice'?'invoice':code+'-note',s=party(seller),buyer=mode==='standard'?party(testBuyer):null;
 if(buyer)need(buyer.vatNumber!==s.vatNumber);
 const issueDate=at.slice(0,10),number='LOUREX-CHECK-'+uuid,source=prior.find(v=>v.type===mode+'-invoice');
 if(code!=='invoice')need(source&&source.issueDate<=issueDate);
 return {currency:'SAR',mode,kind,uuid,icv:String(prior.length+1),previousInvoiceHash:prior.at(-1)?.invoiceHash??first,number,issueDate,issueTime:at.slice(11,19),supplyDate:issueDate,paymentMeans:'10',seller:s,buyer,lines:[{id:'1',name:'ZATCA compliance test only',quantity:'1',unitNetPrice:'100',unitCode:'EA',category:'S',rate:'15'}],...(code!=='invoice'?{original:{number:source.number,uuid:source.uuid,issueDate:source.issueDate,mode,sellerVat:s.vatNumber,buyerVat:buyer?.vatNumber??null},correctionReason:'ZATCA compliance test only'}:{})};
}
export function verifiedComplianceReceipt({mode,httpStatus,bytes,evidenceDigest}){
 try{
  need(['clearance','reporting'].includes(mode)&&[200,202].includes(httpStatus)&&Buffer.isBuffer(bytes)&&bytes.length>0&&bytes.length<=512*1024&&HEX.test(evidenceDigest??'')&&sha(bytes)===evidenceDigest);
  const body=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)),v=body.validationResults;
  need((mode==='clearance'?body.clearanceStatus==='CLEARED':body.reportingStatus==='REPORTED')&&['PASS','WARNING'].includes(v?.status)&&Array.isArray(v.errorMessages)&&v.errorMessages.length===0&&Array.isArray(v.warningMessages));
  return 'verified-pass';
 }catch{return null;}
}
