import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const component=await readFile(new URL('../src/components/AccountEntryScreen.tsx',import.meta.url),'utf8');

test('v227 exposes one primary account-entry heading in DOM order',()=>{
  assert.match(component,/<p className="auth-story-title">/);
  assert.doesNotMatch(component,/<h2>/);
  assert.match(component,/<h1>/);
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
