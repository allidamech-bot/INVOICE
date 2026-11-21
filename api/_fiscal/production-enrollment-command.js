// Customer-facing commands for existing, independently provisioned EGS units.
// The browser cannot provide issuer identity, key, authority URL or eligibility.
import {fiscalCompanySourceDigest,parseProductionProfileCommand} from './production-profile.js';
const ID=/^[A-Za-z0-9_-]{1,128}$/;
const id=v=>typeof v==='string'&&ID.test(v);
const data=s=>s.exists?s.data():null;
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const need=(ok,code='FISCAL_ENROLLMENT_FORBIDDEN')=>{if(!ok)throw Error(code);};
export function parseProductionEnrollmentCommand(v){
  need(v&&id(v.workspaceId),'INVALID_FISCAL_ENROLLMENT');
  const base=['operation','workspaceId'];
  if(v.operation==='enrollment-status'){need(exact(v,base),'INVALID_FISCAL_ENROLLMENT');return v;}
  if(v.operation==='enrollment-request'){
    need(exact(v,[...base,'branchId','expectedProfileVersion','functionalityMap','businessCategory'])&&id(v.branchId)&&Number.isSafeInteger(v.expectedProfileVersion)&&v.expectedProfileVersion>0&&['1000','0100','1100'].includes(v.functionalityMap)&&typeof v.businessCategory==='string'&&v.businessCategory.trim()===v.businessCategory&&v.businessCategory.length>0&&v.businessCategory.length<=250&&!/[\x00-\x1f\x7f]/.test(v.businessCategory),'INVALID_FISCAL_ENROLLMENT');return v;
  }
  const keys=[...base,'egsId'];
  need(id(v.egsId),'INVALID_FISCAL_ENROLLMENT');
  if(v.operation==='enrollment-begin'){keys.push('otp');need(typeof v.otp==='string'&&/^\d{6}$/.test(v.otp),'INVALID_FISCAL_ENROLLMENT');}
  else if(['enrollment-check','enrollment-operational','enrollment-activate'].includes(v.operation)){keys.push('expectedVersion');need(Number.isSafeInteger(v.expectedVersion)&&v.expectedVersion>0,'INVALID_FISCAL_ENROLLMENT');}
  else need(false,'INVALID_FISCAL_ENROLLMENT');
  need(exact(v,keys),'INVALID_FISCAL_ENROLLMENT');return v;
}
const methods={'enrollment-begin':'begin','enrollment-check':'check','enrollment-operational':'operational','enrollment-activate':'activate'};
const states=['not-started','checking','checks-complete','restart-required','operational-request-held','operational-recorded'];
function cleanStatus(v,scope,branchId){
  need(v?.environment==='production'&&v.workspaceId===scope.workspaceId&&v.egsId===scope.egsId&&v.branchId===branchId&&states.includes(v.state)&&typeof v.unitActive==='boolean'&&typeof v.enrollmentHeld==='boolean'&&Number.isSafeInteger(v.version)&&v.version>=0&&Number.isInteger(v.passed)&&[3,6].includes(v.required)&&v.passed>=0&&v.passed<=v.required,'FISCAL_ENROLLMENT_UNAVAILABLE');
  return {egsId:v.egsId,branchId:v.branchId,state:v.state,unitActive:v.unitActive,enrollmentHeld:v.enrollmentHeld,version:v.version,passed:v.passed,required:v.required};
}
export function createProductionEnrollmentCommand({db,loadWorkspace,enrollment,issuanceConfigured=false,clock=()=>new Date().toISOString()}){
  need(typeof db?.collection==='function'&&typeof db?.doc==='function'&&typeof db?.runTransaction==='function'&&typeof loadWorkspace==='function','FISCAL_ENROLLMENT_UNAVAILABLE');
  const configured=Boolean(enrollment&&['inspect',...Object.values(methods)].every(k=>typeof enrollment[k]==='function'));
  const root=(uid,w)=>'fiscalProductionV1/'+uid+'/workspaces/'+w;
  async function directory(identity,w){
    return db.runTransaction(async tx=>{
      const workspace=await loadWorkspace(tx,{accountUid:identity.uid,workspaceId:w});
      need(Array.isArray(workspace.branches),'FISCAL_ENROLLMENT_UNAVAILABLE');
      const result=await tx.get(db.collection(root(identity.uid,w)+'/egs').limit(101));
      need(result.docs.length<=100,'FISCAL_ENROLLMENT_LIMIT');
      const units=[];
      for(const snap of result.docs){
        const r=snap.data();
        need(r?.environment==='production'&&r.accountUid===identity.uid&&r.workspaceId===w&&r.egsId===snap.id&&id(r.egsId)&&id(r.branchId),'FISCAL_ENROLLMENT_UNAVAILABLE');
        const b=workspace.branches.find(b=>b.id===r.branchId&&b.workspaceId===w&&b.active===true);
        if(!b||!['enrolling','active'].includes(r.state))continue;
        units.push({egsId:r.egsId,branchId:r.branchId});
      }
      const profile=data(await tx.get(db.doc(root(identity.uid,w)+'/profiles/current')));
      const branches=[];
      need(workspace.branches.length<=100,'FISCAL_ENROLLMENT_LIMIT');
      for(const b of workspace.branches){
        need(id(b.id)&&b.workspaceId===w&&b.active===true,'FISCAL_ENROLLMENT_UNAVAILABLE');
        const request=data(await tx.get(db.doc(root(identity.uid,w)+'/provisioningRequests/'+b.id)));
        if(request)need(request.environment==='production'&&request.accountUid===identity.uid&&request.workspaceId===w&&request.branchId===b.id&&['pending','registered'].includes(request.state),'FISCAL_ENROLLMENT_UNAVAILABLE');
        const registered=units.some(u=>u.branchId===b.id);
        const status=registered?'registered':request?.state==='pending'&&profile&&request.profileVersion===profile.version&&request.sourceDigest===profile.sourceDigest?'pending':'not-requested';
        branches.push({branchId:b.id,label:String(b.nameAr||b.name||b.nameEn||b.id).slice(0,250),state:status});
      }
      return {units,branches,profileVersion:profile?.version??0};
    });
  }
  return async(identity,input)=>{
    const cmd=parseProductionEnrollmentCommand(input);
    need(identity?.role==='owner'&&id(identity.uid));
    if(cmd.operation==='enrollment-request'){
      // Never persist an apparently successful registration request when the
      // independently provisioned ZATCA runtime is not available. A pending
      // local document does not mean an authority registration has started.
      need(configured,'FISCAL_ENROLLMENT_UNAVAILABLE');
      const w=cmd.workspaceId,base=root(identity.uid,w);
      await db.runTransaction(async tx=>{
        const workspace=await loadWorkspace(tx,{accountUid:identity.uid,workspaceId:w});
        need(workspace.branches.some(b=>b.id===cmd.branchId&&b.workspaceId===w&&b.active===true));
        const profile=data(await tx.get(db.doc(base+'/profiles/current')));
        need(profile?.environment==='production'&&profile.accountUid===identity.uid&&profile.workspaceId===w&&profile.state==='pending-verification'&&profile.version===cmd.expectedProfileVersion&&profile.sourceDigest===fiscalCompanySourceDigest(workspace.company),'FISCAL_PROFILE_STALE');
        parseProductionProfileCommand({operation:'save',workspaceId:w,expectedVersion:profile.version,details:profile.details});
        need(profile.details.sellerIdScheme==='CRN'&&/^\d{10}$/.test(workspace.company.commercialRegistration.trim()),'FISCAL_ENROLLMENT_UNAVAILABLE');
        const ref=db.doc(base+'/provisioningRequests/'+cmd.branchId),prior=data(await tx.get(ref)),units=await tx.get(db.collection(base+'/egs').limit(101));
        need(units.docs.length<=100&&!units.docs.some(x=>x.data()?.branchId===cmd.branchId),'FISCAL_ENROLLMENT_ALREADY_REGISTERED');
        const next={environment:'production',accountUid:identity.uid,workspaceId:w,branchId:cmd.branchId,profileVersion:profile.version,sourceDigest:profile.sourceDigest,functionalityMap:cmd.functionalityMap,businessCategory:cmd.businessCategory,state:'pending'};
        if(prior){need(prior.environment==='production'&&prior.accountUid===identity.uid&&prior.workspaceId===w&&prior.branchId===cmd.branchId&&prior.state==='pending');if(Object.keys(next).every(k=>prior[k]===next[k]))return;need(prior.profileVersion!==profile.version||prior.sourceDigest!==profile.sourceDigest,'FISCAL_ENROLLMENT_REQUEST_PENDING');tx.update(ref,{...next,requestedAt:clock()});}
        else tx.create(ref,{...next,requestedAt:clock()});
      });
      return {environment:'production',workspaceId:w,refreshRequired:true};
    }
    const {units,branches,profileVersion}=await directory(identity,cmd.workspaceId);
    if(cmd.operation==='enrollment-status'){
      // No synthetic status and no actionable OTP if the runtime is missing.
      const status=[];
      if(configured)for(const item of units){
        try{status.push(cleanStatus(await enrollment.inspect(identity,{workspaceId:cmd.workspaceId,egsId:item.egsId}),{workspaceId:cmd.workspaceId,egsId:item.egsId},item.branchId));}
        catch{status.push({...item,state:'unavailable',unitActive:false,enrollmentHeld:true,version:0,passed:0,required:0});}
      }
      return {environment:'production',workspaceId:cmd.workspaceId,available:configured,registeredUnits:units.length,units:status,branches,profileVersion,issuanceEnabled:issuanceConfigured===true&&configured&&status.some(u=>u.unitActive&&!u.enrollmentHeld)};
    }
    need(configured,'FISCAL_ENROLLMENT_UNAVAILABLE');
    need(units.some(u=>u.egsId===cmd.egsId));
    const {operation,...args}=cmd;
    await enrollment[methods[operation]](identity,args);
    // Mutations never send certificate material, and never assert invoice
    // readiness. The browser must separately reread the committed projection.
    return {environment:'production',workspaceId:cmd.workspaceId,refreshRequired:true};
  };
}
