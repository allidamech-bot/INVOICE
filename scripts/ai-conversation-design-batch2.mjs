import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';

const runtimeTarget='dist/ai-composer-v449.js';
const cssTarget='dist/ai-composer-v449.css';

let runtime=await readFile(runtimeTarget,'utf8');
if(!runtime.includes('__lourexConversationComposerBatch3'))throw new Error('Conversation Design Batch 2 requires the current composer owner.');
if(runtime.includes('__lourexConversationDesignBatch2'))throw new Error('Conversation Design Batch 2 runtime is already installed.');

runtime+=`
;(()=>{'use strict';
const __lourexConversationDesignBatch2=true;
let scheduled=false;
const isAr=()=>document.documentElement.lang==='ar'||document.documentElement.dir==='rtl';
const panel=()=>document.getElementById('lourex-ai-panel');

function closeScopeMenu(root,returnFocus=false){
  if(!(root instanceof HTMLElement))return;
  const trigger=root.querySelector('.lourex-ai-scope-trigger');
  const menu=root.querySelector('.lourex-ai-scope-menu');
  if(menu instanceof HTMLElement)menu.hidden=true;
  if(trigger instanceof HTMLButtonElement){trigger.setAttribute('aria-expanded','false');if(returnFocus)trigger.focus();}
}
function syncScope(root){
  if(!(root instanceof HTMLElement))return;
  const native=[...root.querySelectorAll(':scope > .lourex-ai-scope-button[data-lourex-native-scope="true"]')].filter(node=>node instanceof HTMLButtonElement);
  const trigger=root.querySelector('.lourex-ai-scope-trigger');
  const menu=root.querySelector('.lourex-ai-scope-menu');
  if(!(trigger instanceof HTMLButtonElement)||!(menu instanceof HTMLElement)||!native.length)return;
  let activeIndex=native.findIndex(button=>button.getAttribute('aria-selected')==='true'||button.classList.contains('is-active'));
  if(activeIndex<0)activeIndex=0;
  const active=native[activeIndex];
  trigger.querySelector('.lourex-ai-scope-trigger-label').textContent=active?.textContent?.trim()||(isAr()?'الأعمال':'Business');
  trigger.disabled=native.every(button=>button.disabled);
  [...menu.querySelectorAll('.lourex-ai-scope-option')].forEach((option,index)=>{
    if(!(option instanceof HTMLButtonElement))return;
    const source=native[index];
    option.textContent=source?.textContent?.trim()||option.textContent;
    option.disabled=Boolean(source?.disabled);
    option.setAttribute('aria-checked',index===activeIndex?'true':'false');
    option.classList.toggle('is-active',index===activeIndex);
  });
}
function ensureScopeSelector(){
  const root=panel()?.querySelector('.lourex-ai-scopes');
  if(!(root instanceof HTMLElement))return;
  const native=[...root.querySelectorAll(':scope > .lourex-ai-scope-button')].filter(node=>node instanceof HTMLButtonElement);
  if(!native.length)return;
  native.forEach(button=>button.dataset.lourexNativeScope='true');
  if(root.querySelector('.lourex-ai-scope-trigger')){syncScope(root);return;}
  root.dataset.lourexScopeSelector='2';
  root.setAttribute('role','group');
  const trigger=document.createElement('button');
  trigger.type='button';
  trigger.className='lourex-ai-scope-trigger';
  trigger.setAttribute('aria-haspopup','menu');
  trigger.setAttribute('aria-expanded','false');
  trigger.setAttribute('aria-label',isAr()?'تغيير نطاق المساعد':'Change assistant scope');
  const label=document.createElement('span');label.className='lourex-ai-scope-trigger-label';
  const chevron=document.createElement('span');chevron.className='lourex-ai-scope-trigger-chevron';chevron.setAttribute('aria-hidden','true');chevron.textContent='⌄';
  trigger.append(label,chevron);
  const menu=document.createElement('div');menu.className='lourex-ai-scope-menu';menu.setAttribute('role','menu');menu.hidden=true;
  native.forEach((source,index)=>{
    const option=document.createElement('button');
    option.type='button';option.className='lourex-ai-scope-option';option.setAttribute('role','menuitemradio');option.dataset.scopeIndex=String(index);
    option.addEventListener('click',event=>{
      event.preventDefault();event.stopPropagation();
      const current=[...root.querySelectorAll(':scope > .lourex-ai-scope-button[data-lourex-native-scope="true"]')][index];
      if(current instanceof HTMLButtonElement&&!current.disabled)current.click();
      closeScopeMenu(root,true);
      window.setTimeout(()=>scheduleSync(),0);
    });
    menu.append(option);
  });
  trigger.addEventListener('click',event=>{
    event.preventDefault();event.stopPropagation();
    const opening=menu.hidden;
    document.querySelectorAll('#lourex-ai-panel .lourex-ai-scope-menu:not([hidden])').forEach(other=>{if(other!==menu){other.hidden=true;other.parentElement?.querySelector('.lourex-ai-scope-trigger')?.setAttribute('aria-expanded','false');}});
    menu.hidden=!opening;trigger.setAttribute('aria-expanded',opening?'true':'false');
    if(opening){syncScope(root);const active=menu.querySelector('.lourex-ai-scope-option.is-active');if(active instanceof HTMLButtonElement)active.focus();}
  });
  root.append(trigger,menu);syncScope(root);
}

function decorateToolActivity(){
  panel()?.querySelectorAll('.lourex-ai-tool-activity').forEach(card=>{
    if(!(card instanceof HTMLElement))return;
    const head=card.querySelector('.lourex-ai-tool-activity-head');
    if(!(head instanceof HTMLElement))return;
    if(card.dataset.lourexDesign2==='true')return;
    card.dataset.lourexDesign2='true';
    head.setAttribute('role','button');head.setAttribute('tabindex','0');head.setAttribute('aria-expanded','false');
    head.setAttribute('aria-label',isAr()?'إظهار أو إخفاء تفاصيل نشاط LOUREX':'Show or hide LOUREX activity details');
    const chevron=document.createElement('span');chevron.className='lourex-ai-tool-disclosure';chevron.setAttribute('aria-hidden','true');chevron.textContent='⌄';head.append(chevron);
    const toggle=()=>{
      const expanded=!card.classList.contains('is-expanded');
      card.classList.toggle('is-expanded',expanded);head.setAttribute('aria-expanded',expanded?'true':'false');
    };
    head.addEventListener('click',toggle);
    head.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();toggle();}});
  });
}

function decorateThreadPicker(){
  panel()?.querySelectorAll('.lourex-ai-thread-picker').forEach(picker=>{if(picker instanceof HTMLElement)picker.dataset.lourexDesign2='true';});
}

function sync(){
  scheduled=false;
  ensureScopeSelector();
  decorateToolActivity();
  decorateThreadPicker();
}
function scheduleSync(){if(scheduled)return;scheduled=true;queueMicrotask(sync);}

document.addEventListener('click',event=>{
  const root=panel()?.querySelector('.lourex-ai-scopes[data-lourex-scope-selector="2"]');
  if(!(root instanceof HTMLElement)||root.contains(event.target))return;
  closeScopeMenu(root,false);
});
document.addEventListener('keydown',event=>{
  if(event.key!=='Escape')return;
  const root=panel()?.querySelector('.lourex-ai-scopes[data-lourex-scope-selector="2"]');
  if(root instanceof HTMLElement&&root.querySelector('.lourex-ai-scope-menu:not([hidden])')){event.stopPropagation();closeScopeMenu(root,true);}
});
new MutationObserver(scheduleSync).observe(document.documentElement,{childList:true,subtree:true});
window.addEventListener('lourex-language-change',scheduleSync);
scheduleSync();
})();
`;

await writeFile(runtimeTarget,runtime);
execFileSync(process.execPath,['--check',runtimeTarget],{stdio:'pipe'});

let css=await readFile(cssTarget,'utf8');
if(!css.includes('LOUREX AI Conversation Design Batch 1'))throw new Error('Conversation Design Batch 2 requires Batch 1 CSS.');
if(css.includes('LOUREX AI Conversation Design Batch 2'))throw new Error('Conversation Design Batch 2 CSS is already installed.');

css+=`

/* LOUREX AI Conversation Design Batch 2
   Interaction consolidation: one scope control, disclosure-first trust details,
   calmer structured answers and refined history surfaces. */
html body #root #lourex-ai-panel[data-lourex-conversation-remediation='3'] .lourex-ai-context-shell{
  min-height:50px!important;
  padding:6px 12px!important;
}
html body #root #lourex-ai-panel[data-lourex-conversation-remediation='3'] .lourex-ai-scopes[data-lourex-scope-selector='2']{
  position:relative!important;
  flex:0 0 auto!important;
  width:auto!important;
  margin-inline-start:auto!important;
}
html body #root #lourex-ai-panel[data-lourex-conversation-remediation='3'] .lourex-ai-scopes[data-lourex-scope-selector='2'] > .lourex-ai-scope-button[data-lourex-native-scope='true']{
  display:none!important;
}
html body #root #lourex-ai-panel[data-lourex-conversation-remediation='3'] .lourex-ai-scope-trigger{
  display:flex!important;
  align-items:center!important;
  justify-content:space-between!important;
  gap:8px!important;
  min-width:112px!important;
  min-height:38px!important;
  padding:0 11px!important;
  border:1px solid var(--lx-chat-line)!important;
  border-radius:12px!important;
  background:var(--lx-chat-surface)!important;
  color:var(--lx-chat-text-2)!important;
  box-shadow:none!important;
  font:inherit!important;
  font-size:12px!important;
  font-weight:750!important;
  cursor:pointer!important;
}
html body #root #lourex-ai-panel[data-lourex-conversation-remediation='3'] .lourex-ai-scope-trigger:hover,
html body #root #lourex-ai-panel[data-lourex-conversation-remediation='3'] .lourex-ai-scope-trigger[aria-expanded='true']{
  background:var(--lx-chat-surface-2)!important;
  color:var(--lx-chat-text)!important;
}
html body #root #lourex-ai-panel[data-lourex-conversation-remediation='3'] .lourex-ai-scope-trigger-chevron,
html body #root #lourex-ai-panel[data-lourex-conversation-remediation='3'] .lourex-ai-tool-disclosure{
  display:inline-grid!important;
  place-items:center!important;
  width:18px!important;
  height:18px!important;
  color:var(--lx-chat-muted)!important;
  font-size:15px!important;
  line-height:1!important;
  transition:transform .14s ease!important;
}
html body #root #lourex-ai-panel[data-lourex-conversation-remediation='3'] .lourex-ai-scope-trigger[aria-expanded='true'] .lourex-ai-scope-trigger-chevron,
html body #root #lourex-ai-panel[data-lourex-conversation-remediation='3'] .lourex-ai-tool-activity.is-expanded .lourex-ai-tool-disclosure{
  transform:rotate(180deg)!important;
}
html body #root #lourex-ai-panel[data-lourex-conversation-remediation='3'] .lourex-ai-scope-menu{
  position:absolute!important;
  z-index:96!important;
  top:calc(100% + 6px)!important;
  inset-inline-end:0!important;
  min-width:180px!important;
  display:grid!important;
  gap:2px!important;
  padding:5px!important;
  border:1px solid var(--lx-chat-line-strong)!important;
  border-radius:14px!important;
  background:var(--lx-chat-surface)!important;
  box-shadow:0 18px 44px rgba(0,0,0,.28)!important;
}
html body #root #lourex-ai-panel[data-lourex-conversation-remediation='3'] .lourex-ai-scope-menu[hidden]{
  display:none!important;
}
html body #root #lourex-ai-panel[data-lourex-conversation-remediation='3'] .lourex-ai-scope-option{
  min-height:42px!important;
  padding:0 10px!important;
  border:0!important;
  border-radius:9px!important;
  background:transparent!important;
  color:var(--lx-chat-text-2)!important;
  font:inherit!important;
  font-size:12px!important;
  font-weight:700!important;
  text-align:start!important;
}
html body #root #lourex-ai-panel[data-lourex-conversation-remediation='3'] .lourex-ai-scope-option:hover,
html body #root #lourex-ai-panel[data-lourex-conversation-remediation='3'] .lourex-ai-scope-option.is-active{
  background:var(--lx-chat-surface-2)!important;
  color:var(--lx-chat-text)!important;
}
html body #root #lourex-ai-panel[data-lourex-conversation-remediation='3'] .lourex-ai-tool-activity[data-lourex-design2='true']{
  gap:0!important;
  padding:6px 9px!important;
  border-color:var(--lx-chat-line)!important;
  border-radius:11px!important;
  background:color-mix(in srgb,var(--lx-chat-surface) 72%,transparent)!important;
}
html body #root #lourex-ai-panel[data-lourex-conversation-remediation='3'] .lourex-ai-tool-activity[data-lourex-design2='true'] .lourex-ai-tool-activity-head{
  min-height:32px!important;
  cursor:pointer!important;
  user-select:none!important;
}
html body #root #lourex-ai-panel[data-lourex-conversation-remediation='3'] .lourex-ai-tool-activity[data-lourex-design2='true'] .lourex-ai-tool-activity-head strong{
  font-size:11.5px!important;
  font-weight:750!important;
}
html body #root #lourex-ai-panel[data-lourex-conversation-remediation='3'] .lourex-ai-tool-activity[data-lourex-design2='true'] .lourex-ai-tool-activity-head small{
  margin-inline-start:auto!important;
  font-size:10px!important;
}
html body #root #lourex-ai-panel[data-lourex-conversation-remediation='3'] .lourex-ai-tool-activity[data-lourex-design2='true']:not(.is-expanded) .lourex-ai-tool-steps,
html body #root #lourex-ai-panel[data-lourex-conversation-remediation='3'] .lourex-ai-tool-activity[data-lourex-design2='true']:not(.is-expanded) .lourex-ai-tool-foot{
  display:none!important;
}
html body #root #lourex-ai-panel[data-lourex-conversation-remediation='3'] .lourex-ai-tool-activity[data-lourex-design2='true'].is-expanded{
  padding:8px 10px 9px!important;
}
html body #root #lourex-ai-panel[data-lourex-conversation-remediation='3'] .lourex-ai-tool-activity[data-lourex-design2='true'].is-expanded .lourex-ai-tool-steps{
  margin-top:6px!important;
}
html body #root #lourex-ai-panel[data-lourex-conversation-remediation='3'] .lourex-ai-tool-activity[data-lourex-design2='true'].is-expanded .lourex-ai-tool-foot{
  display:block!important;
  margin-top:7px!important;
}
html body #root #lourex-ai-panel[data-lourex-conversation-remediation='3'] .lourex-ai-answer-block.is-summary .lourex-ai-answer-heading-row{
  display:none!important;
}
html body #root #lourex-ai-panel[data-lourex-conversation-remediation='3'] .lourex-ai-answer-block + .lourex-ai-answer-block{
  padding-top:12px!important;
  border-top:1px solid color-mix(in srgb,var(--lx-chat-line) 54%,transparent)!important;
}
html body #root #lourex-ai-panel[data-lourex-conversation-remediation='3'] .lourex-ai-thread-picker[data-lourex-design2='true']{
  width:min(360px,calc(100vw - 24px))!important;
  max-width:360px!important;
  max-height:min(58dvh,480px)!important;
  padding:7px!important;
  border-radius:16px!important;
}
html body #root #lourex-ai-panel[data-lourex-conversation-remediation='3'] .lourex-ai-thread-picker[data-lourex-design2='true'] .lourex-ai-thread-row{
  gap:3px!important;
  margin:0!important;
  padding:2px 0!important;
}
html body #root #lourex-ai-panel[data-lourex-conversation-remediation='3'] .lourex-ai-thread-picker[data-lourex-design2='true'] .lourex-ai-thread-open{
  min-height:46px!important;
  padding:7px 9px!important;
  background:transparent!important;
}
html body #root #lourex-ai-panel[data-lourex-conversation-remediation='3'] .lourex-ai-thread-picker[data-lourex-design2='true'] .lourex-ai-thread-open:hover{
  background:var(--lx-chat-surface-2)!important;
}
html body #root #lourex-ai-panel[data-lourex-conversation-remediation='3'] .lourex-ai-tool-approval{
  gap:8px!important;
  padding:10px 11px!important;
  border-radius:13px!important;
  box-shadow:none!important;
}
html body #root #lourex-ai-panel[data-lourex-conversation-remediation='3'] .lourex-ai-tool-approval-head small{
  line-height:1.35!important;
}
@media(max-width:720px){
  html body #root #lourex-ai-panel[data-lourex-conversation-remediation='3'] .lourex-ai-context-shell{
    min-height:52px!important;
    padding:4px 8px!important;
  }
  html body #root #lourex-ai-panel[data-lourex-conversation-remediation='3'] .lourex-ai-scopes[data-lourex-scope-selector='2']{
    flex:0 0 auto!important;
  }
  html body #root #lourex-ai-panel[data-lourex-conversation-remediation='3'] .lourex-ai-scope-trigger{
    min-width:118px!important;
    min-height:44px!important;
    height:44px!important;
    font-size:12.5px!important;
  }
  html body #root #lourex-ai-panel[data-lourex-conversation-remediation='3'] .lourex-ai-scope-menu{
    position:fixed!important;
    z-index:1400!important;
    top:calc(env(safe-area-inset-top,0px) + 58px)!important;
    inset-inline:8px!important;
    min-width:0!important;
    width:auto!important;
  }
  html body #root #lourex-ai-panel[data-lourex-conversation-remediation='3'] .lourex-ai-scope-option{
    min-height:48px!important;
    font-size:13px!important;
  }
  html body #root #lourex-ai-panel[data-lourex-conversation-remediation='3'] .lourex-ai-thread-picker[data-lourex-design2='true']{
    width:calc(100vw - 16px)!important;
    max-width:none!important;
  }
}
@media(prefers-reduced-motion:reduce){
  html body #root #lourex-ai-panel[data-lourex-conversation-remediation='3'] .lourex-ai-scope-trigger-chevron,
  html body #root #lourex-ai-panel[data-lourex-conversation-remediation='3'] .lourex-ai-tool-disclosure{
    transition:none!important;
  }
}
`;

await writeFile(cssTarget,css);
console.log('[LOUREX] AI Conversation Design Batch 2 installed: consolidated scope selector, disclosure-first trust UI, calmer structured answers and refined history surfaces.');
