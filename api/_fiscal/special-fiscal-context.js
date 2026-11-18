// Draft-only transaction indicators and restricted additional VAT reason codes.
// Evidence hashes identify independently resolved records; they are not proof
// by themselves. Only trusted server-side preparation may supply this context.
const HEX=/^[a-f0-9]{64}$/;
const EXTRA=new Set(['VATEX-SA-34-1','VATEX-SA-34-2','VATEX-SA-34-3','VATEX-SA-34-4','VATEX-SA-34-5','VATEX-SA-EDU','VATEX-SA-HEA','VATEX-SA-MLTRY']);
const CITIZEN=new Set(['VATEX-SA-EDU','VATEX-SA-HEA']);
function fields(o,keys){return o&&typeof o==='object'&&!Array.isArray(o)&&Object.keys(o).every(k=>keys.includes(k));}
function digest(v){return typeof v==='string'&&HEX.test(v);}
function day(v){return typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;}
function need(ok){if(!ok)throw Error('SPECIAL_FISCAL_EVIDENCE_REQUIRED');}
export function resolveSpecialFiscalContext(input,context,exportCode){
  const base=input.mode==='standard'?'01':'02';
  const used=new Set([...(input.lines??[]),...(input.adjustments??[])].map(l=>l?.reasonCode).filter(c=>EXTRA.has(c)));
  if(context===undefined){need(used.size===0&&input.buyer?.nationalId===undefined);return {subtype:base+(exportCode?'00100':'00000'),supplyEnd:null,exemptionCodes:[],citizen:false};}
  need(fields(context,['uuid','summary','agency','exemptions'])&&context.uuid===input.uuid&&input.kind==='invoice'&&!exportCode&&input.currency==='SAR');
  let summary=false,thirdParty=false,selfBilled=false,supplyEnd=null;
  if(context.summary!==undefined){const s=context.summary;need(fields(s,['start','end','evidenceDigest'])&&day(s.start)&&day(s.end)&&s.start===input.supplyDate&&s.end>=s.start&&s.end<=input.issueDate&&digest(s.evidenceDigest)&&typeof input.buyer?.name==='string'&&!!input.buyer.name.trim());summary=true;supplyEnd=s.end;}
  if(context.agency!==undefined){const a=context.agency;need(fields(a,['kind','approvalDigest','agreementDigest','issuerRef'])&&['third-party','self-billed'].includes(a.kind)&&digest(a.approvalDigest)&&digest(a.agreementDigest)&&typeof a.issuerRef==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(a.issuerRef));thirdParty=a.kind==='third-party';selfBilled=a.kind==='self-billed';if(selfBilled)need(input.mode==='standard'&&/^3[0-9]{13}3$/.test(input.buyer?.vatNumber??'')&&input.buyer.vatNumber!==input.seller?.vatNumber);}
  const approved=new Set();
  if(context.exemptions!==undefined){need(Array.isArray(context.exemptions)&&context.exemptions.length>0&&context.exemptions.length<=EXTRA.size);for(const x of context.exemptions){need(fields(x,['reasonCode','evidenceDigest'])&&EXTRA.has(x.reasonCode)&&used.has(x.reasonCode)&&!approved.has(x.reasonCode)&&digest(x.evidenceDigest));approved.add(x.reasonCode);}}
  need(used.size===approved.size);
  const citizen=[...approved].some(c=>CITIZEN.has(c));
  if(citizen){need(input.buyer?.country==='SA'&&typeof input.buyer.name==='string'&&!!input.buyer.name.trim()&&typeof input.buyer.nationalId==='string'&&/^1[0-9]{9}$/.test(input.buyer.nationalId)&&input.buyer.vatNumber===undefined&&!selfBilled);}else need(input.buyer?.nationalId===undefined);
  need(summary||thirdParty||selfBilled||approved.size>0);
  return {subtype:base+(thirdParty?'1':'0')+'00'+(summary?'1':'0')+(selfBilled?'1':'0'),supplyEnd,exemptionCodes:[...approved],citizen};
}
