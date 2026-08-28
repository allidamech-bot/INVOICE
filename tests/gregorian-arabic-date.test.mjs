import test from 'node:test';
import assert from 'node:assert/strict';
import { displayDate } from '../dist/src/lib/id.js';

test('Arabic document dates stay Gregorian instead of silently switching to Umm al-Qura',()=>{
  const value=displayDate('2026-08-27','ar');
  assert.match(value,/2026|٢٠٢٦/,'Arabic date should show Gregorian year 2026');
  assert.doesNotMatch(value,/1448|١٤٤٨|هـ|ربيع|رمضان|شوال|محرم|صفر/,'Arabic document date must not use Hijri calendar');
});

test('English document dates remain Gregorian',()=>{
  const value=displayDate('2026-08-27','en');
  assert.match(value,/2026/);
});
