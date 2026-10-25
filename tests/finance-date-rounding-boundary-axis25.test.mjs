import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {isIsoDate,addDaysIso,daysBetweenIso,displayDate} from '../dist/src/lib/id.js';
import {
  decimalToScaled,lineTotal,calculateTotals,isExactStockQuantityInput,
  isNonNegativeFinancialDecimalInput
} from '../dist/src/lib/money.js';

function inZone(timezone,instant){
  // Spawn an independent runtime, never replace other tests' clock or timezone.
  const script=[
    "const RealDate=Date;",
    "const fixedInstant="+JSON.stringify(instant)+";",
    "globalThis.Date=class extends RealDate {constructor(...args){super(...(args.length?args:[fixedInstant]));} static now(){return RealDate.parse(fixedInstant);}};",
    "const {todayIso,displayDate}=await import('./dist/src/lib/id.js');",
    "process.stdout.write(JSON.stringify({today:todayIso(),en:displayDate('2026-12-31','en'),ar:displayDate('2026-12-31','ar')}));"
  ].join('\n');
  const stdout=execFileSync(process.execPath,['--input-type=module','-e',script],{
    cwd:process.cwd(),env:{...process.env,TZ:timezone},encoding:'utf8'
  });
  return JSON.parse(stdout);
}

test('25: business local date is not the UTC day during Istanbul midnight transition',()=>{
  const instant='2026-10-24T22:30:00.000Z';
  const ist=inZone('Europe/Istanbul',instant);
  const utc=inZone('UTC',instant);
  const la=inZone('America/Los_Angeles',instant);
  assert.equal(ist.today,'2026-10-25','October 25 in Istanbul, not UTC October 24');
  assert.equal(utc.today,'2026-10-24');
  assert.equal(la.today,'2026-10-24');
  assert.equal(ist.en,utc.en,'printed document date independent of local timezone');
  assert.equal(ist.ar,utc.ar,'Arabic printed Gregorian date independent of local timezone');
  assert.equal(ist.ar,la.ar,'Arabic fiscal document date unaffected by other devices');
  assert.match(ist.ar,/2026|٢٠٢٦/,'Arabic date is Gregorian');
  assert.doesNotMatch(ist.ar,/1448|١٤٤٨|هـ/,'never turn into Hijri');
});

test('25: daylight-saving local date near boundary is stable across independent runtimes',()=>{
  const instant='2026-10-25T05:30:00.000Z';
  assert.equal(inZone('Europe/Istanbul',instant).today,'2026-10-25');
  assert.equal(inZone('America/Los_Angeles',instant).today,'2026-10-24');
});

test('25: Gregorian boundaries reject calendar-invalid historical posting dates',()=>{
  for(const invalid of ['2026-02-29','2026-02-30','2026-04-31','2026-00-01',
    '2026-13-01','2026-01-00','2026-10-1','2026/10/01','not-a-date']){
    assert.equal(isIsoDate(invalid),false,invalid);
  }
  for(const valid of ['2024-02-29','2026-10-25','2026-12-31'])
    assert.equal(isIsoDate(valid),true,valid);
  assert.equal(addDaysIso('2024-02-28',1),'2024-02-29');
  assert.equal(addDaysIso('2024-02-29',1),'2024-03-01');
  assert.equal(daysBetweenIso('2024-02-28','2024-03-01'),2);
  assert.equal(daysBetweenIso('2026-10-25','2026-10-24'),null);
  assert.equal(daysBetweenIso('2026-02-29','2026-03-01'),null);
  assert.match(displayDate('2024-02-29','ar'),/2024|٢٠٢٤/);
});

test('25: signed cent half-rounding is symmetric and tiny negatives fail new-value checks',()=>{
  assert.equal(decimalToScaled('0.005',2),1n);
  assert.equal(decimalToScaled('-0.005',2),-1n);
  assert.equal(decimalToScaled('0.0049',2),0n);
  assert.equal(decimalToScaled('-0.0049',2),0n);
  for(const negative of ['-0.00001','-٠٫٠٠٠٠١','-0.0049'])
    assert.equal(isNonNegativeFinancialDecimalInput(negative),false,negative);
  assert.equal(decimalToScaled('١٢٣٫٤٥',2),12345n);
  assert.equal(decimalToScaled('-١٢٣٫٤٥',2),-12345n);
  assert.equal(isExactStockQuantityInput('1.0001'),true);
  assert.equal(isExactStockQuantityInput('1.00001'),false,'five-decimal stock must not round');
});

test('25: tax/discount and sales totals use the same integer-cent rounding threshold',()=>{
  assert.equal(lineTotal('3','0.335'),'1.01');
  assert.equal(lineTotal('3','-0.335'),'-1.01');
  const config={
    discountEnabled:true,discountMode:'percent',discountValue:'10',
    shippingEnabled:false,shipping:'0',otherChargesEnabled:false,otherCharges:'0',
    taxEnabled:true,taxPercent:'20'
  };
  assert.deepEqual(calculateTotals([{quantity:'3',unitPrice:'0.335'}],config),{
    subtotal:'1.01',discount:'0.10',shipping:'0.00',
    otherCharges:'0.00',tax:'0.18',grandTotal:'1.09'
  });
});
