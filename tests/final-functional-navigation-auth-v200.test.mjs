import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');
const activeCacheVersion=sw=>{
  const matches=[...sw.matchAll(/^const CACHE = 'lourex-invoice-v(\d+)';$/gm)];
  return matches.length?Number(matches.at(-1)[1]):0;
};

test('v200 mobile navigation never leaves Create and More surfaces open together',async()=>{
  const shell=await read('src/components/AppShell.tsx');
  assert.match(shell,/private closeCreateMenu=\(\)=>\{if\(this\.props\.newMenu\)this\.props\.onToggleNew\(\);\}/);
  assert.match(shell,/private toggleCreate=\(\)=>\{[\s\S]*this\.closeMore\(\);[\s\S]*this\.props\.onToggleNew\(\);/);
  assert.match(shell,/private toggleMore=\(\)=>\{[\s\S]*this\.closeCreateMenu\(\);[\s\S]*moreOpen:!state\.moreOpen/);
  assert.match(shell,/private navigate=\(screen:NavTarget\)=>\{[\s\S]*this\.closeCreateMenu\(\);[\s\S]*this\.closeMore\(\);[\s\S]*this\.props\.onNavigate\(screen\);/);
  assert.match(shell,/onClick=\{this\.toggleCreate\}/);
  assert.match(shell,/onClick=\{this\.toggleMore\}/);
});

test('More sheet traps focus, closes on Escape/backdrop and exposes accurate mobile dialog semantics',async()=>{
  const shell=await read('src/components/AppShell.tsx');
  const keyHandler=shell.slice(shell.indexOf('private handleKeyDown='),shell.indexOf('private closeCreateMenu='));
  assert.match(shell,/componentDidMount\(\):void\{[\s\S]*document\.addEventListener\('keydown',this\.handleKeyDown\)/);
  assert.match(shell,/componentWillUnmount\(\):void\{[\s\S]*document\.removeEventListener\('keydown',this\.handleKeyDown\)/);
  assert.match(keyHandler,/if\(event\.key==='Escape'\)/);
  assert.match(keyHandler,/if\(this\.state\.moreOpen\)\{event\.preventDefault\(\);this\.setState\(\{moreOpen:false\}\);return;\}/);
  assert.match(keyHandler,/if\(this\.props\.newMenu\)\{event\.preventDefault\(\);this\.closeCreateMenu\(\);\}/);
  assert.match(keyHandler,/this\.trapOverlayFocus\(event,sheet\)/);
  assert.match(shell,/className="ta-overlay-backdrop ta-sheet-backdrop"[\s\S]*?onClick=\{this\.closeMore\}/);
  assert.match(shell,/id="ta-mobile-more" role="dialog" aria-modal="true"/);
  assert.match(shell,/aria-haspopup="dialog" aria-controls="ta-mobile-more" aria-expanded=\{this\.state\.moreOpen\}/);
  assert.match(shell,/className="ta-sheet-close" onClick=\{this\.closeMore\}/);
  assert.match(shell,/dir=\{this\.props\.language==='ar'\?'rtl':'ltr'\}/);
  assert.match(shell,/this\.applyOverlayLock\(false\)/);
});

test('account form blocks concurrent credential changes and submissions while authentication is pending',async()=>{
  const modal=await read('src/components/CloudAccountModal.tsx');
  assert.match(modal,/private setMode=\(mode:'signin'\|'create'\)=>\{if\(this\.state\.busy\)return/);
  assert.match(modal,/private run=async\(action:\(\)=>Promise<void>,success=''\)=>\{if\(this\.operationRunning\)return/);
  assert.match(modal,/className="ta-cloud-auth-form" aria-busy=\{this\.state\.busy\}/);
  assert.match(modal,/type="email" inputMode="email" autoComplete="email" disabled=\{this\.state\.busy\}/);
  assert.match(modal,/type="password" autoComplete=\{this\.state\.mode==='create'\?'new-password':'current-password'\}/);
  assert.match(modal,/minLength=\{this\.state\.mode==='create'\?MIN_ACCOUNT_PASSWORD_LENGTH:undefined\}/);
  assert.match(modal,/disabled=\{this\.state\.busy\} value=\{this\.state\.password\}/);
  assert.match(modal,/role="tablist" aria-label=/);
  assert.match(modal,/role="tab" aria-selected=\{this\.state\.mode==='signin'\} disabled=\{this\.state\.busy\}/);
  assert.match(modal,/role="tab" aria-selected=\{this\.state\.mode==='create'\} disabled=\{this\.state\.busy\}/);
});

test('v200 retains the secure sign-out boundary',async()=>{
  const modal=await read('src/components/CloudAccountModal.tsx');
  const signOut=modal.slice(modal.indexOf('private signOut=async'),modal.indexOf('render():any'));
  assert.match(signOut,/if\(this\.operationRunning\)return/);
  assert.match(signOut,/await this\.props\.onSignOut\(\)/);
  assert.match(signOut,/await suspendSession\(\)/);
  assert.match(signOut,/sessionStorage\.setItem\('lourex-auth-just-signed-out','1'\)/);
  assert.match(signOut,/window\.location\.reload\(\)/);
});

test('v200 is published as a new immutable PWA runtime generation',async()=>{
  const sw=await read('public/sw.js');
  assert.ok(activeCacheVersion(sw)>=200,'active PWA generation must be v200 or newer');
  assert.match(sw,/lourex-invoice-v199: preserved as a legacy marker/);
});
