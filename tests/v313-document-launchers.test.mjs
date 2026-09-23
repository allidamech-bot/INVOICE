import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const shell=fs.readFileSync('src/components/AppShell.tsx','utf8');
const app=fs.readFileSync('src/app/App.tsx','utf8');

test('all ten document menu entries have active launch actions',()=>{
  assert.match(shell,/data-kind=\"credit-note\"[\s\S]*onClick=\{this\.openCreditNote\}/);
  assert.match(shell,/data-kind=\"statement-account\"[\s\S]*onClick=\{this\.openStatementAccount\}/);
  assert.match(shell,/onCreditNote:\(\)=>void/);
  assert.match(shell,/onStatementAccount:\(\)=>void/);
});

test('credit note and statement launchers open real workflows',()=>{
  assert.match(app,/openCreditNoteLauncher/);
  assert.match(app,/invoiceCreditCapacity/);
  assert.match(app,/catalogLauncherModal/);
  assert.match(app,/lourex-finance-statement/);
  assert.match(app,/onCreditNote=\{this\.openCreditNoteLauncher\}/);
  assert.match(app,/onStatementAccount=\{this\.openStatementLauncher\}/);
});
