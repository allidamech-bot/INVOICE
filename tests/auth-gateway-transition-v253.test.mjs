import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('v253 account entry delegates identity switching to the authenticated React transition without a page reload',async()=>{
  const account=await read('src/components/AccountEntryScreen.tsx');
  const app=await read('src/app/App.tsx');
  const transition=account.slice(account.indexOf('private enterAuthenticatedAccount'),account.indexOf('private prepareGoogle'));
  assert.match(transition,/new CustomEvent\('lourex-account-transition-request',\{detail:\{uid:user\.uid\}\}\)/);
  assert.doesNotMatch(transition,/setActiveAccountUid|activateAccountStorage|location\.(?:replace|reload|assign)/);
  assert.match(app,/window\.addEventListener\('lourex-account-transition-request',this\.handleAccountTransitionRequest as EventListener\)/);
  const handler=app.slice(app.indexOf('private handleAccountTransitionRequest='),app.indexOf('private handleOnline=',app.indexOf('private handleAccountTransitionRequest=')));
  assert.match(handler,/await this\.drainVaultWrites\(\)/);
  assert.match(handler,/await this\.waitForCloudIdle\(\)/);
  assert.ok(handler.indexOf('await suspendSession()')<handler.indexOf('setActiveAccountUid(uid)'));
  assert.ok(handler.indexOf('setActiveAccountUid(uid)')<handler.indexOf('await activateAccountStorage(uid)'));
});

test('v253 account sign-in signals one UID-scoped transition even if sessionStorage is unavailable',async()=>{
  const account=await read('src/components/AccountEntryScreen.tsx');
  const method=account.slice(account.indexOf('private enterAuthenticatedAccount='),account.indexOf('private prepareGoogle='));
  const ts=await import('typescript');
  const vm=await import('node:vm');
  const compiled=ts.default.transpileModule('class Harness{'+method+'} exports.Harness=Harness;',{
    compilerOptions:{module:ts.default.ModuleKind.CommonJS,target:ts.default.ScriptTarget.ES2022}
  }).outputText;
  for(const storageFails of [false,true]){
    const events=[],records=[],exports={};
    class EventShim{constructor(type,options){this.type=type;this.detail=options.detail;}}
    vm.runInNewContext(compiled,{
      exports,CustomEvent:EventShim,
      window:{dispatchEvent:event=>events.push({type:event.type,detail:event.detail}),location:{replace(){throw Error('Unexpected navigation');}}},
      sessionStorage:{setItem:(key,value)=>{if(storageFails)throw Error('Storage disabled');records.push({key,value});}}
    });
    await new exports.Harness().enterAuthenticatedAccount({uid:'example-uid',email:'account@example.test'});
    assert.equal(events.length,1);
    assert.equal(events[0].type,'lourex-account-transition-request');
    assert.equal(events[0].detail.uid,'example-uid');
    if(!storageFails)assert.equal(records[0]?.key,'lourex-auth-just-signed-in');
  }
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
