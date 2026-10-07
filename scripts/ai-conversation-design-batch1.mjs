import {readFile,writeFile} from 'node:fs/promises';

const cssTarget='dist/ai-composer-v449.css';
let css=await readFile(cssTarget,'utf8');

if(!css.includes('LOUREX Remediation Batch 3 — Modern Conversation UX'))throw new Error('Conversation Design Batch 1 requires the modern conversation owner.');
if(!css.includes('LOUREX Remediation Batch 4 — compact command hub + Memory & Tasks'))throw new Error('Conversation Design Batch 1 requires the current AI conversation stack.');
if(css.includes('LOUREX AI Conversation Design Batch 1'))throw new Error('Conversation Design Batch 1 is already installed.');

css+=`

/* LOUREX AI Conversation Design Batch 1
   Visual hierarchy closeout after live screenshot audit.
   No business capability, approval rule, scope behavior, history behavior,
   voice behavior or tool execution contract is changed here. */
html body #root #lourex-ai-panel[data-lourex-conversation-remediation='3']{
  --lx-chat-accent:#315fbd!important;
  width:min(580px,calc(100vw - 32px))!important;
  max-width:580px!important;
}
html[data-ui-theme='light'] body #root #lourex-ai-panel[data-lourex-conversation-remediation='3']{
  --lx-chat-accent:#3768c8!important;
}
html body #root #lourex-ai-panel[data-lourex-conversation-remediation='3'] .lourex-ai-title small{
  display:none!important;
}
html body #root #lourex-ai-panel[data-lourex-conversation-remediation='3'] .lourex-ai-context-shell{
  min-height:44px!important;
  padding:5px 12px 6px!important;
  justify-content:flex-end!important;
}
html body #root #lourex-ai-panel[data-lourex-conversation-remediation='3'] .lourex-ai-context-line,
html body #root #lourex-ai-panel[data-lourex-conversation-remediation='3'] .lourex-ai-context-copy{
  display:none!important;
}
html body #root #lourex-ai-panel[data-lourex-conversation-remediation='3'] .lourex-ai-scopes{
  margin-inline-start:auto!important;
}
html body #root #lourex-ai-panel[data-lourex-conversation-remediation='3'] .lourex-ai-scope-button{
  min-height:36px!important;
  height:36px!important;
  padding-inline:11px!important;
  font-size:11.5px!important;
  letter-spacing:0!important;
}
html body #root #lourex-ai-panel[data-lourex-conversation-remediation='3'] .lourex-ai-messages{
  gap:22px!important;
  padding:22px 22px 18px!important;
}
html body #root #lourex-ai-panel[data-lourex-conversation-remediation='3'] .lourex-ai-message{
  font-size:15px!important;
  line-height:1.62!important;
}
html body #root #lourex-ai-panel[data-lourex-conversation-remediation='3'] .lourex-ai-message.assistant:before{
  display:none!important;
  content:none!important;
}
html body #root #lourex-ai-panel[data-lourex-conversation-remediation='3'] .lourex-ai-message.user{
  max-width:min(80%,440px)!important;
  padding:11px 14px!important;
  border-radius:18px 18px 6px 18px!important;
  background:var(--lx-chat-accent)!important;
  color:#fff!important;
}
html body #root #lourex-ai-panel[data-lourex-conversation-remediation='3'][dir='rtl'] .lourex-ai-message.user{
  border-radius:18px 18px 18px 6px!important;
}
html body #root #lourex-ai-panel[data-lourex-conversation-remediation='3'] .lourex-ai-answer-heading{
  font-size:13.5px!important;
  line-height:1.4!important;
}
html body #root #lourex-ai-panel[data-lourex-conversation-remediation='3'] .lourex-ai-answer-copy,
html body #root #lourex-ai-panel[data-lourex-conversation-remediation='3'] .lourex-ai-answer-list{
  font-size:15px!important;
  line-height:1.62!important;
}
html body #root #lourex-ai-panel[data-lourex-conversation-remediation='3'] .lourex-ai-kpi-card small{
  font-size:11.5px!important;
}
html body #root #lourex-ai-panel[data-lourex-conversation-remediation='3'] .lourex-ai-kpi-card strong{
  font-size:15px!important;
}
html body #root #lourex-ai-panel[data-lourex-conversation-remediation='3'] .lourex-ai-tool-activity{
  margin:5px 0 0!important;
  padding:9px 10px!important;
  border-radius:12px!important;
  box-shadow:none!important;
}
html body #root #lourex-ai-panel[data-lourex-conversation-remediation='3'] .lourex-ai-tool-activity-head{
  min-height:28px!important;
}
html body #root #lourex-ai-panel[data-lourex-conversation-remediation='3'] .lourex-ai-tool-activity-head strong{
  font-size:11.5px!important;
}
html body #root #lourex-ai-panel[data-lourex-conversation-remediation='3'] .lourex-ai-tool-step-copy b{
  font-size:11.5px!important;
}
html body #root #lourex-ai-panel[data-lourex-conversation-remediation='3'] .lourex-ai-tool-step-copy small,
html body #root #lourex-ai-panel[data-lourex-conversation-remediation='3'] .lourex-ai-tool-foot{
  font-size:10.5px!important;
}
html body #root #lourex-ai-panel[data-lourex-conversation-remediation='3'] .lourex-ai-compose{
  padding:9px 12px max(11px,env(safe-area-inset-bottom,0px))!important;
}
html body #root #lourex-ai-panel[data-lourex-conversation-remediation='3'] .lourex-ai-compose form{
  min-height:60px!important;
  gap:2px!important;
  padding:5px!important;
  border-radius:28px!important;
  background:var(--lx-chat-surface)!important;
  box-shadow:0 6px 22px rgba(0,0,0,.12)!important;
}
html body #root #lourex-ai-panel[data-lourex-conversation-remediation='3'] .lourex-ai-premium-textarea{
  min-height:46px!important;
  max-height:136px!important;
  padding:10px 7px 8px!important;
  font-size:16px!important;
  line-height:1.5!important;
}
html body #root #lourex-ai-panel[data-lourex-conversation-remediation='3'] :is(.lourex-ai-composer-plus,.lourex-ai-composer-mic){
  width:44px!important;
  min-width:44px!important;
  height:44px!important;
  min-height:44px!important;
  border:0!important;
  border-radius:50%!important;
  background:transparent!important;
  box-shadow:none!important;
}
html body #root #lourex-ai-panel[data-lourex-conversation-remediation='3'] .lourex-ai-send{
  width:44px!important;
  min-width:44px!important;
  height:44px!important;
  min-height:44px!important;
  border-radius:50%!important;
  box-shadow:none!important;
}
html body #root #lourex-ai-panel[data-lourex-conversation-remediation='3'] .lourex-ai-send svg{
  transform:rotate(90deg)!important;
  transform-origin:center!important;
}
html body #root #lourex-ai-panel[data-lourex-conversation-remediation='3'] .lourex-ai-meta{
  justify-content:flex-end!important;
  min-height:18px!important;
  margin-top:5px!important;
}
html body #root #lourex-ai-panel[data-lourex-conversation-remediation='3'] .lourex-ai-meta>span{
  display:none!important;
}
html body #root #lourex-ai-panel[data-lourex-conversation-remediation='3'] .lourex-ai-proposal{
  padding:11px 12px!important;
  border-radius:13px!important;
  box-shadow:none!important;
}
@media (hover:hover) and (pointer:fine) and (min-width:721px){
  html body #root #lourex-ai-panel[data-lourex-conversation-remediation='3'] .lourex-ai-message-actions{
    opacity:0!important;
    pointer-events:none!important;
    transition:opacity .14s ease!important;
  }
  html body #root #lourex-ai-panel[data-lourex-conversation-remediation='3'] .lourex-ai-message:hover + .lourex-ai-message-actions,
  html body #root #lourex-ai-panel[data-lourex-conversation-remediation='3'] .lourex-ai-message-actions:hover,
  html body #root #lourex-ai-panel[data-lourex-conversation-remediation='3'] .lourex-ai-message-actions:focus-within{
    opacity:1!important;
    pointer-events:auto!important;
  }
  html body #root .lourex-ai-backdrop{
    display:none!important;
  }
}
@media(max-width:720px){
  html body #root #lourex-ai-panel[data-lourex-conversation-remediation='3']{
    inset:0!important;
    width:100vw!important;
    max-width:none!important;
    height:100dvh!important;
    max-height:100dvh!important;
    border:0!important;
    border-radius:0!important;
  }
  html body #root #lourex-ai-panel[data-lourex-conversation-remediation='3'] .lourex-ai-context-shell{
    min-height:48px!important;
    padding:3px 8px 4px!important;
  }
  html body #root #lourex-ai-panel[data-lourex-conversation-remediation='3'] .lourex-ai-scope-button{
    min-height:44px!important;
    height:44px!important;
    font-size:12px!important;
  }
  html body #root #lourex-ai-panel[data-lourex-conversation-remediation='3'] .lourex-ai-messages{
    gap:18px!important;
    padding:16px 13px 12px!important;
  }
  html body #root #lourex-ai-panel[data-lourex-conversation-remediation='3'] .lourex-ai-message{
    font-size:15.5px!important;
    line-height:1.62!important;
  }
  html body #root #lourex-ai-panel[data-lourex-conversation-remediation='3'] .lourex-ai-message.user{
    max-width:86%!important;
  }
  html body #root #lourex-ai-panel[data-lourex-conversation-remediation='3'] .lourex-ai-message-actions{
    opacity:.82!important;
  }
  html body #root #lourex-ai-panel[data-lourex-conversation-remediation='3'] .lourex-ai-answer-copy,
  html body #root #lourex-ai-panel[data-lourex-conversation-remediation='3'] .lourex-ai-answer-list{
    font-size:15.5px!important;
  }
  html body #root #lourex-ai-panel[data-lourex-conversation-remediation='3'] .lourex-ai-compose{
    padding:7px 8px max(9px,env(safe-area-inset-bottom,0px))!important;
  }
}
`;

if(!css.includes('width:min(580px,calc(100vw - 32px))!important'))throw new Error('Batch 1 desktop width contract was not emitted.');
if(!css.includes('.lourex-ai-send svg{\n  transform:rotate(90deg)!important'))throw new Error('Batch 1 send-arrow contract was not emitted.');
if(!css.includes('.lourex-ai-meta>span{\n  display:none!important'))throw new Error('Batch 1 composer metadata cleanup was not emitted.');
if(!css.includes('.lourex-ai-message.assistant:before{\n  display:none!important'))throw new Error('Batch 1 repeated assistant label removal was not emitted.');

await writeFile(cssTarget,css);
console.log('[LOUREX] AI Conversation Design Batch 1 installed: cleaner header, larger conversation typography, quieter message actions, unified composer and upward send affordance.');
