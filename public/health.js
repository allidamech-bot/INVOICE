(() => {
  const EXPECTED_OWNER='allidamech-bot',EXPECTED_REPO='INVOICE';
  const PUBLIC_DB_NAME='lourex-invoice-public',ACCOUNT_DB_PREFIX='lourex-invoice-account-';
  const PROBE_TIMEOUT_MS=1800,HEALTH_DEADLINE_MS=8000;
  const rows=[]; const details=[];
  const runtime=window.__LOUREX_RUNTIME__||{};
  let finished=false;
  const add=(label,value,status='ok')=>{rows.push({label,value:String(value),status});details.push(`${label}=${String(value)}`);};
  const yesNo=value=>value?'OK':'Unavailable';
  const shortSha=value=>value?String(value).slice(0,12):'n/a';
  const withTimeout=(promise,label,timeout=PROBE_TIMEOUT_MS)=>new Promise((resolve,reject)=>{
    let settled=false;
    const timer=setTimeout(()=>{if(settled)return;settled=true;reject(new Error(`${label} timed out`));},timeout);
    Promise.resolve(promise).then(value=>{if(settled)return;settled=true;clearTimeout(timer);resolve(value);},error=>{if(settled)return;settled=true;clearTimeout(timer);reject(error);});
  });
  const render=()=>{
    const grid=document.getElementById('grid');grid.innerHTML='';
    rows.forEach(row=>{const el=document.createElement('div');el.className='row';el.innerHTML=`<span class="label"></span><span class="value ${row.status}Text"></span>`;el.querySelector('.label').textContent=row.label;el.querySelector('.value').textContent=row.value;grid.appendChild(el);});
    const bad=rows.filter(row=>row.status==='bad').length,warn=rows.filter(row=>row.status==='warn').length;const dot=document.getElementById('summaryDot');dot.className=`dot ${bad?'bad':warn?'warn':'ok'}`;document.getElementById('summaryText').textContent=bad?`${bad} critical check(s) need attention / توجد مشكلة حرجة`:warn?`Core checks passed with ${warn} warning(s) / الفحص الأساسي سليم مع تنبيهات`:'All core checks passed / جميع الفحوص الأساسية سليمة';
    document.getElementById('report').textContent=['LOUREX Invoice system health',`time=${new Date().toISOString()}`,...details,`userAgent=${navigator.userAgent}`].join('\n');
  };
  async function dbStatus(){
    if(!('indexedDB' in window)){add('IndexedDB','Unavailable','bad');return;}
    if(typeof indexedDB.databases!=='function'){add('IndexedDB','Available (scoped database enumeration unsupported here)','warn');return;}
    try{
      const dbs=await withTimeout(indexedDB.databases(),'IndexedDB enumeration');
      const names=Array.isArray(dbs)?dbs.map(db=>String(db?.name||'')):[];
      const publicPresent=names.includes(PUBLIC_DB_NAME);
      const accountCount=names.filter(name=>name.startsWith(ACCOUNT_DB_PREFIX)).length;
      const scopedCount=(publicPresent?1:0)+accountCount;
      if(!scopedCount){add('Encrypted local storage','Not created on this device','warn');return;}
      const summary=accountCount?`${accountCount} account scope${accountCount===1?'':'s'}${publicPresent?' + public scope':''}`:'Public scope present';
      add('Encrypted local storage',summary,'ok');
    }catch(error){add('IndexedDB check',error?.message||'Timed out or unavailable','warn');}
  }
  async function run(){
    try{
      const source=`${runtime.sourceRepoOwner||'unknown'}/${runtime.sourceRepoSlug||'unknown'}`;
      const sourceOk=String(runtime.sourceRepoOwner||'').toLowerCase()===EXPECTED_OWNER.toLowerCase()&&String(runtime.sourceRepoSlug||'').toLowerCase()===EXPECTED_REPO.toLowerCase();
      add('Environment',runtime.environment||'unknown',runtime.environment?'ok':'warn');
      add('Deployment source',source,sourceOk?'ok':'bad');
      add('Commit',shortSha(runtime.commitSha),runtime.commitSha?'ok':'warn');
      add('Build time',runtime.buildTime||'n/a',runtime.buildTime?'ok':'warn');
      add('Secure context',yesNo(window.isSecureContext),window.isSecureContext?'ok':'bad');
      add('Network',navigator.onLine?'Online':'Offline',navigator.onLine?'ok':'warn');
      add('Service worker support',yesNo('serviceWorker' in navigator),'serviceWorker' in navigator?'ok':'bad');
      if('serviceWorker' in navigator){
        try{const reg=await withTimeout(navigator.serviceWorker.getRegistration(),'Service worker check');add('PWA worker',reg?(reg.waiting?'Update waiting':navigator.serviceWorker.controller?'Active':'Installed'):'Not registered',reg?'ok':'warn');}catch(error){add('PWA worker',error?.message||'Check failed','warn');}
      }
      if('caches' in window){try{const keys=await withTimeout(caches.keys(),'Cache storage check');const lourex=keys.filter(key=>key.startsWith('lourex-invoice-'));add('PWA cache',lourex.join(', ')||'None',lourex.length?'ok':'warn');}catch(error){add('Cache storage',error?.message||'Unavailable','warn');}}
      else add('Cache storage','Unavailable','warn');
      if(navigator.storage?.estimate){try{const estimate=await withTimeout(navigator.storage.estimate(),'Browser storage estimate');const used=Math.round((estimate.usage||0)/1024/1024*10)/10;const quota=Math.round((estimate.quota||0)/1024/1024);add('Browser storage',`${used} MB used / ${quota} MB quota`,quota?'ok':'warn');}catch(error){add('Browser storage',error?.message||'Estimate unavailable','warn');}}
      else add('Browser storage','Estimate unavailable','warn');
      await dbStatus();
    }catch(error){add('Health runner',error?.message||'Unexpected diagnostic failure','warn');}
    finally{finished=true;render();}
  }
  const deadline=setTimeout(()=>{
    if(finished)return;
    add('Health runner','Diagnostic deadline reached','warn');
    render();
  },HEALTH_DEADLINE_MS);
  document.getElementById('back').addEventListener('click',()=>{if(history.length>1)history.back();else location.href='./';});
  document.getElementById('copy').addEventListener('click',async()=>{const text=document.getElementById('report').textContent||'';try{await navigator.clipboard.writeText(text);document.getElementById('copy').textContent='Copied / تم النسخ';}catch{}});
  void run().finally(()=>clearTimeout(deadline));
})();
