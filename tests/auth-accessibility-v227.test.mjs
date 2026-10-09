import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const component=await readFile(new URL('../src/components/AccountEntryScreen.tsx',import.meta.url),'utf8');

test('account entry keeps a unique primary heading and a subordinate bilingual form heading',()=>{
  const headings=[...component.matchAll(/<h([12])>/g)];
  assert.equal(headings.length,2,'one page heading and one sign-in form heading');
  assert.deepEqual(headings.map(match=>match[1]),['1','2'],'page H1 must precede form H2');
  assert.match(component,/className="ta-auth-aside-copy"[\s\S]*<h1>\{t\('Your commercial workspace,/);
  assert.match(component,/className="ta-auth-card-header"[\s\S]*<h2>\{linkingGoogle\?/);
  assert.match(component,/t\('Sign in to your workspace','سجّل الدخول إلى مساحتك'\)/);
});

test('v227 account tabs use a roving tab stop and an associated panel',()=>{
  assert.match(component,/id="account-tab-signin"[\s\S]*aria-controls="account-entry-panel"[\s\S]*tabIndex=\{!create\?0:-1\}/);
  assert.match(component,/id="account-tab-create"[\s\S]*aria-controls="account-entry-panel"[\s\S]*tabIndex=\{create\?0:-1\}/);
  assert.match(component,/id="account-entry-panel" role="tabpanel" aria-labelledby=\{create\?'account-tab-create':'account-tab-signin'\}/);
});

test('v227 account tabs support arrows, Home and End while retaining focus',()=>{
  assert.match(component,/event\.key==='ArrowLeft'\|\|event\.key==='ArrowRight'/);
  assert.match(component,/event\.key==='Home'/);
  assert.match(component,/event\.key==='End'/);
  assert.match(component,/event\.preventDefault\(\)/);
  assert.match(component,/requestAnimationFrame\([\s\S]*getElementById\(`[\s\S]*\?\.focus\(\)/);
});
