import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('v205 routes Account and Settings into distinct workspace scopes',async()=>{
  const [shell,scope]=await Promise.all([read('src/components/AppShell.tsx'),read('src/lib/settings-scope.ts')]);
  assert.match(shell,/SETTINGS_SCOPE_KEY='lourex-settings-scope'/);
  assert.match(shell,/this\.requestSettingsScope\('account'\);\s*this\.props\.onSettings\(\)/);
  assert.match(shell,/this\.requestSettingsScope\('settings'\);\s*this\.props\.onSettings\(\)/);
  assert.match(shell,/sessionStorage\.setItem\(SETTINGS_SCOPE_KEY,scope\)/);
  assert.match(scope,/SETTINGS_SCOPE_KEY='lourex-settings-scope'/);
  assert.match(scope,/sessionStorage\.getItem\(SETTINGS_SCOPE_KEY\)/);
  assert.match(scope,/sessionStorage\.removeItem\(SETTINGS_SCOPE_KEY\)/);
  assert.match(scope,/scope==='account'\?'account':'settings'/);
});

test('v205 Account owns company profile while Settings owns preferences and security',async()=>{
  const settings=await read('src/components/SettingsModal.tsx');
  assert.match(settings,/const scope=consumeSettingsScope\(\)/);
  assert.match(settings,/Company profile','ملف الشركة/);
  assert.match(settings,/Company logo','شعار الشركة/);
  assert.match(settings,/Website','الموقع الإلكتروني/);
  assert.match(settings,/Identity & contact','الهوية والتواصل/);
  assert.match(settings,/Legal & registration','البيانات القانونية والتسجيل/);
  assert.match(settings,/Account access','الدخول إلى الحساب/);
  assert.match(settings,/Workspace preferences/);
  assert.match(settings,/Commercial','تجاري/);
  assert.match(settings,/Documents','المستندات/);
  assert.match(settings,/Security','الأمان/);
  assert.match(settings,/Company logo and profile details are managed from Account/);
});

test('v205 Arabic More menu preserves bilingual accessible dialog direction and navigation',async()=>{
  const shell=await read('src/components/AppShell.tsx');
  // The current sheet is `ta-mobile-sheet`, not the retired `mobile-more-sheet`.
  // Verify the dialog boundary itself rather than a historical CSS class.
  assert.match(shell,/<section className="ta-mobile-sheet" id="ta-mobile-more" role="dialog" aria-modal="true" aria-label=\{t\('More','المزيد'\)\} dir=\{this\.props\.language==='ar'\?'rtl':'ltr'\}>/);
  assert.match(shell,/className="ta-sheet-backdrop"[^>]*onClick=\{this\.closeMore\}/);
  assert.match(shell,/className="ta-sheet-close" onClick=\{this\.closeMore\} aria-label=\{t\('Close','إغلاق'\)\}/);
  assert.match(shell,/aria-haspopup="dialog" aria-controls="ta-mobile-more" aria-expanded=\{this\.state\.moreOpen\}/);
  assert.match(shell,/t\('My Account','حسابي'\)/);
  assert.match(shell,/t\('Business, documents, security and data','الأعمال والمستندات والأمان والبيانات'\)/);
  assert.match(shell,/t\('Operations','العمليات'\)/);
  assert.match(shell,/t\('Finance & insights','المالية والتحليلات'\)/);
});

test('v211 Account Save stays in normal mobile flow with a full touch target',async()=>{
  const css=await read('src/styles/obsidian-closeout-v191.css');
  assert.match(css,/settings-workspace-v2\.account-profile-workspace \.settings-title\.account-profile-title\{[\s\S]*position:relative!important[\s\S]*top:auto!important/);
  assert.match(css,/settings-workspace-v2\.account-profile-workspace \.settings-title\.account-profile-title>\.btn\{[\s\S]*position:static!important[\s\S]*margin:0!important[\s\S]*min-width:96px!important[\s\S]*min-height:48px!important/);
});

test('v206 build keeps the settings scope bridge and advances the PWA cache',async()=>{
  const [pkg,patch]=await Promise.all([read('package.json'),read('scripts/pwa-cache-v205.mjs')]);
  assert.match(pkg,/node scripts\/pwa-cache-v205\.mjs/);
  assert.match(patch,/\.\/src\/lib\/settings-scope\.js/);
  assert.match(patch,/lourex-invoice-v206/);
  assert.match(patch,/lourex-invoice-v205: preserved as a legacy marker/);
  assert.match(patch,/lourex-invoice-v204: preserved as a legacy marker/);
});
