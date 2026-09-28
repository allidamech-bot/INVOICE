import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source=await readFile(new URL('../src/components/SettingsModal.tsx',import.meta.url),'utf8');

test('settings tabs activate directly on a deliberate mobile touch',()=>{
  assert.match(source,/private handleSettingsTabTouchStart=[\s\S]*?changedTouches\[0\]/);
  assert.match(source,/private handleSettingsTabTouchEnd=[\s\S]*?changedTouches\[0\]/);
  assert.match(source,/Math\.abs\(touch\.clientX-start\.x\)>18\|\|Math\.abs\(touch\.clientY-start\.y\)>18/);
  assert.match(source,/this\.lastSettingsTouchActivation=\{tab,at:Date\.now\(\)\};\s*this\.selectSettingsTab\(tab\);/);
});

test('security tab keeps touch, click, and touch-cancel handlers attached to its tab button',()=>{
  assert.match(source,/\['security',t\('Security','الأمان'\)/);
  assert.match(source,/onTouchStart=\{\(event:any\)=>this\.handleSettingsTabTouchStart\(id,event\)\}/);
  assert.match(source,/onTouchEnd=\{\(event:any\)=>this\.handleSettingsTabTouchEnd\(id,event\)\}/);
  assert.match(source,/onTouchCancel=\{\(\)=>\{this\.settingsTouchStart=null;\}\}/);
  assert.match(source,/onClick=\{\(\)=>this\.handleSettingsTabClick\(id\)\}/);
});
