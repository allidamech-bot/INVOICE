// Customer-facing commands for existing, independently provisioned EGS units.
// The browser cannot provide issuer identity, key, authority URL or eligibility.
const ID=/^[A-Za-z0-9_-]{1,128}$/;
const id=v=>typeof v==='string'&&ID.test(v);
const data=s=>s.exists?s.data():null;
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const need=(ok,code='FISCAL_ENROLLMENT_FORBIDDEN')=>{if(!ok)throw Error(code);};
export function parseProductionEnrollmentCommand(v){
  need(v&&id(v.workspaceId),'INVALID_FISCAL_ENROLLMENT');
  const base=['operation','workspaceId'];
  if(v.operation==='enrollment-status'){need(exact(v,base),'INVALID_FISCAL_ENROLLMENT');return v;}
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
export function createProductionEnrollmentCommand({db,loadWorkspace,enrollment,issuanceConfigured=false}){
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
      return units;
    });
  }
  return async(identity,input)=>{
    const cmd=parseProductionEnrollmentCommand(input);
    need(identity?.role==='owner'&&id(identity.uid));
    const units=await directory(identity,cmd.workspaceId);
    if(cmd.operation==='enrollment-status'){
      // No synthetic status and no actionable OTP if the runtime is missing.
      const status=[];
      if(configured)for(const item of units){
        try{status.push(cleanStatus(await enrollment.inspect(identity,{workspaceId:cmd.workspaceId,egsId:item.egsId}),{workspaceId:cmd.workspaceId,egsId:item.egsId},item.branchId));}
        catch{status.push({...item,state:'unavailable',unitActive:false,enrollmentHeld:true,version:0,passed:0,required:0});}
      }
      return {environment:'production',workspaceId:cmd.workspaceId,available:configured,registeredUnits:units.length,units:status,issuanceEnabled:issuanceConfigured===true&&configured&&status.some(u=>u.unitActive&&!u.enrollmentHeld)};
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
