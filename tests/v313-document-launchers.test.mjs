import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const shell=fs.readFileSync('src/components/AppShell.tsx','utf8');
const app=fs.readFileSync('src/app/App.tsx','utf8');
const entry=fs.readFileSync('public/document-entry-v302.js','utf8');

const directKinds=['draft','rfq','proforma','proforma-invoice','purchase-order','invoice','delivery-note','payment-receipt'];

test('all ten document menu entries have active launch actions and stable identities',()=>{
  for(const kind of directKinds){
    assert.match(shell,new RegExp(`createDocument\\('${kind}'\\)`),`missing direct ${kind} launcher`);
    assert.match(entry,new RegExp(`['\"]${kind}['\"]`),`runtime identity map missing ${kind}`);
  }
  assert.match(shell,/onClick=\{this\.openCreditNote\}/);
  assert.match(shell,/onClick=\{this\.openStatementAccount\}/);
  assert.match(shell,/onCreditNote:\(\)=>void/);
  assert.match(shell,/onStatementAccount:\(\)=>void/);
  assert.match(entry,/normalizeCreateMenuKinds/);
  assert.match(entry,/button\.dataset\.kind=kind/);
  assert.match(entry,/['\"]credit-note['\"]/);
  assert.match(entry,/['\"]statement-account['\"]/);
});

test('credit note and statement launchers open real workflows',()=>{
  assert.match(app,/openCreditNoteLauncher/);
  assert.match(app,/invoiceCreditCapacity/);
  assert.match(app,/catalogLauncherModal/);
  assert.match(app,/lourex-finance-statement/);
  assert.match(app,/onCreditNote=\{this\.openCreditNoteLauncher\}/);
  assert.match(app,/onStatementAccount=\{this\.openStatementLauncher\}/);
});