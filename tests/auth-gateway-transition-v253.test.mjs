import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('v253 authenticated gateway selects UID storage before replacing the page',async()=>{
  const account=await read('src/components/AccountEntryScreen.tsx');
  const transition=account.slice(account.indexOf('private enterAuthenticatedAccount'),account.indexOf('private prepareGoogle'));
  assert.match(transition,/setActiveAccountUid\(user\.uid\)/);
  assert.match(transition,/await activateAccountStorage\(user\.uid\)/);
  assert.match(transition,/window\.location\.replace\(window\.location\.href\)/);
  assert.ok(transition.indexOf('setActiveAccountUid(user.uid)')<transition.indexOf('await activateAccountStorage(user.uid)'));
  assert.ok(transition.indexOf('await activateAccountStorage(user.uid)')<transition.indexOf('window.location.replace(window.location.href)'));
});

test('v253 all successful account-entry paths use the deterministic gateway transition',async()=>{
  const account=await read('src/components/AccountEntryScreen.tsx');
  assert.match(account,/await this\.enterAuthenticatedAccount\(user\)/g);
  const matches=account.match(/await this\.enterAuthenticatedAccount\(user\)/g)||[];
  assert.ok(matches.length>=3,'email, Google, and redirect completion must share the same transition');
  const submit=account.slice(account.indexOf('private submit=async'),account.indexOf('private reset=async'));
  assert.doesNotMatch(submit,/setTimeout\(\(\)=>window\.location\.reload/);
  assert.match(submit,/else user=await signInCloudUser\(email,password\)/);
});
