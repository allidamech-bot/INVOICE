import test from 'node:test';
import assert from 'node:assert/strict';
import {fiscalProfileFieldChecks,FiscalComplianceSettings} from '../dist/src/components/FiscalComplianceSettings.js';
import {setUiLanguage} from '../dist/src/lib/i18n.js';

globalThis.React={createElement:(tag,props,...children)=>({tag,props,children})};
const company={country:'SA',nameAr:'منشأة اختبار',vatNumber:'300000000000003',commercialRegistration:'1000000000',addressAr:'عنوان اختبار',city:'الرياض'};
const text=node=>Array.isArray(node)?node.map(text).join(' '):node&&typeof node==='object'?text(node.children):typeof node==='string'?node:'';
const elements=node=>Array.isArray(node)?node.flatMap(elements):node&&typeof node==='object'?[node,...elements(node.children)]:[];
test('complete local profile still never shows enabled or verified government service',()=>{
  setUiLanguage('en');
  assert.ok(fiscalProfileFieldChecks(company).every(item=>item.present));
  const view=FiscalComplianceSettings({company});const copy=text(view);
  assert.match(copy,/Not available yet/);assert.match(copy,/not registration, eligibility or certificate verification/);
  assert.doesNotMatch(copy,/300000000000003|1000000000/);
  assert.ok(elements(view).every(node=>!['button','input','form','a'].includes(node.tag)));
});
test('incomplete or malformed identity is labelled as needing review',()=>{
  setUiLanguage('en');
  const partial={...company,vatNumber:'bad',addressAr:' ',nameAr:undefined};
  const checks=fiscalProfileFieldChecks(partial);
  assert.deepEqual(checks.map(item=>item.present),[true,false,false,true,false]);
  assert.match(text(FiscalComplianceSettings({company:partial})),/Needs review/);
});
test('international profile sees scope explanation without forced Saudi checklist',()=>{
  setUiLanguage('en');
  const copy=text(FiscalComplianceSettings({company:{...company,country:'Türkiye',vatNumber:'1234567890'}}));
  assert.match(copy,/Commercial documents remain available/);assert.doesNotMatch(copy,/Company profile completeness/);
});
test('Arabic copy distinguishes local field checks from official registration and activation',()=>{
  setUiLanguage('ar');
  const copy=text(FiscalComplianceSettings({company}));
  assert.match(copy,/غير متاح للتفعيل حاليًا/);assert.match(copy,/ليست تحققًا من التسجيل أو الأهلية أو الشهادة/);
  assert.match(copy,/صيغة الرقم الضريبي السعودي/);
});
