import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('v252 email/password auth settles Google persistence preparation first',async()=>{
  const account=await read('src/components/AccountEntryScreen.tsx');
  const submit=account.slice(account.indexOf('private submit=async'),account.indexOf('private reset=async'));
  const settle=submit.indexOf('await prepareGooglePopupAuth()');
  const create=submit.indexOf('await createCloudUser(email,password)');
  const signIn=submit.indexOf('await signInCloudUser(email,password)');
  assert.ok(settle>=0,'email/password submit must settle Google persistence preparation');
  assert.ok(create>settle,'account creation must run after Google persistence preparation settles');
  assert.ok(signIn>settle,'email sign-in must run after Google persistence preparation settles');
  assert.match(submit,/if\(!this\.state\.googleLinkPending\)\{try\{await prepareGooglePopupAuth\(\);\}catch\{\}\}/);
  assert.match(submit,/this\.setState\(\{message,error:''\}\)/);
});

test('v252 password auth remains the final Firebase persistence writer',async()=>{
  const firebase=await read('src/cloud/firebase.ts');
  const signIn=firebase.slice(firebase.indexOf('export async function signInCloudUser'),firebase.indexOf('export async function signOutCloudUser'));
  assert.ok(signIn.indexOf('Persistence.LOCAL')>=0);
  assert.ok(signIn.indexOf('Persistence.LOCAL')<signIn.indexOf('signInWithEmailAndPassword'));
});
