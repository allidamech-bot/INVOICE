import {readFile,writeFile} from 'node:fs/promises';

const cssTarget='dist/ai-composer-v449.css';
let css=await readFile(cssTarget,'utf8');

if(!css.includes('LOUREX Remediation Batch 3 — Modern Conversation UX'))throw new Error('Remediation Batch 3 containment closeout requires the modern conversation owner.');
if(css.includes('LOUREX Remediation Batch 3 — Containment Closeout'))throw new Error('Remediation Batch 3 containment closeout is already installed.');

css+=`\n\n/* LOUREX Remediation Batch 3 — Containment Closeout\n   The flat thread must also contain existing functional tool-plan content on\n   narrow WebKit/RTL layouts. This is presentation-only; tool behavior is unchanged. */\nhtml body #root #lourex-ai-panel[data-lourex-conversation-remediation='3'] .lourex-ai-tool-activity{align-self:stretch!important;width:100%!important;max-width:100%!important;min-width:0!important;margin-inline:0!important;box-sizing:border-box!important;overflow:hidden!important;}\nhtml body #root #lourex-ai-panel[data-lourex-conversation-remediation='3'] :is(.lourex-ai-tool-activity-head,.lourex-ai-tool-steps,.lourex-ai-tool-step,.lourex-ai-tool-step-copy){max-width:100%!important;min-width:0!important;box-sizing:border-box!important;}\nhtml body #root #lourex-ai-panel[data-lourex-conversation-remediation='3'] :is(.lourex-ai-tool-step-copy b,.lourex-ai-tool-step-copy small,.lourex-ai-tool-foot){max-width:100%!important;overflow-wrap:anywhere!important;word-break:normal!important;}\n`;

if(!css.includes(".lourex-ai-tool-activity{align-self:stretch!important;width:100%!important;max-width:100%!important;min-width:0!important"))throw new Error('Remediation Batch 3 containment contract was not emitted.');
await writeFile(cssTarget,css);
console.log('[LOUREX] Remediation Batch 3 containment closeout installed: tool activity remains inside the flat AI panel on narrow WebKit/RTL layouts.');
