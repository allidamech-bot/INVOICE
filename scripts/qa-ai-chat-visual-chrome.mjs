// Audits the final emitted CSS in actual Chromium against realistic local chat markup.
// No account login, no writes to LOUREX records, no production or Safari claims.
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
const sleep=ms=>new Promise(ok=>setTimeout(ok,ms));
async function until(fn,timeout=30000){const end=Date.now()+timeout;while(Date.now()<end){try{const r=await fn();if(r)return r;}catch{}await sleep(180);}throw Error('Browser test timeout');}
const bin=['google-chrome','google-chrome-stable','chromium','chromium-browser'].find(name=>{try{execFileSync(name,['--version'],{stdio:'ignore'});return true;}catch{return false;}});
assert.ok(bin,'Chromium required');
const markup=[
'<!doctype html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">',
'<link rel="stylesheet" href="/styles/app.bundle.css"><link rel="stylesheet" href="/ai-composer-v449.css">',
'<script src="/vendor/react.production.min.js"></script><script src="/vendor/react-dom.production.min.js"></script><style>html,body,#root{margin:0;width:100%;min-height:100%;}body{background:#080808}</style></head><body><div id="root">',
'<aside class="lourex-ai-panel" id="lourex-ai-panel" dir="rtl" data-lourex-workspace="2" data-lourex-conversation-remediation="3" data-workspace-mode="controller" data-workspace-ready="true">',
'<header class="lourex-ai-head"><div class="lourex-ai-title"><span class="lourex-ai-mark"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M4 7h16M4 17h16M9 4v6M15 14v6"/></svg></span><div><strong>LOUREX AI</strong><small>مساعد أعمالك الذكي</small></div></div><button class="lxw-history-trigger" aria-label="History"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M4 7h16M4 17h16M9 4v6M15 14v6"/></svg></button><button class="lxw-workspace-trigger" aria-label="Workspace"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M4 7h16M4 17h16M9 4v6M15 14v6"/></svg></button><button class="lxw-settings-trigger" aria-label="Settings"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M4 7h16M4 17h16M9 4v6M15 14v6"/></svg></button><div class="lourex-ai-head-actions" style="display:flex;gap:6px"><div class="lourex-ai-overflow"><button class="lourex-ai-overflow-trigger" aria-label="Conversation menu"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M4 7h16M4 17h16M9 4v6M15 14v6"/></svg></button></div><button class="lourex-ai-close" aria-label="Close"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M4 7h16M4 17h16M9 4v6M15 14v6"/></svg></button></div></header>',
'<nav class="lxw-mode-tabs"><button aria-selected="true">المتحكم</button><button aria-selected="false">المستشار</button></nav>',
'<div class="lxw-mode-description"><span class="lxw-mode-symbol">◇</span><span>المتحكم ينفّذ عرض السعر ويعرض الملفات بعد مراجعتها</span></div>',
'<div class="lxw-body"><div class="lxw-chat"><div class="lourex-ai-messages">',
'<div class="lxw-message-turn is-user"><div class="lourex-ai-message user"><span class="lourex-ai-user-copy">أنشئ عرض سعر للشركة الدولية للاستيراد والتصدير مع الشروط المطلوبة USD 14500.30</span></div><div class="lourex-ai-message-actions"><button>نسخ</button></div></div>',
'<div class="lxw-message-turn is-assistant"><div class="lourex-ai-message assistant lxw-markdown lxw-formatted-reply"><div class="lourex-ai-answer-copy lxw-markdown"><h3>ملخص التحليل</h3><div class="lxw-reply-question" dir="auto"><p class="lxw-reply-question-title"><strong>ما العملة المطلوبة؟</strong></p><p class="lxw-reply-question-detail">هذه تكملة أساسية للجواب وليست ملاحظة ثانوية. لا يمكن تحويل العملات دون سعر صرف.</p></div><p>جهزت المسودة للمراجعة. لا يتم حفظ أي مستند إلا بموافقتك.</p><ul><li class="lxw-ai-compact-result-row"><strong>الصنف الأول</strong> <code>QA-X1</code> بسعر معلوم</li><li>السعر الثاني غير متوفر</li></ul><div class="lxw-response-table" role="region" aria-label="AI results" tabindex="0"><table><thead><tr><th>الصنف SKU</th><th>الكمية</th><th>السعر USD</th><th>الإجمالي USD</th></tr></thead><tbody><tr><td dir="ltr">QA-X1</td><td>8</td><td>1.25</td><td>10.00</td></tr></tbody></table></div><p dir="ltr">Known subtotal: 10.00 USD. Missing price remains unknown.</p></div></div></div>',
'<div class="lxw-message-turn is-assistant"><div class="lourex-ai-message assistant lxw-markdown lxw-formatted-reply"><div class="lourex-ai-structured-answer"><section class="lourex-ai-answer-block is-summary"><div class="lourex-ai-answer-copy lxw-markdown"><p>مقارنة ورقتي Excel</p><div class="lxw-response-table" role="region" aria-label="Wide AI results" tabindex="0"><table><thead><tr>'+['الرمز','الكمية الأصلية','الكمية المصححة','سعر الوحدة','المبلغ الأصلي','المبلغ المصحح','فرق المبلغ','مدة التسليم','فرق مدة التسليم'].map(s=>'<th>'+s+'</th>').join('')+'</tr></thead><tbody><tr>'+['QA-A','8','10','1.25 USD','10.00 USD','12.50 USD','+2.50 USD','8','0'].map(s=>'<td>'+s+'</td>').join('')+'</tr></tbody></table></div><p>لا يمكن حساب الإجمالي الكامل لأن سعر QA-B غير محدد.</p></div></section></div></div></div>',
'<section class="lxw-chat-document">',
'<header><strong>عرض السعر للتوريدات الغذائية الدولية وشركة التجارة والتوزيع العالمية</strong><span>مسودة غير محفوظة</span></header>',
'<p>شركة الأفق للتجارة والاستيراد · 3 أصناف · <bdi>14500.30 USD</bdi></p>',
'<details open><summary>معاينة جميع السطور</summary><div class="lxw-document-review">',
'<header class="lxw-review-banner"><span class="lxw-review-kicker">LOUREX · مراجعة المستند</span><strong>عرض سعر تجريبي بمواصفات تعبئة وشحن طويلة مختلطة مع الإنجليزية</strong><span class="lxw-review-state">مسودة عمل · غير محفوظة</span></header>',
'<dl class="lxw-review-facts"><div><dt>العميل</dt><dd>الشركة العربية العالمية للاستيراد والتصدير والخدمات التجارية</dd></div><div><dt>العملة</dt><dd dir="ltr">USD</dd></div></dl>',
'<section class="lxw-review-section"><div class="lxw-review-heading"><strong>الأصناف والأسعار</strong><span>3 أصناف</span></div><ol class="lxw-review-items">',
'<li class="lxw-review-item"><div class="lxw-review-item-heading"><span class="lxw-review-index">1</span><strong>بسكويت الشوكولاتة 60g × 24 قطعة وشحن ميناء إسطنبول مع مواصفات التعبئة والكرتون</strong><b dir="ltr" class="lxw-review-amount">1,234,567.89 USD</b></div><dl><div><dt>الكمية</dt><dd dir="ltr">12500 CTN</dd></div><div><dt>سعر الوحدة</dt><dd dir="ltr">25.65 USD</dd></div></dl></li>',
'</ol></section><div class="lxw-review-subtotal"><span>المجموع الفرعي للأصناف المرفقة</span><strong dir="ltr">1,235,568.39 USD</strong></div>',
'<p class="lxw-review-disclaimer">فتح هذه المعاينة لا يحفظ المستند أو يصدر فاتورة.</p></div></details>',
'<label>العميل<select><option>شركة الأفق الدولية ذات الاسم الطويل</option></select></label>',
'<div class="lxw-chat-document-controls"><button>تعديل</button><button>تراجع</button><button>إعادة</button><button class="lxw-document-save">حفظ عرض السعر</button></div>',
'<small class="lxw-save-guidance">الحفظ يحتاج المراجعة والموافقة</small>',
'<section class="lxw-ai-pdf-actions"><button>إنشاء ومعاينة PDF</button><p>إنشاء PDF لا يحفظ المستند.</p>',
'<div class="lxw-ai-pdf-result"><div class="lxw-ai-pdf-file"><span class="lxw-pdf-symbol">PDF</span><div class="lxw-pdf-file-meta"><strong>LOUREX-Quotation-Long-Name.pdf</strong><small>145 KB · جاهز للفتح أو التنزيل</small></div></div>',
'<div class="lxw-ai-pdf-file-actions"><a class="lxw-pdf-preview" href="#">معاينة PDF</a><a class="lxw-pdf-download" href="#">تنزيل PDF</a></div></div></section></section>',
'<section class="lxw-inline-approval"><div class="lxw-inline-approval-title"><strong>المسودة جاهزة للمراجعة</strong><small>المعاينة لا تحفظ أي تغيير</small></div>',
'<div class="lxw-inline-approval-row"><button class="lxw-inline-preview-button">عرض التفاصيل</button><div class="lxw-inline-approval-buttons"><button>رفض</button><button class="primary">اعتماد المسودة</button></div></div></section>',
'<div class="lxw-thinking"><span class="lxw-thinking-dots"><i></i><i></i><i></i></span><span>LOUREX AI يعالج طلبك…</span></div>',
'</div><footer class="lourex-ai-compose"><div class="lourex-ai-attachment-strip"><div class="lourex-ai-attachment-chip"><strong class="lourex-ai-attachment-name">International-Quotation-Long-File-Name-TEST.pdf</strong><button class="lourex-ai-attachment-review">مراجعة</button><button class="lourex-ai-attachment-remove">×</button><small>جاهز للمراجعة · لم يحفظ</small></div></div><form><button class="lourex-ai-composer-plus">＋</button><textarea class="lourex-ai-premium-textarea" placeholder="اسأل LOUREX"></textarea><button class="lourex-ai-composer-mic">🎤</button><button class="lourex-ai-send">➤</button></form></footer>',
'</div></div><div id="lxw-motion-test" class="lourex-ai-overflow" style="position:absolute;top:80px;inset-inline-end:12px;width:220px"></div></aside></div></body></html>'
].join('');
const file='__lourex_ai_visual_qa__.html',profile=await mkdtemp(join(tmpdir(),'lourex-visual-'));
const children=[];let ws;
try{
 await writeFile('dist/'+file,markup);
 const server=spawn(process.execPath,['./node_modules/http-server/bin/http-server','dist','-p','4182','-a','127.0.0.1','-c-1'],{stdio:'ignore'});children.push(server);
 await until(async()=>(await fetch('http://127.0.0.1:4182/'+file)).ok,12000);
 const chrome=spawn(bin,['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:'ignore'});children.push(chrome);
 const port=await until(async()=>Number((await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]));
 const pages=await (await fetch('http://127.0.0.1:'+port+'/json/list')).json();
 ws=new WebSocket(pages.find(row=>row.type==='page').webSocketDebuggerUrl);
 await new Promise((ok,no)=>{ws.addEventListener('open',ok,{once:true});ws.addEventListener('error',()=>no(Error('CDP failed')),{once:true});});
 const tasks=new Map();let counter=0;
 ws.addEventListener('message',event=>{const p=JSON.parse(String(event.data)),t=tasks.get(p.id);if(!t)return;tasks.delete(p.id);clearTimeout(t.timer);p.error?t.no(Error(p.error.message)):t.ok(p.result||{});});
 const send=(method,params={})=>new Promise((ok,no)=>{const id=++counter,timer=setTimeout(()=>{tasks.delete(id);no(Error(method+' timeout'));},15000);tasks.set(id,{ok,no,timer});ws.send(JSON.stringify({id,method,params}));});
 await send('Page.enable');await send('Runtime.enable');
 for(const [width,height,rtl] of [[320,720,true],[390,844,true],[430,932,true],[820,1180,true],[1024,768,true],[1440,900,true],[390,844,false],[820,1180,false]]){
   await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<=820});
   await send('Page.navigate',{url:'http://127.0.0.1:4182/'+file});
   await until(async()=>{const x=await send('Runtime.evaluate',{expression:'document.readyState',returnByValue:true});return x.result?.value==='complete';},12000);
   const code=[
     "(async()=>{await document.fonts.ready;",
     "if(!RTL){document.documentElement.dir='ltr';document.getElementById('lourex-ai-panel').dir='ltr';}",
     "const get=s=>document.querySelector(s),style=s=>getComputedStyle(get(s));",
     "const paint=s=>{const cs=style(s),stops=cs.backgroundImage.match(/rgba?\\([^)]+\\)/g);if(stops?.length)return stops;let el=get(s);while(el){const bg=getComputedStyle(el).backgroundColor;if(bg!=='rgba(0, 0, 0, 0)')return [bg];el=el.parentElement;}throw Error('No opaque background for '+s);};",
     "const regions=['.lourex-ai-head','.lourex-ai-messages','.lxw-chat-document','.lxw-review-banner','.lxw-review-facts','.lxw-review-item','.lxw-review-subtotal','.lxw-ai-pdf-actions','.lxw-ai-pdf-file','.lxw-pdf-file-meta','.lxw-ai-pdf-file-actions','.lxw-chat-document-controls','.lxw-inline-approval','.lxw-inline-approval-buttons','.lxw-thinking','.lourex-ai-attachment-chip','.lourex-ai-compose form','.lxw-mode-tabs'];",
     "const overflows=regions.flatMap(s=>{const el=get(s);return el.scrollWidth>el.clientWidth+2?[{s,pixels:el.scrollWidth-el.clientWidth}]:[];});",
     "const controls=['.lourex-ai-head button','.lxw-chat-document-controls>button','.lxw-ai-pdf-actions>button','.lxw-ai-pdf-file-actions>a','.lxw-inline-approval-buttons>button','.lxw-inline-preview-button','.lourex-ai-attachment-review','.lourex-ai-attachment-remove','.lourex-ai-composer-plus','.lourex-ai-composer-mic','.lourex-ai-send','.lxw-mode-tabs>button'];",
     "const small=controls.flatMap(s=>Array.from(document.querySelectorAll(s)).filter(e=>e.getClientRects().length&&e.getBoundingClientRect().height<43).map(e=>({label:e.textContent.trim(),height:Math.round(e.getBoundingClientRect().height)})));",
     "const colors={};for(const [key,s] of [['edit','.lxw-chat-document-controls>button:first-child'],['save','.lxw-document-save'],['createPDF','.lxw-ai-pdf-actions>button'],['preview','.lxw-pdf-preview'],['download','.lxw-pdf-download'],['approve','.lxw-inline-approval-buttons>.primary'],['reject','.lxw-inline-approval-buttons>button:first-child']])colors[key]=style(s).background;",
     "const fonts={message:parseFloat(style('.lourex-ai-message').fontSize),review:parseFloat(style('.lxw-review-item dd').fontSize),button:parseFloat(style('.lxw-document-save').fontSize)};",
     "const readingFonts=['.lourex-ai-message.user','.lourex-ai-user-copy','.lourex-ai-answer-copy','.lxw-markdown p','.lxw-markdown li','.lxw-markdown li strong','.lxw-markdown code'].flatMap(s=>Array.from(document.querySelectorAll(s)).map(e=>({s,size:parseFloat(getComputedStyle(e).fontSize),line:parseFloat(getComputedStyle(e).lineHeight)})));",
     "const continuation={color:style('.lxw-reply-question-detail').color,bodyColor:style('.lourex-ai-answer-copy').color,opacity:style('.lxw-reply-question-detail').opacity,size:style('.lxw-reply-question-detail').fontSize};",
     "const tableFonts=Array.from(document.querySelectorAll('.lxw-response-table th,.lxw-response-table td')).map(e=>parseFloat(getComputedStyle(e).fontSize));",
     "const wide=get('[aria-label=\"Wide AI results\"]'),wideRect=wide.getBoundingClientRect(),wideBubble=wide.closest('.lourex-ai-message').getBoundingClientRect();const wideTable={left:wideRect.left,right:wideRect.right,bubbleLeft:wideBubble.left,bubbleRight:wideBubble.right,client:wide.clientWidth,scroll:wide.scrollWidth,overflow:getComputedStyle(wide).overflowX};",
     "const p=get('#lourex-ai-panel').getBoundingClientRect(),user=get('.lxw-message-turn.is-user').getBoundingClientRect(),assistant=get('.lourex-ai-message.assistant').getBoundingClientRect(),history=get('.lourex-ai-messages').getBoundingClientRect(),footer=get('.lourex-ai-compose').getBoundingClientRect();",
     "const position={userRight:Math.round(p.right-user.right),assistantLeft:Math.round(assistant.left-p.left),footerTop:Math.round(footer.top),historyBottom:Math.round(history.bottom)};",
     "const rgb=c=>c.match(/[0-9.]+/g)?.slice(0,3).map(Number)||[0,0,0],lum=c=>{const v=rgb(c).map(x=>{const y=x/255;return y<=.04045?y/12.92:Math.pow((y+.055)/1.055,2.4)});return v[0]*.2126+v[1]*.7152+v[2]*.0722},contrast=(a,b)=>{const x=lum(a),y=lum(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)};",
     "const actionContrast={};for(const [key,selector] of [['save','.lxw-document-save'],['approve','.lxw-inline-approval-buttons>.primary'],['reject','.lxw-inline-approval-buttons>button:first-child'],['pdf','.lxw-ai-pdf-actions>button'],['preview','.lxw-pdf-preview'],['download','.lxw-pdf-download']]){const cs=style(selector);actionContrast[key]=Math.round(Math.min(...paint(selector).map(bg=>contrast(cs.color,bg)))*10)/10;}",
     "return {ok:true,width:innerWidth,rtl:RTL,overflows,small,colors,fonts,readingFonts,tableFonts,wideTable,continuation,scrollbars:style('#lourex-ai-panel').scrollbarColor,canvas:style('#lourex-ai-panel').backgroundColor,position,actionContrast,spacing:{messages:style('.lourex-ai-messages').rowGap,document:style('.lxw-chat-document').rowGap},viewportOverflow:Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)-innerWidth};",
     "})().catch(e=>({error:String(e.stack||e)}))"
   ].join('').replaceAll('RTL',String(rtl));
   const response=await send('Runtime.evaluate',{expression:code,awaitPromise:true,returnByValue:true});
   const d=response.result?.value;
   assert.ok(d?.ok,'Visual fixture crashed at '+width+': '+JSON.stringify(d));
   console.log('VISUAL '+JSON.stringify(d));
   assert.equal(d.width,width);
   assert.ok(d.scrollbars.includes(d.canvas),'Scrollbar track must follow the active conversation canvas: '+d.scrollbars);
   assert.equal(d.continuation.color,d.continuation.bodyColor,'Answer continuation must not be demoted to muted metadata');
   assert.equal(d.continuation.opacity,'1');
   assert.equal(d.continuation.size,'16px');
   assert.ok(d.readingFonts.every(f=>f.size===16&&f.line>=25), 'Inconsistent conversation type: '+JSON.stringify(d.readingFonts));
   assert.ok(d.tableFonts.every(size=>size===15),'Unreadable table type: '+JSON.stringify(d.tableFonts));
   assert.ok(d.wideTable.left>=d.wideTable.bubbleLeft-1&&d.wideTable.right<=d.wideTable.bubbleRight+1,'Wide table escapes its answer bubble: '+JSON.stringify(d.wideTable));
   assert.ok(d.wideTable.scroll>d.wideTable.client&&d.wideTable.overflow==='auto','Wide table must scroll inside the answer: '+JSON.stringify(d.wideTable));
   assert.equal(d.overflows.length,0,width+'px horizontal container overflow: '+JSON.stringify(d.overflows));
   assert.equal(d.small.length,0,width+'px tap target too short: '+JSON.stringify(d.small));
   assert.ok(d.fonts.message>=15&&d.fonts.review>=12&&d.fonts.button>=13,'Tiny text '+JSON.stringify(d.fonts));
   assert.notEqual(d.colors.approve,d.colors.reject,'Approve and decline must use distinct states');
   assert.notEqual(d.colors.save,d.colors.createPDF,'Save and create PDF must be visually different');
    assert.ok(d.position.userRight<=60,'User bubble must be on the physical right: '+JSON.stringify(d.position));
    assert.ok(d.position.assistantLeft<=65,'Assistant reply must be on the physical left: '+JSON.stringify(d.position));
    assert.ok(d.position.footerTop>=d.position.historyBottom-3,'Composer must follow message region: '+JSON.stringify(d.position));
    for(const [name,ratio] of Object.entries(d.actionContrast))assert.ok(ratio>=4.5,'Low text contrast for '+name+' at '+width+': '+ratio);
   assert.ok(d.viewportOverflow<=3,'Page horizontal overflow '+d.viewportOverflow);
 }

 // Exercise the actual React presence component: closing, rapid reopen,
 // keyboard navigation and reduced motion. Only inert fixture buttons exist.
 const presence=await send('Runtime.evaluate',{awaitPromise:true,returnByValue:true,expression:`(async()=>{
  const {AiMenuPresence}=await import('/src/components/AiMenuPresence.js');
  const mount=document.getElementById('lxw-motion-test');let dismissed=0;
  const pause=ms=>new Promise(r=>setTimeout(r,ms));
  const content=()=>React.createElement('div',{role:'menu',className:'lourex-ai-overflow-menu'},
    React.createElement('button',{role:'menuitem'},'New conversation'),React.createElement('button',{role:'menuitem'},'History'));
  const paint=(open,reduced=false)=>ReactDOM.render(React.createElement(AiMenuPresence,{content:open?content():null,reduced,onDismiss:()=>{dismissed++;paint(false);}}),mount);
  paint(true);await pause(30);let menu=mount.querySelector('[role=menu]');
  const opening=Boolean(menu)&&getComputedStyle(menu).animationName==='lxw-surface-in';
  menu.querySelector('button').focus();menu.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));
  const keyboard=document.activeElement.textContent==='History';
  menu.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
  menu=mount.querySelector('[role=menu]');const closing=Boolean(menu?.inert)&&menu.getAttribute('aria-hidden')==='true'&&getComputedStyle(menu).pointerEvents==='none';
  await pause(220);const removed=!mount.querySelector('[role=menu]');
  paint(true);await pause(30);paint(false);await pause(40);paint(true);await pause(220);
  const reopened=Boolean(mount.querySelector('[role=menu]:not([inert])'));
  paint(false,true);const reduced=!mount.querySelector('[role=menu]');
  const {aiInlineTextRuns,aiTextDirection}=await import('/src/lib/ai-text-layout.js');
  const source='هامش الربح: 60.00%. الحسبة: (100 − 40) ÷ 100 × 100.';
  const runs=aiInlineTextRuns(source);
  ReactDOM.render(React.createElement(React.Fragment,null,
   React.createElement('p',{dir:'rtl'},...runs.map((r,i)=>r.direction?React.createElement('bdi',{key:i,dir:r.direction,className:'lxw-inline-ltr'},r.text):r.text)),
   React.createElement('div',{className:'lxw-response-table'},React.createElement('table',{dir:aiTextDirection('SKU Quantity')},React.createElement('tbody',null,React.createElement('tr',null,React.createElement('td',null,'SKU'),React.createElement('td',null,'Quantity')))))),mount);
  const paragraph=mount.querySelector('p'),formula=Array.from(paragraph.querySelectorAll('bdi')).find(e=>e.textContent.includes('−'));
  const text=formula.firstChild,offset=text.textContent.indexOf('40');
  const x=(start,size)=>{const r=document.createRange();r.setStart(text,start);r.setEnd(text,start+size);return r.getBoundingClientRect().x;};
  const math=x(text.textContent.indexOf('100'),3)<x(offset,2);
  const fidelity=paragraph.textContent===source;
  const cells=mount.querySelectorAll('td');const tableLtr=cells[0].getBoundingClientRect().x<cells[1].getBoundingClientRect().x;
  const {renderConversationWorkspace}=await import('/src/components/AiConversationWorkspace.js');
  const {newConversationKernel}=await import('/src/lib/ai-conversation-kernel.js');
  const {emptyVault}=await import('/src/lib/defaults.js');
  const props={language:'ar'},kernel=newConversationKernel({scope:'business',workspaceId:'default',branchId:'main',threadId:'fixture',accountId:''});
  const host={props,__workspaceObservedProps:props,__intelligenceKernel:kernel,__foundationVault:emptyVault(),__lourexAssistantThreadId:'fixture',state:{assistantScope:'business',messages:[]}};
  const textarea=value=>ReactDOM.render(renderConversationWorkspace(host,React.createElement('textarea',{className:'lourex-ai-premium-textarea',value,readOnly:true})),mount);
  textarea('multiline draft');let input=mount.querySelector('textarea');input.style.height='132px';input.focus();
  textarea('edited draft');const draftPreserved=input.style.height==='132px'&&document.activeElement===input;
  textarea('');const composerShrunk=mount.querySelector('textarea')===input&&input.style.height==='auto'&&input.getBoundingClientRect().height<132;
  const userSource='الحسبة: (100 − 40) ÷ 100 × 100 = 60.00%.';
  ReactDOM.render(renderConversationWorkspace(host,React.createElement('div',{className:'lourex-ai-message user'},React.createElement('div',{className:'lourex-ai-user-copy'},userSource))),mount);
  const userCopy=mount.querySelector('.lourex-ai-user-copy'),userBdi=userCopy.querySelector('bdi');
  const userIsolated=userCopy.textContent===userSource&&userBdi?.dir==='ltr';
  mount.style.width='720px';
  ReactDOM.render(renderConversationWorkspace(host,React.createElement('div',{className:'lourex-ai-message assistant'},'**فرق المبلغ:** 12.50 USD − 10.00 USD = **2.50 USD**.')),mount);
  const equation=Array.from(mount.querySelectorAll('bdi')).find(e=>e.textContent.trim()==='12.50 USD − 10.00 USD = 2.50 USD');
  const tokenX=token=>{let offset=equation.textContent.lastIndexOf(token),walker=document.createTreeWalker(equation,NodeFilter.SHOW_TEXT),n;while(n=walker.nextNode()){if(offset<n.textContent.length){const r=document.createRange();r.setStart(n,offset);r.setEnd(n,offset+token.length);return r.getBoundingClientRect().x;}offset-=n.textContent.length;}return NaN;};
  const currencyLtr=Boolean(equation)&&tokenX('12.50')<tokenX('10.00')&&tokenX('10.00')<tokenX('2.50')&&equation.querySelector('strong')?.textContent==='2.50 USD';
  ReactDOM.unmountComponentAtNode(mount);
  return {opening,keyboard,closing,removed,reopened,reduced,dismissed,math,fidelity,tableLtr,draftPreserved,composerShrunk,userIsolated,currencyLtr};
 })()`});
 const motion=presence.result?.value;
 assert.ok(motion?.opening&&motion.keyboard&&motion.closing&&motion.removed&&motion.reopened&&motion.reduced&&motion.dismissed===1&&motion.math&&motion.fidelity&&motion.tableLtr&&motion.draftPreserved&&motion.composerShrunk&&motion.userIsolated&&motion.currencyLtr,'Menu lifecycle regression: '+JSON.stringify(presence));
 console.log('PASS actual React menu presence: '+JSON.stringify(motion));

 // Simulate iPadOS visualViewport height contraction when the keyboard is up.
 // We check computed CSS and footer bounds, not native Safari behavior.
 await send('Emulation.setDeviceMetricsOverride',{width:820,height:1180,deviceScaleFactor:1,mobile:true});
 await send('Page.navigate',{url:'http://127.0.0.1:4182/'+file});
 await until(async()=>{const x=await send('Runtime.evaluate',{expression:'document.readyState',returnByValue:true});return x.result?.value==='complete';},12000);
 const keyboard=await send('Runtime.evaluate',{
   expression:"(()=>{const p=document.getElementById('lourex-ai-panel');p.style.setProperty('--lxw-viewport-height','540px');p.style.setProperty('--lxw-viewport-top','0px');const box=p.getBoundingClientRect(),composer=p.querySelector('.lourex-ai-compose').getBoundingClientRect();return {top:box.top,bottom:box.bottom,height:box.height,composerBottom:composer.bottom,width:innerWidth};})()",
   returnByValue:true
 });
 const kb=keyboard.result?.value;
 assert.equal(kb?.width,820,'Keyboard test must use iPad CSS viewport');
 assert.ok(kb.height>=500&&kb.height<=540,'Chat shell should shrink to the iPad visual viewport: '+JSON.stringify(kb));
 assert.ok(kb.bottom<=540&&kb.composerBottom<=540,'Composer must remain above the simulated keyboard: '+JSON.stringify(kb));
 console.log('PASS iPad simulated keyboard viewport: '+JSON.stringify(kb));

}finally{
 ws?.close();
 for(const child of children.reverse())if(child.exitCode===null)child.kill('SIGTERM');
 await sleep(450);await rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:250});await rm('dist/'+file,{force:true});
}
