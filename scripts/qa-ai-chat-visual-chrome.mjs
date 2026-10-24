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
'<style>html,body,#root{margin:0;width:100%;min-height:100%;}body{background:#080808}</style></head><body><div id="root">',
'<aside class="lourex-ai-panel" id="lourex-ai-panel" dir="rtl" data-lourex-workspace="2" data-lourex-conversation-remediation="3" data-workspace-mode="controller" data-workspace-ready="true">',
'<header class="lourex-ai-head"><div class="lourex-ai-title">LOUREX AI</div><div class="lourex-ai-head-actions"><button>☷</button></div></header>',
'<nav class="lxw-mode-tabs"><button aria-selected="true">المتحكم</button><button aria-selected="false">المستشار</button></nav>',
'<div class="lxw-mode-description"><span class="lxw-mode-symbol">◇</span><span>المتحكم ينفّذ عرض السعر ويعرض الملفات بعد مراجعتها</span></div>',
'<div class="lxw-body"><div class="lxw-chat"><div class="lourex-ai-messages">',
'<div class="lxw-message-turn is-user"><div class="lourex-ai-message user"><span class="lourex-ai-user-copy">أنشئ عرض سعر للشركة الدولية للاستيراد والتصدير مع الشروط المطلوبة USD 14500.30</span></div><div class="lourex-ai-message-actions"><button>نسخ</button></div></div>',
'<div class="lxw-message-turn is-assistant"><div class="lourex-ai-message assistant lxw-markdown lxw-formatted-reply"><div class="lourex-ai-answer-copy lxw-markdown"><h3>ملخص التحليل</h3><div class="lxw-reply-question" dir="auto"><p class="lxw-reply-question-title"><strong>ما العملة المطلوبة؟</strong></p><p class="lxw-reply-question-detail">هذه تكملة أساسية للجواب وليست ملاحظة ثانوية. لا يمكن تحويل العملات دون سعر صرف.</p></div><p>جهزت المسودة للمراجعة. لا يتم حفظ أي مستند إلا بموافقتك.</p><ul><li class="lxw-ai-compact-result-row"><strong>الصنف الأول</strong> <code>QA-X1</code> بسعر معلوم</li><li>السعر الثاني غير متوفر</li></ul><div class="lxw-response-table" role="region" aria-label="AI results" tabindex="0"><table><thead><tr><th>الصنف SKU</th><th>الكمية</th><th>السعر USD</th><th>الإجمالي USD</th></tr></thead><tbody><tr><td dir="ltr">QA-X1</td><td>8</td><td>1.25</td><td>10.00</td></tr></tbody></table></div><p dir="ltr">Known subtotal: 10.00 USD. Missing price remains unknown.</p></div></div></div>',
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
'</div></div></aside></div></body></html>'
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
     "const regions=['.lourex-ai-messages','.lxw-chat-document','.lxw-review-banner','.lxw-review-facts','.lxw-review-item','.lxw-review-subtotal','.lxw-ai-pdf-actions','.lxw-ai-pdf-file','.lxw-pdf-file-meta','.lxw-ai-pdf-file-actions','.lxw-chat-document-controls','.lxw-inline-approval','.lxw-inline-approval-buttons','.lxw-thinking','.lourex-ai-attachment-chip','.lourex-ai-compose form','.lxw-mode-tabs'];",
     "const overflows=regions.flatMap(s=>{const el=get(s);return el.scrollWidth>el.clientWidth+2?[{s,pixels:el.scrollWidth-el.clientWidth}]:[];});",
     "const controls=['.lxw-chat-document-controls>button','.lxw-ai-pdf-actions>button','.lxw-ai-pdf-file-actions>a','.lxw-inline-approval-buttons>button','.lxw-inline-preview-button','.lourex-ai-attachment-review','.lourex-ai-attachment-remove','.lourex-ai-composer-plus','.lourex-ai-composer-mic','.lourex-ai-send','.lxw-mode-tabs>button'];",
     "const small=controls.flatMap(s=>Array.from(document.querySelectorAll(s)).filter(e=>e.getBoundingClientRect().height<43).map(e=>({label:e.textContent.trim(),height:Math.round(e.getBoundingClientRect().height)})));",
     "const colors={};for(const [key,s] of [['edit','.lxw-chat-document-controls>button:first-child'],['save','.lxw-document-save'],['createPDF','.lxw-ai-pdf-actions>button'],['preview','.lxw-pdf-preview'],['download','.lxw-pdf-download'],['approve','.lxw-inline-approval-buttons>.primary'],['reject','.lxw-inline-approval-buttons>button:first-child']])colors[key]=style(s).background;",
     "const fonts={message:parseFloat(style('.lourex-ai-message').fontSize),review:parseFloat(style('.lxw-review-item dd').fontSize),button:parseFloat(style('.lxw-document-save').fontSize)};",
     "const readingFonts=['.lourex-ai-message.user','.lourex-ai-user-copy','.lourex-ai-answer-copy','.lxw-markdown p','.lxw-markdown li','.lxw-markdown li strong','.lxw-markdown code'].flatMap(s=>Array.from(document.querySelectorAll(s)).map(e=>({s,size:parseFloat(getComputedStyle(e).fontSize),line:parseFloat(getComputedStyle(e).lineHeight)})));",
     "const continuation={color:style('.lxw-reply-question-detail').color,bodyColor:style('.lourex-ai-answer-copy').color,opacity:style('.lxw-reply-question-detail').opacity,size:style('.lxw-reply-question-detail').fontSize};",
     "const tableFonts=Array.from(document.querySelectorAll('.lxw-response-table th,.lxw-response-table td')).map(e=>parseFloat(getComputedStyle(e).fontSize));",
     "const p=get('#lourex-ai-panel').getBoundingClientRect(),user=get('.lxw-message-turn.is-user').getBoundingClientRect(),assistant=get('.lourex-ai-message.assistant').getBoundingClientRect(),history=get('.lourex-ai-messages').getBoundingClientRect(),footer=get('.lourex-ai-compose').getBoundingClientRect();",
     "const position={userRight:Math.round(p.right-user.right),assistantLeft:Math.round(assistant.left-p.left),footerTop:Math.round(footer.top),historyBottom:Math.round(history.bottom)};",
     "const rgb=c=>c.match(/[0-9.]+/g)?.slice(0,3).map(Number)||[0,0,0],lum=c=>{const v=rgb(c).map(x=>{const y=x/255;return y<=.04045?y/12.92:Math.pow((y+.055)/1.055,2.4)});return v[0]*.2126+v[1]*.7152+v[2]*.0722},contrast=(a,b)=>{const x=lum(a),y=lum(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)};",
     "const actionContrast={};for(const [key,selector] of [['save','.lxw-document-save'],['approve','.lxw-inline-approval-buttons>.primary'],['reject','.lxw-inline-approval-buttons>button:first-child'],['pdf','.lxw-ai-pdf-actions>button'],['preview','.lxw-pdf-preview'],['download','.lxw-pdf-download']]){const cs=style(selector);actionContrast[key]=Math.round(Math.min(...paint(selector).map(bg=>contrast(cs.color,bg)))*10)/10;}",
     "return {ok:true,width:innerWidth,rtl:RTL,overflows,small,colors,fonts,readingFonts,tableFonts,continuation,position,actionContrast,spacing:{messages:style('.lourex-ai-messages').rowGap,document:style('.lxw-chat-document').rowGap},viewportOverflow:Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)-innerWidth};",
     "})().catch(e=>({error:String(e.stack||e)}))"
   ].join('').replaceAll('RTL',String(rtl));
   const response=await send('Runtime.evaluate',{expression:code,awaitPromise:true,returnByValue:true});
   const d=response.result?.value;
   assert.ok(d?.ok,'Visual fixture crashed at '+width+': '+JSON.stringify(d));
   console.log('VISUAL '+JSON.stringify(d));
   assert.equal(d.width,width);
   assert.equal(d.continuation.color,d.continuation.bodyColor,'Answer continuation must not be demoted to muted metadata');
   assert.equal(d.continuation.opacity,'1');
   assert.equal(d.continuation.size,'16px');
   assert.ok(d.readingFonts.every(f=>f.size===16&&f.line>=25), 'Inconsistent conversation type: '+JSON.stringify(d.readingFonts));
   assert.ok(d.tableFonts.every(size=>size===15),'Unreadable table type: '+JSON.stringify(d.tableFonts));
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
