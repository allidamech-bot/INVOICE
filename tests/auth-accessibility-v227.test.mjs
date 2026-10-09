import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const component=await readFile(new URL('../src/components/AccountEntryScreen.tsx',import.meta.url),'utf8');

test('v227 exposes one primary account-entry heading and a subordinate form heading in DOM order',()=>{
  // The redesigned account gateway has one brand/story H1 and a distinct H2
  // naming the currently displayed sign-in, registration or linking form.
  assert.equal((component.match(/<h1>/g)||[]).length,1,'there must be only one page-level H1');
  assert.equal((component.match(/<h2>/g)||[]).length,1,'the form heading must be a single H2');
  assert.ok(component.indexOf('<h1>')<component.indexOf('<h2>'),'headings must be in reading order');
  assert.match(component,/<header className="ta-auth-card-header">/);
  assert.match(component,/Sign in to your workspace/);
  assert.match(component,/Create your LOUREX account/);
  assert.match(component,/Connect Google to your LOUREX account/);
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
