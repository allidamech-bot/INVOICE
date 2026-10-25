import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {
  fxRateForDate,fxRateMatchForDate,convertWithFxRate,convertWithFxMatch
} from '../dist/src/lib/fx-rates.js';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {scopeVault,createWorkspace,activateWorkspace} from '../dist/src/lib/workspaces.js';

function fx(id,date,rate,extra={}){
  return {
    id,workspaceId:'default',date,fromCurrency:'USD',toCurrency:'SAR',rate,
    sourceLabel:'Synthetic QA Bank',notes:'',
    createdAt:date+'T10:00:00.000Z',updatedAt:date+'T10:00:00.000Z',...extra
  };
}

test('24: conversion rejects malformed and blank amounts rather than silently reporting zero',()=>{
  const rate=fx('rate-1','2026-10-01','3.75000000');
  for(const amount of ['','  ','abc','++4','--4','1..2','1/3','Infinity','NaN']){
    assert.throws(()=>convertWithFxRate(amount,rate),/FX amount must be a valid decimal/i,amount);
    assert.throws(()=>convertWithFxMatch(amount,{rate,inverse:false}),/valid decimal/i,amount);
    assert.throws(()=>convertWithFxMatch(amount,{rate,inverse:true}),/valid decimal/i,amount);
  }
  assert.equal(convertWithFxRate('0',rate),'0.00','valid zero must still convert');
  assert.equal(convertWithFxRate('-100',rate),'-375.00');
  assert.equal(convertWithFxMatch('-375',{rate,inverse:true}),'-100.00');
  assert.equal(convertWithFxRate('١٠٠',rate),'375.00','Arabic digits stay supported');
});

test('24: the latest valid rate <= transaction date wins, not corrupt newer history',()=>{
  const clean=fx('older-valid','2026-10-01','3.75000000');
  const zero=fx('newer-zero','2026-10-20','0.00');
  const noSource=fx('newer-no-source','2026-10-21','4.00',{sourceLabel:''});
  const invalidDate=fx('invalid-date','not-a-date','4.25');
  const future=fx('future','2026-11-02','4.50');
  const rows=[future,zero,invalidDate,clean,noSource];
  const snapshot=JSON.stringify(rows);
  const chosen=fxRateForDate(rows,'usd','sar','2026-10-25');
  assert.equal(chosen?.id,clean.id);
  assert.equal(convertWithFxMatch('10',fxRateMatchForDate(rows,'SAR','USD','2026-10-25')),'2.6667');
  assert.equal(fxRateForDate(rows,'USD','SAR','2026-09-30'),undefined);
  assert.equal(fxRateForDate(rows,'USD','SAR','2026-10-00'),undefined);
  assert.equal(fxRateForDate(rows,'USD','SAR','untrusted-date'),undefined);
  assert.equal(JSON.stringify(rows),snapshot,'historical FX records are immutable');
});

test('24: invalid-only history fails closed with no invented FX conversion',()=>{
  const rows=[fx('invalid-zero','2026-10-01','0'),
    fx('invalid-source','2026-10-03','2',{sourceLabel:''})];
  assert.equal(fxRateMatchForDate(rows,'USD','SAR','2026-10-25'),undefined);
  assert.equal(fxRateMatchForDate(rows,'SAR','USD','2026-10-25'),undefined);
});

test('24: company workspace-scoped FX selection never leaks rate from another company',()=>{
  const base=emptyVault();
  const own=fx('own','2026-10-01','3.75');
  base.fxRates=[own];
  const next=createWorkspace(base,'Synthetic Second Company','QA2');
  const otherId=next.appSettings.activeWorkspaceId;
  const second=fx('foreign','2026-10-20','6.00',{workspaceId:otherId});
  next.fxRates.push(second);
  const selected=scopeVault(activateWorkspace(next,'default'));
  const unrelated=scopeVault(activateWorkspace(next,otherId));
  assert.deepEqual(selected.fxRates.map(x=>x.id),['own']);
  assert.deepEqual(unrelated.fxRates.map(x=>x.id),['foreign']);
  assert.equal(convertWithFxMatch('100',fxRateMatchForDate(selected.fxRates,'USD','SAR','2026-10-25')),'375.00');
  assert.equal(convertWithFxMatch('100',fxRateMatchForDate(unrelated.fxRates,'USD','SAR','2026-10-25')),'600.00');
});

test('24: user converter UI only computes valid typed amounts, includes bilingual warning',async()=>{
  const source=await readFile(new URL('../src/components/FxRatesPage.tsx',import.meta.url),'utf8');
  assert.match(source,/!isDecimalInput\(amount\)/);
  assert.match(source,/amount\.trim\(\)&&!amountInvalid\?convertWithFxMatch/);
  assert.match(source,/Enter a valid numeric amount before converting/);
  assert.match(source,/أدخل مبلغًا رقميًا صحيحًا قبل التحويل/);
  assert.match(source,/role="alert"/);
});
