import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('v205 routes Account and Settings into distinct workspace scopes',async()=>{
  const shell=await read('src/components/AppShell.tsx');
  assert.match(shell,/SETTINGS_SCOPE_KEY='lourex-settings-scope'/);
  assert.match(shell,/this\.requestSettingsScope\('account'\);\s*this\.props\.onSettings\(\)/);
  assert.match(shell,/this\.requestSettingsScope\('settings'\);\s*this\.props\.onSettings\(\)/);
  assert.match(shell,/sessionStorage\.setItem\(SETTINGS_SCOPE_KEY,scope\)/);
});

test('v205 Account owns company profile while Settings owns preferences and security',async()=>{
  const settings=await read('src/components/SettingsModal.tsx');
  assert.match(settings,/const scope=consumeSettingsScope\(\)/);
  assert.match(settings,/Company profile','ملف الشركة/);
  assert.match(settings,/Company logo','شعار الشركة/);
  assert.match(settings,/Website','الموقع الإلكتروني/);
  assert.match(settings,/Identity & contact','الهوية والتواصل/);
  assert.match(settings,/Account access','الدخول إلى الحساب/);
  assert.match(settings,/Preferences, documents and security|Workspace preferences/);
  assert.match(settings,/Commercial','تجاري/);
  assert.match(settings,/Documents','المستندات/);
  assert.match(settings,/Security','الأمان/);
  assert.match(settings,/Company logo and profile details are managed from Account/);
});

test('v205 Arabic More menu declares RTL direction at the dialog boundary',async()=>{
  const shell=await read('src/components/AppShell.tsx');
  assert.match(shell,/mobile-more-sheet[^>]*dir=\{this\.props\.language==='ar'\?'rtl':'ltr'\}/);
  assert.match(shell,/Company profile, logo, website and account access','ملف الشركة والشعار والموقع وبيانات الحساب/);
  assert.match(shell,/Preferences, documents and security','التفضيلات والمستندات والأمان/);
});
