// Shared mandatory server-side simulation boundary. Caller authorization is
// necessary but never replaces validation of the persisted workspace and EGS.
const ID=/^[A-Za-z0-9_-]{1,128}$/;
export function simulationBase(scope){
  if(scope?.environment!=='simulation'||!['accountUid','workspaceId','egsId'].every(k=>typeof scope[k]==='string'&&ID.test(scope[k])))throw Error('Fiscal scope mismatch: simulation scope required.');
  return 'fiscalPrivateV1/'+scope.accountUid+'/workspaces/'+scope.workspaceId;
}
export async function readSimulationContext(db,tx,scope,{active=false}={}){
  const base=simulationBase(scope);
  const w=await tx.get(db.doc(base)),u=await tx.get(db.doc(base+'/egs/'+scope.egsId));
  const workspace=w.exists?w.data():null,unit=u.exists?u.data():null;
  const matches=x=>x?.accountUid===scope.accountUid&&x.workspaceId===scope.workspaceId&&x.environment==='simulation';
  if(!matches(workspace)||workspace.syntheticOnly!==true||!matches(unit)||unit.egsId!==scope.egsId||(active&&unit.active!==true))throw Error('Fiscal scope mismatch: inactive or non-synthetic simulation context.');
  return {base,workspace,unit};
}
