// Real Chromium, compiled stylesheet, representative AI-tool modal DOM.
// No account, network APIs, external AI provider, business data or deployment.
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';

const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(fn,limit=25000){
  const end=Date.now()+limit;
  while(Date.now()<end){try{const value=await fn();if(value)return value;}catch{}await pause(200);}
  throw new Error('Timed out waiting for modal fixture or Chromium');
}
const binary=['google-chrome','google-chrome-stable','chromium','chromium-browser'].find(name=>{
  try{execFileSync(name,['--version'],{stdio:'ignore'});return true;}catch{return false;}
});
assert.ok(binary,'Chromium is required for final AI modal CSS test');
const fixture='__ai_modal_qa__.html';
const html=`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="/styles/app.bundle.css"><link rel="stylesheet" href="/ai-composer-v449.css">
<style>html,body,#root{margin:0;min-height:100%;width:100%;background:#080808}</style></head>
<body><div id="root"><div class="app-ui">
<div class="modal-backdrop" data-assistant-overlay="true">
<section class="modal modal-lg modal-assistant" dir="rtl" role="dialog" aria-modal="true" aria-labelledby="modal-title">
<header class="modal-header"><h2 id="modal-title">مراجعة عرض السعر بالذكاء الاصطناعي للعميل</h2><button class="icon-btn icon-btn-ghost" aria-label="إغلاق">×</button></header>
<div class="modal-body"><p>الملف المرفق يتضمن أصنافاً متعددة وأسعارًا وأسماء عملاء.</p>
<div class="product-import-table-wrap"><table class="product-import-table">
<thead><tr><th>الصنف</th><th>الكمية</th><th>السعر</th><th>التكلفة</th><th>الهامش</th><th>مراجعة</th></tr></thead>
<tbody><tr><td><strong>بسكويت بالشوكولاتة للتوريد والتصدير 60g x24</strong></td>
<td><bdi dir="ltr">15,000 CTN</bdi></td><td><bdi dir="ltr">2,340.50 USD</bdi></td>
<td><bdi dir="ltr">2,000 USD</bdi></td><td>14.5%</td><td>تحتاج مراجعة</td></tr></tbody></table></div>
<div class="ai-workflow-actions"><button class="btn btn-secondary">مراجعة الأسعار</button>
<button class="btn btn-primary">تأكيد وحفظ مسودة عرض السعر</button>
<button class="btn btn-danger">رفض</button></div><p role="alert">توجد بيانات ناقصة تحتاج مراجعة</p></div>
<footer class="modal-footer"><div class="modal-footer-actions"><button class="btn btn-secondary">إلغاء</button>
<button class="btn btn-primary">حفظ المسودة</button></div></footer>
</section></div></div></div></body></html>`;
const profile=await mkdtemp(join(tmpdir(),'lourex-modal-qa-'));
const workers=[];
let websocket;
try{
  await writeFile('dist/'+fixture,html);
  const server=spawn(process.execPath,['./node_modules/http-server/bin/http-server','dist','-p','4186','-a','127.0.0.1','-c-1'],{stdio:'ignore'});
  workers.push(server);
  await until(async()=>(await fetch('http://127.0.0.1:4186/'+fixture)).ok,12000);
  const chrome=spawn(binary,['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:'ignore'});
  workers.push(chrome);
  const port=await until(async()=>Number((await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]));
  const pages=await (await fetch('http://127.0.0.1:'+port+'/json/list')).json();
  websocket=new WebSocket(pages.find(row=>row.type==='page').webSocketDebuggerUrl);
  await new Promise((yes,no)=>{
    websocket.addEventListener('open',yes,{once:true});
    websocket.addEventListener('error',()=>no(Error('CDP WebSocket connection failed')),{once:true});
  });
  const pending=new Map();let serial=0;
  websocket.addEventListener('message',event=>{
    const msg=JSON.parse(String(event.data));const job=pending.get(msg.id);
    if(!job)return;pending.delete(msg.id);clearTimeout(job.timer);
    msg.error?job.reject(Error(msg.error.message)):job.resolve(msg.result||{});
  });
  const cmd=(method,params={})=>new Promise((resolve,reject)=>{
    const id=++serial,timer=setTimeout(()=>{pending.delete(id);reject(Error(method+' timed out'));},14000);
    pending.set(id,{resolve,reject,timer});
    websocket.send(JSON.stringify({id,method,params}));
  });
  await cmd('Page.enable');await cmd('Runtime.enable');
  for(const [width,height] of [[320,700],[390,844],[820,1180],[1440,900]]){
    await cmd('Emulation.setDeviceMetricsOverride',{width,height,mobile:width<=820,deviceScaleFactor:1});
    await cmd('Page.navigate',{url:'http://127.0.0.1:4186/'+fixture});
    await until(async()=>{
      const result=await cmd('Runtime.evaluate',{expression:'document.readyState',returnByValue:true});
      return result.result?.value==='complete';
    },10000);
    const expr=`(()=>{
      const one=s=>document.querySelector(s),cs=s=>getComputedStyle(one(s)),bounds=e=>e.getBoundingClientRect();
      const modal=one('.modal-assistant'),wrap=one('.product-import-table-wrap'),table=one('.product-import-table');
      const buttons=Array.from(document.querySelectorAll('.modal-assistant .btn'));
      const primary=cs('.modal-assistant .btn-primary'),secondary=cs('.modal-assistant .btn-secondary'),danger=cs('.modal-assistant .btn-danger');
      const main=bounds(modal),data={
        width:innerWidth,background:cs('.modal-assistant').backgroundColor,colors:{
          primary:primary.backgroundColor,secondary:secondary.backgroundColor,danger:danger.backgroundColor
        },
        tapTargets:buttons.map(b=>({label:b.textContent.trim(),height:Math.round(bounds(b).height)})),
        horizontalPageOverflow:document.documentElement.scrollWidth-innerWidth,
        modalOverflow:modal.scrollWidth-modal.clientWidth,
        tableWrapOverflow:wrap.scrollWidth-wrap.clientWidth,
        tableScroll:table.scrollWidth>wrap.clientWidth+10,
        modalWidth:Math.round(main.width),
        titleFont:parseFloat(cs('.modal-header h2').fontSize),
        headerText:one('.modal-header h2').innerText
      };
      return data;
    })()`;
    const x=await cmd('Runtime.evaluate',{expression:expr,returnByValue:true});
    const val=x.result?.value;
    assert.ok(val,'Chromium did not return modal measurements');
    console.log('AI_MODALS '+JSON.stringify(val));
    assert.equal(val.width,width,'real CSS viewport mismatch');
    assert.notEqual(val.colors.primary,val.colors.secondary,'Save action needs its own visual status');
    assert.notEqual(val.colors.primary,val.colors.danger,'Save and reject must use distinct backgrounds');
    assert.ok(val.tapTargets.every(t=>t.height>=43),'Touch targets shorter than 44px: '+JSON.stringify(val.tapTargets));
    assert.ok(val.horizontalPageOverflow<=3,'Page overflows horizontally: '+JSON.stringify(val));
    assert.ok(val.modalOverflow<=3,'Modal overflows horizontally: '+JSON.stringify(val));
    assert.ok(val.titleFont>=15,'Modal heading is too small');
    if(width===320)assert.ok(val.tableWrapOverflow>30&&val.tableScroll,'Dense table should scroll only within its table wrapper on phone');
  }
}finally{
  websocket?.close();
  for(const worker of workers.reverse())if(worker.exitCode===null)worker.kill('SIGTERM');
  await pause(450);
  await rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:250});
  await rm('dist/'+fixture,{force:true});
}
