import {simulationBase,readSimulationContext} from './simulation-scope.js';
const ID=/^[A-Za-z0-9_-]{1,128}$/;
const HEX=/^[a-f0-9]{64}$/;
// Production is a separately constructed server service, not a request switch.
export function productionBase(s){
  if(s?.environment!=='production'||!['accountUid','workspaceId','egsId'].every(k=>typeof s[k]==='string'&&ID.test(s[k])))throw Error('PRODUCTION_SCOPE_NOT_AUTHORIZED');
  return 'fiscalProductionV1/'+s.accountUid+'/workspaces/'+s.workspaceId;
}
export function fiscalNamespace(s){
  if(s?.environment==='production'){productionBase(s);return 'fiscalProductionV1';}
  simulationBase(s);return 'fiscalPrivateV1';
}
export function fiscalBase(s){return s?.environment==='production'?productionBase(s):simulationBase(s);}
export function issuanceBoundary(db,{productionAuthority,sdkInstallationManifestSha256}={}){
  if(productionAuthority===undefined)return Object.freeze({environment:'simulation',base:simulationBase,read:(tx,s,o)=>readSimulationContext(db,tx,s,o)});
  if(typeof productionAuthority?.readUnit!=='function'||!HEX.test(sdkInstallationManifestSha256??''))throw Error('PRODUCTION_ISSUANCE_NOT_CONFIGURED');
  return Object.freeze({environment:'production',base:productionBase,async read(tx,s){
    const base=productionBase(s),unit=await productionAuthority.readUnit(tx,s);
    if(!unit||unit.state!=='active'||!['accountUid','workspaceId','egsId','environment'].every(k=>unit[k]===s[k])||!unit.operationalCredentialRef||!HEX.test(unit.certificateDigest??''))throw Error('PRODUCTION_SCOPE_NOT_AUTHORIZED');
    return {base,unit:{...unit,active:true},workspace:{commandsEnabled:true,selectedEgsId:s.egsId}};
  }});
}
// Only the domestic standard-rated sale has a complete posting composition.
export function assertProductionSale(s,document,review,unit){
  if(s.environment!=='production')return;
  if(document?.kind!=='invoice'||document.role!=='standard'||document.invoiceMode!=='tax'||document.currency!=='SAR'||review?.scenario!==undefined||review?.fiscalContext!==undefined||review?.taxCategory!=='S'||review?.taxRate!=='15'||document.branchId!==unit?.branchId||!['standard','simplified'].includes(review.invoiceType))throw Error('PRODUCTION_COMMERCIAL_CASE_UNSUPPORTED');
  if(!['1100',review.invoiceType==='standard'?'1000':'0100'].includes(unit.unit?.functionalityMap))throw Error('PRODUCTION_INVOICE_TYPE_NOT_ENABLED');
}
