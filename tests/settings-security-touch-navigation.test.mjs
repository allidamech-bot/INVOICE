import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source=await readFile(new URL('../src/components/SettingsModal.tsx',import.meta.url),'utf8');

test('settings tabs activate on a deliberate pointer or touch tap, not a swipe',()=>{
  assert.match(source,/private handleSettingsTabTouchStart=[\s\S]*?changedTouches\[0\]/);
  assert.match(source,/private handleSettingsTabTouchEnd=[\s\S]*?changedTouches\[0\]/);
  assert.match(source,/private handleSettingsTabPointerDown=[\s\S]*?pointerId:event\.pointerId/);
  assert.match(source,/private handleSettingsTabPointerUp=[\s\S]*?start\.pointerId!==event\.pointerId/);
  assert.match(source,/Math\.abs\(touch\.clientX-start\.x\)>18\|\|Math\.abs\(touch\.clientY-start\.y\)>18/);
  assert.match(source,/Math\.abs\(event\.clientX-start\.x\)>18\|\|Math\.abs\(event\.clientY-start\.y\)>18/);
  assert.match(source,/this\.activateSettingsTabFromTouch\(tab\)/);
});

test('security tab supports delegated click plus pointer, touch, and cancellation paths',()=>{
  assert.match(source,/\['security',t\('Security','الأمان'\)/);
  assert.match(source,/private handleSettingsNavClickCapture=\(event:any\)=>\{/);
  assert.match(source,/closest\?\.\('\[data-settings-tab\]'\)/);
  assert.match(source,/data-settings-tab=\{id\}/);
  assert.match(source,/onClickCapture=\{this\.handleSettingsNavClickCapture\}/);
  assert.match(source,/onPointerDown=\{\(event:any\)=>this\.handleSettingsTabPointerDown\(id,event\)\}/);
  assert.match(source,/onPointerUp=\{\(event:any\)=>this\.handleSettingsTabPointerUp\(id,event\)\}/);
  assert.match(source,/onPointerCancel=\{\(\)=>\{this\.settingsPointerStart=null;\}\}/);
  assert.match(source,/onTouchStart=\{\(event:any\)=>this\.handleSettingsTabTouchStart\(id,event\)\}/);
  assert.match(source,/onTouchEnd=\{\(event:any\)=>this\.handleSettingsTabTouchEnd\(id,event\)\}/);
  assert.match(source,/onTouchCancel=\{\(\)=>\{this\.settingsTouchStart=null;\}\}/);
});
