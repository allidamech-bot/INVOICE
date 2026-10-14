import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {assertAiBusinessWriteAuthorized} from '../dist/src/lib/ai-business-write-authorization.js';

test('Controller must authorize all item/document writes for the selected operator at mutation time',()=>{
  const caps=[
    'item.archive','item.restore','item.updateMetadata',
    'document.createDraft','document.updateDraft'
  ];
  const permissions={
    owner:[true,true,true,true,true],
    admin:[true,true,true,true,true],
    sales:[false,false,false,true,true],
    finance:[false,false,false,true,true],
    purchasing:[true,true,true,false,false],
    viewer:[false,false,false,false,false]
  };
  for(const [role,access] of Object.entries(permissions)){
    const vault=emptyVault();
    vault.teamMembers=[{id:'test-operator',displayName:'Test Operator',role,status:'active'}];
    vault.appSettings.activeTeamMemberId='test-operator';
    for(let i=0;i<caps.length;i++){
      if(access[i])assert.doesNotThrow(()=>assertAiBusinessWriteAuthorized(vault,caps[i]),role+' '+caps[i]);
      else assert.throws(()=>assertAiBusinessWriteAuthorized(vault,caps[i]),/not authorized/,role+' '+caps[i]);
    }
  }
});

test('Inactive, missing, conflicting and switched Controller operator deny writes before business mutation',()=>{
  const vault=emptyVault();
  vault.teamMembers=[{id:'selected',displayName:'Test',role:'owner',status:'active'}];
  vault.appSettings.activeTeamMemberId='selected';
  assert.doesNotThrow(()=>assertAiBusinessWriteAuthorized(vault,'document.createDraft'));
  vault.teamMembers[0].status='inactive';
  assert.throws(()=>assertAiBusinessWriteAuthorized(vault,'document.createDraft'),/operator is unavailable/);
  vault.teamMembers[0].status='active';
  vault.teamMembers.push({...vault.teamMembers[0]});
  assert.throws(()=>assertAiBusinessWriteAuthorized(vault,'item.updateMetadata'),/operator is unavailable/);
  vault.teamMembers.pop();
  vault.appSettings.activeTeamMemberId='other';
  assert.throws(()=>assertAiBusinessWriteAuthorized(vault,'document.updateDraft'),/operator is unavailable/);
  vault.appSettings.activeTeamMemberId='selected';
  vault.teamMembers[0].role='viewer';
  assert.throws(()=>assertAiBusinessWriteAuthorized(vault,'document.updateDraft'),/not authorized/);
});

test('All three Controller mutation entry points check selected operator inside the fresh-vault transaction',async()=>{
  const source=await readFile(new URL('../src/components/AiCopilot.tsx',import.meta.url),'utf8');
  const mutate=source.slice(source.indexOf('private executeItemProposal'),source.indexOf('private approveProposal'));
  assert.match(mutate,/mutateVaultSafely\(vault=>\{assertAiBusinessWriteAuthorized\(vault,proposal\.capability\);/);
  assert.match(mutate,/mutateVaultSafely\(vault=>\{assertAiDocumentCreateApproval\(vault,proposal\);assertAiBusinessWriteAuthorized\(vault,proposal\.capability\);/);
  assert.match(mutate,/mutateVaultSafely\(vault=>\{assertAiDocumentUpdateApproval\(vault,proposal\);assertAiBusinessWriteAuthorized\(vault,proposal\.capability\);/);
  assert.match(mutate,/assertFoundationApproval\(vault,proposal\)/,
    'existing stamped approvals must remain validated');
  assert.doesNotMatch(source.slice(source.indexOf('private executeDocumentProposal'),source.indexOf('private approveProposal')),/\.status='final'/,
    'Controller saves drafts, not issued invoices');
});
