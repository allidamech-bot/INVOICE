import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync,chmodSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';
import {createStagingEnvelopeWrapper} from '../api/_fiscal/staging-envelope.js';
test('local staging envelope authenticates every scope field and survives reopening',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'lourex-envelope-')),secretPath=join(dir,'key');
 try{
  writeFileSync(secretPath,randomBytes(32),{mode:0o600});
  const c={environment:'simulation',accountUid:'owner',workspaceId:'work',egsId:'unit',ref:'one',kind:'production'},key=randomBytes(32);
  const a=createStagingEnvelopeWrapper({secretPath}),v=await a.wrapKey({key,context:c}),b=createStagingEnvelopeWrapper({secretPath});
  assert.deepEqual(await b.unwrapKey({...v,context:c}),key);
  for(const field of ['accountUid','workspaceId','egsId','ref','kind','environment']){
   const context={...c,[field]:field==='kind'?'compliance':field==='environment'?'production':'other'};
   await assert.rejects(b.unwrapKey({...v,context}));
  }
  const damaged=Buffer.from(v.wrappedKey);damaged[15]^=1;
  await assert.rejects(b.unwrapKey({...v,wrappedKey:damaged,context:c}));
  await assert.rejects(b.unwrapKey({...v,keyId:'wrong',context:c}));
  chmodSync(secretPath,0o644);await assert.rejects(b.wrapKey({key,context:c}));
 }finally{rmSync(dir,{recursive:true,force:true});}
});
