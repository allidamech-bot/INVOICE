import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const js=read('public/ai-composer-v449.js');
const css=read('public/ai-composer-v449.css');
const hierarchy=read('scripts/ai-conversation-design-batch1.mjs');

// Execute the ACTUAL menu motion owner in a fake browser, without package deps.
function harness(reducedMotion=false,canAnimate=true){
  const begin=js.indexOf('  function animatePlusMenu(menu,opening){');
  const end=js.indexOf('  function directEvent(name)',begin);
  assert.ok(begin>=0&&end>begin,'motion contract remains in canonical composer');
  class Element {
    constructor(){this.hidden=true;this.dataset={};this.attrs={};this.inert=true;this.motions=[];this.focusCount=0;}
    setAttribute(key,value){this.attrs[key]=value;}
    querySelectorAll(){return[];}
    focus(){this.focusCount++;}
    animate(frames,options){
      const animation={frames,options,onfinish:null,oncancel:null,cancel(){this.oncancel?.();}};
      this.motions.push(animation);return animation;
    }
  }
  const menu=new Element(),plus=new Element();
  if(!canAnimate)menu.animate=undefined;
  const document={querySelector(selector){return selector.endsWith('.lourex-ai-plus-menu')?menu:plus;}};
  const window={matchMedia:()=>({matches:reducedMotion})};
  const setExpanded=(button,open)=>button?.setAttribute('aria-expanded',String(open));
  const factory=new Function('window','document','menuAnimations','setExpanded','PANEL','HTMLElement','HTMLButtonElement',js.slice(begin,end)+'\nreturn {setPlusMenuOpen,closeMenu};');
  const runtime=factory(window,document,new WeakMap(),setExpanded,'#lourex-ai-panel',Element,Element);
  return {menu,plus,...runtime};
}

test('plus menu uses a real entrance and exit animation, not instant hidden toggles',()=>{
  const h=harness();
  h.setPlusMenuOpen(h.menu,h.plus,true);
  assert.equal(h.menu.hidden,false);
  assert.equal(h.menu.inert,false);
  assert.equal(h.plus.attrs['aria-expanded'],'true');
  assert.equal(h.menu.attrs['aria-hidden'],'false');
  assert.equal(h.menu.motions[0].options.duration,260);
  h.menu.motions[0].onfinish();
  h.closeMenu();
  assert.equal(h.menu.hidden,false,'the menu is still rendered while exit motion plays');
  assert.equal(h.menu.inert,true,'the closing menu is not interactive');
  assert.equal(h.plus.attrs['aria-expanded'],'false');
  assert.equal(h.menu.motions[1].options.duration,165);
  h.menu.motions[1].onfinish();
  assert.equal(h.menu.hidden,true,'hide only when the exit animation ends');
});

test('rapid open-close-open cancels stale exit without hiding the reopened menu',()=>{
  const h=harness();
  h.setPlusMenuOpen(h.menu,h.plus,true);
  h.closeMenu();
  const staleExit=h.menu.motions[1];
  h.setPlusMenuOpen(h.menu,h.plus,true);
  assert.equal(staleExit.onfinish,null,'cancelled exit must never hide a newer open');
  assert.equal(h.menu.hidden,false);
  assert.equal(h.menu.dataset.lourexMenuOpen,'true');
  assert.equal(h.menu.inert,false);
});

test('reduced motion and unavailable animations leave no invisible menu',()=>{
  for(const config of [[true,true],[false,false]]){
    const h=harness(...config);
    h.setPlusMenuOpen(h.menu,h.plus,true);
    assert.equal(h.menu.hidden,false);
    h.closeMenu(true);
    assert.equal(h.menu.hidden,true);
    assert.equal(h.plus.focusCount,1);
    assert.equal(h.menu.motions.length,0);
  }
});

test('composer stays one pill with the send physically on the right in RTL',()=>{
  assert.match(css,/\.lourex-ai-compose form\{direction:ltr!important/);
  assert.match(css,/\.lourex-ai-composer-plus\{order:1/);
  assert.match(css,/\.lourex-ai-send\{order:4!important/);
  assert.match(css,/form>input\{order:2/);
  assert.match(css,/form>input\{[^}]*border:0!important;[^}]*background:transparent!important/);
  assert.match(css,/\[dir="rtl"\] \.lourex-ai-compose form>input\{direction:rtl!important;text-align:right!important/);
  assert.match(js,/message:text\(panel,'Ask LOUREX…','اسأل LOUREX…'\)/);
  assert.match(hierarchy,/min-height:52px!important/);
  assert.match(hierarchy,/\.lourex-ai-composer-mic:before\{content:''/);
  assert.match(hierarchy,/background:#f1f1f1!important/);
  assert.match(css,/\.lourex-ai-composer-plus\[aria-expanded="true"\] svg\{transform:rotate\(45deg\)/);
  assert.match(css,/\.lourex-ai-plus-menu\{[^}]*animation:none\}/);
});
