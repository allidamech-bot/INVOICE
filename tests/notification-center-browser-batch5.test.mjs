import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('Batch 5 keeps one global center in AppShell without adding a primary route or mobile nav item',async()=>{
  const [shell,center]=await Promise.all([read('src/components/AppShell.tsx'),read('src/components/NotificationCenterLive.tsx')]);
  assert.match(shell,/NotificationCenterLive/);
  assert.match(shell,/renderHomeSummary=\{this\.props\.screen==='home'\}/);
  assert.match(shell,/Notifications & Follow-up/);
  assert.match(shell,/ta-sidebar-footer[\s\S]*openNotifications/);
  assert.match(shell,/ta-mobile-sheet[\s\S]*Notifications & Follow-up/);
  assert.match(shell,/ta-mobile-nav[\s\S]*Home[\s\S]*Documents[\s\S]*Customers[\s\S]*More/);
  assert.doesNotMatch(shell,/navItem\('notifications'/);
  assert.match(center,/mutateVaultSafely/);
  assert.match(center,/validatedNotificationStateEvent/);
});

test('Batch 5 UI is bilingual, mobile bounded and uses canonical bundled style ownership',async()=>{
  const [center,css,loader,index]=await Promise.all([read('src/components/NotificationCenterLive.tsx'),read('src/styles/notification-center-batch5.css'),read('src/lib/notification-center-style.ts'),read('index.html')]);
  assert.match(center,/Notifications & Follow-up/);assert.match(center,/التنبيهات والمتابعة/);
  assert.match(center,/Snooze/);assert.match(center,/تأجيل/);assert.match(center,/Done/);assert.match(center,/تم/);
  assert.match(css,/@media\(max-width:900px\)/);assert.match(css,/@media\(max-width:390px\)/);assert.match(css,/min-height:44px/);assert.match(css,/\[dir="rtl"\]/);assert.match(css,/prefers-reduced-motion:reduce/);
  assert.doesNotMatch(loader,/createElement\(['"]link['"]\)|notification-center-batch5\.css/);
  assert.match(index,/notification-center-batch5\.css\?v=457-1/);
  assert.doesNotMatch(center,/import .*\.css/);
});

test('Batch 5 has blocking real-vault browser QA for mobile EN AR and desktop',async()=>{
  const [workflow,runner,fixture]=await Promise.all([read('.github/workflows/batch5-notification-center.yml'),read('tests/visual/run-notification-center-batch5.cjs'),read('tests/visual/notification-center-batch5.html')]);
  assert.match(workflow,/Run Notification Center mobile and desktop browser QA/);
  assert.match(workflow,/tests\/notification-center-batch5\.test\.mjs tests\/notification-center-browser-batch5\.test\.mjs/);
  assert.match(runner,/mobile-en/);assert.match(runner,/mobile-ar/);assert.match(runner,/desktop-en/);
  assert.match(runner,/height>=44/);assert.match(runner,/scrollWidth<=geometry\.innerWidth\+1/);
  assert.match(runner,/Snooze/);assert.match(runner,/Tomorrow/);assert.match(runner,/Done/);
  assert.match(fixture,/setupVault/);assert.match(fixture,/establishSession/);assert.match(fixture,/registerVaultMutationBridge/);assert.match(fixture,/saveVault/);
});

test('Batch 5 intentionally defers unsupported low-stock, promised-payment and parallel AI reminder workflows',async()=>{
  const [engine,practical]=await Promise.all([read('src/lib/notification-center.ts'),read('src/components/NotificationCenterLive.tsx')]);
  assert.match(engine,/Low-stock alerts will wait for explicit reorder rules/);
  assert.doesNotMatch(engine,/promised-payment|supplier-quote-pending/);
  assert.doesNotMatch(practical,/fetch\(.+ai|\/api\/ai|AiCopilot/);
});
