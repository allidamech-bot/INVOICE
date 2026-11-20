import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';

// Internal environment-scoped credential envelopes. A trusted managed-key adapter
// must supply wrapKey/unwrapKey. Nothing is stored in the client-readable vault.
const ID=/^[A-Za-z0-9_-]{1,128}$/;
function id(v){if(typeof v!=='string'||!ID.test(v))throw Error('INVALID_CREDENTIAL_SCOPE');return v;}
function base64(v,max){
  if(typeof v!=='string'||!v.length||v.length>Math.ceil(max/3)*4||!/^[A-Za-z0-9+/]+={0,2}$/.test(v))throw Error('INVALID_CREDENTIAL_BYTES');
  const bytes=Buffer.from(v,'base64');if(bytes.length>max||bytes.toString('base64')!==v)throw Error('INVALID_CREDENTIAL_BYTES');return bytes;
}
function context(scope,ref,kind,environment){
  if(scope?.environment!==environment||!['compliance','production'].includes(kind))throw Error(environment==='simulation'?'SIMULATION_CREDENTIALS_ONLY':'PRODUCTION_CREDENTIALS_ONLY');
  return {accountUid:id(scope.accountUid),workspaceId:id(scope.workspaceId),egsId:id(scope.egsId),environment,ref:id(ref),kind};
}
function path(c){const production=c.environment==='production';return `${production?'fiscalProductionV1':'fiscalPrivateV1'}/${c.accountUid}/workspaces/${c.workspaceId}/egs/${c.egsId}/${production?'productionCredentials':'simulationCredentials'}/${c.ref}`;}
function payload(c,value){
  if(!value||['accountUid','workspaceId','egsId','environment','kind'].some(k=>value[k]!==c[k]))throw Error('CREDENTIAL_SCOPE_MISMATCH');
  base64(value.binarySecurityToken,32768);
  if(typeof value.secret!=='string'||!value.secret.length||value.secret.length>4096||!/^[!-~]+$/.test(value.secret)||!Number.isSafeInteger(value.requestId)||value.requestId<1)throw Error('INVALID_CREDENTIAL');
  return {binarySecurityToken:value.binarySecurityToken,secret:value.secret,requestId:value.requestId};
}
function createCredentialVault({db,wrapKey,unwrapKey,authorizeScope},environment,softwareStaging=false){
  const protectedScope=environment==='production'||softwareStaging;
  if(!db||typeof db.doc!=='function'||typeof db.runTransaction!=='function'||typeof wrapKey!=='function'||typeof unwrapKey!=='function')throw Error('CREDENTIAL_VAULT_NOT_CONFIGURED');
  if(protectedScope&&typeof authorizeScope!=='function')throw Error('CREDENTIAL_VAULT_NOT_CONFIGURED');
  async function authorize(tx,c,operation){if(protectedScope&&await authorizeScope(tx,Object.freeze({...c}),operation)!==true)throw Error('CREDENTIAL_SCOPE_MISMATCH');}
  return Object.freeze({
    async store(scope,ref,credential){
      const c=context(scope,ref,credential?.kind,environment), aad=Buffer.from(JSON.stringify(c)), plain=Buffer.from(JSON.stringify(payload(c,credential)));
      const key=randomBytes(32), nonce=randomBytes(12);
      try{
        if(protectedScope)await db.runTransaction(tx=>authorize(tx,c,'store'));
        const wrapped=await wrapKey({key,context:{...c}});
        if(!wrapped||typeof wrapped.keyId!=='string'||!wrapped.keyId.trim()||wrapped.keyId.length>1024||!Buffer.isBuffer(wrapped.wrappedKey)||!wrapped.wrappedKey.length||wrapped.wrappedKey.length>16384)throw Error('INVALID_WRAPPED_KEY');
        const cipher=createCipheriv('aes-256-gcm',key,nonce);cipher.setAAD(aad);
        const ciphertext=Buffer.concat([cipher.update(plain),cipher.final()]);
        const envelope={version:1,...c,keyId:wrapped.keyId,wrappedKey:wrapped.wrappedKey.toString('base64'),nonce:nonce.toString('base64'),tag:cipher.getAuthTag().toString('base64'),ciphertext:ciphertext.toString('base64')};
        await db.runTransaction(async tx=>{await authorize(tx,c,'store');const target=db.doc(path(c));if((await tx.get(target)).exists)throw Error('CREDENTIAL_ALREADY_EXISTS');tx.create(target,envelope);});
        return {ref:c.ref,kind:c.kind,environment:c.environment};
      }catch{throw Error('CREDENTIAL_STORE_FAILED');}finally{key.fill(0);plain.fill(0);}
    },
    async load(scope,ref,kind){
      const c=context(scope,ref,kind,environment);let key,plain;
      try{
        const envelope=await db.runTransaction(async tx=>{await authorize(tx,c,'load');const doc=await tx.get(db.doc(path(c)));return doc.exists?doc.data():null;});
        if(!envelope||envelope.version!==1||Object.keys(c).some(k=>envelope[k]!==c[k])||typeof envelope.keyId!=='string'||!envelope.keyId.trim()||envelope.keyId.length>1024)throw Error('INVALID_ENVELOPE');
        const nonce=base64(envelope.nonce,12),tag=base64(envelope.tag,16),ciphertext=base64(envelope.ciphertext,60000),wrappedKey=base64(envelope.wrappedKey,16384);
        if(nonce.length!==12||tag.length!==16)throw Error('INVALID_ENVELOPE');
        key=await unwrapKey({keyId:envelope.keyId,wrappedKey,context:{...c}});
        if(!Buffer.isBuffer(key)||key.length!==32)throw Error('INVALID_UNWRAPPED_KEY');
        const decipher=createDecipheriv('aes-256-gcm',key,nonce);decipher.setAAD(Buffer.from(JSON.stringify(c)));decipher.setAuthTag(tag);
        plain=Buffer.concat([decipher.update(ciphertext),decipher.final()]);
        const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(plain));
        const record={accountUid:c.accountUid,workspaceId:c.workspaceId,egsId:c.egsId,environment:c.environment,kind:c.kind,...payload(c,{...value,accountUid:c.accountUid,workspaceId:c.workspaceId,egsId:c.egsId,environment:c.environment,kind:c.kind})};
        return record;
      }catch{throw Error('CREDENTIAL_LOAD_FAILED');}finally{if(Buffer.isBuffer(key))key.fill(0);if(plain)plain.fill(0);}
    }
  });
}

export function createSimulationCredentialVault(options){return createCredentialVault(options,'simulation');}
export function createProductionCredentialVault(options){return createCredentialVault(options,'production');}

export function createStagingCredentialVault(options){return createCredentialVault(options,'simulation',true);}
