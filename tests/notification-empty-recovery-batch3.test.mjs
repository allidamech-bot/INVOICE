import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';

test('locked notifications cannot claim a healthy empty result and retry recovers read-only',async()=>{
 let session=null;
 const snapshot={active:[],snoozed:[],done:[],activeHigh:0,activeMedium:0,activeLow:0};
 const imports={t:en=>en,resumeVaultSession:async()=>session,scopeVault:value=>value,buildNotificationCenter:()=>snapshot,todayIso:()=> '2026-10-04'};
 const React={createElement:(type,props,...children)=>({type,props:props||{},children}),Component:class{constructor(props){this.props=props;}setState(patch){this.state={...this.state,...patch};}}};
 const code=ts.transpileModule(readFileSync('src/components/NotificationCenterLive.tsx','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React}}).outputText;
 const exports={};runInNewContext(code,{exports,React,require:()=>imports});
 const page=new exports.NotificationCenterLive({onCount:()=>{},renderHomeSummary:true});
 await page.refresh(true);assert.equal(page.state.snapshot,null);assert.match(page.state.error,/Unlock the encrypted vault/);assert.equal(page.state.loading,false);
 const visit=node=>node&&typeof node==='object'?[node,...(node.children||[]).flat(Infinity).flatMap(visit)]:[];
 const summaryText=()=>visit(page.summary()).flatMap(node=>node.children).filter(child=>typeof child==='string').join(' ');
 assert.match(summaryText(),/Notifications unavailable/);assert.doesNotMatch(summaryText(),/No active follow-ups/);
 for(const tab of visit(page.render()).filter(node=>node.props.role==='tab')){
  tab.props.onClick();assert.match(page.state.error,/Unlock the encrypted vault/);assert.equal(page.state.snapshot,null);
 }
 session={vault:{documents:[]}};const before=JSON.stringify(session);
 await page.refresh(true);assert.equal(page.state.error,'');assert.equal(page.state.snapshot,snapshot);assert.equal(JSON.stringify(session),before);
 assert.match(summaryText(),/No active follow-ups/);
});
