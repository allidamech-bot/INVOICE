(() => {
  const EXPECTED_OWNER='allidamech-bot',EXPECTED_REPO='INVOICE';
  const PUBLIC_DB_NAME='lourex-invoice-public',ACCOUNT_DB_PREFIX='lourex-invoice-account-';
  const DIAG_LOG_KEY='lourex-runtime-diagnostics-v340',DIAG_META_KEY='lourex-runtime-diagnostics-meta-v340';
  const ACTIVE_SCOPE_META_KEY='lourex-active-storage-meta-v341',ACTIVE_VAULT_META_KEY='lourex-active-vault-meta-v341';
  const PROBE_TIMEOUT_MS=1800,HEALTH_DEADLINE_MS=8000;
  const MB=1024*1024;
  const rows=[]; const details=[];
  const runtime=window.__LOUREX_RUNTIME__||{};
  let finished=false;
  const add=(label,value,status='ok')=>{rows.push({label,value:String(value),status});details.push(`${label}=${String(value)}`);};
  const yesNo=value=>value?'OK':'Unavailable';
  const shortSha=value=>value?String(value).slice(0,12):'n/a';
  const formatMb=value=>`${Math.round((Number(value)||0)/MB*10)/10} MB`;
  const withTimeout=(promise,label,timeout=PROBE_TIMEOUT_MS)=>new Promise((resolve,reject)=>{
    let settled=false;
    const timer=setTimeout(()=>{if(settled)return;settled=true;reject(new Error(`${label} timed out`));},timeout);
    Promise.resolve(promise).then(value=>{if(settled)return;settled=true;clearTimeout(timer);resolve(value);},error=>{if(settled)return;settled=true;clearTimeout(timer);reject(error);});
  });
  const readJson=(key,fallback)=>{try{const value=JSON.parse(localStorage.getItem(key)||'null');return value??fallback;}catch{return fallback;}};
  const readDiagnostics=()=>{const value=readJson(DIAG_LOG_KEY,[]);return Array.isArray(value)?value:[];};
  const readDiagnosticMeta=()=>{const value=readJson(DIAG_META_KEY,null);return value&&typeof value==='object'?value:null;};
  const formatDiagnosticEvent=event=>{
    const at=String(event?.at||'n/a');
    const type=String(event?.type||'unknown');
    const screen=String(event?.screen||'unknown');
    const visibility=String(event?.visibility||'unknown');
    const online=event?.online===false?'offline':'online';
    const detail=String(event?.detail||'').trim();
    return `${at} | ${type} | screen=${screen} | ${visibility} | ${online}${detail?` | ${detail}`:''}`;
  };
  const diagnosticText=()=>{
    const log=readDiagnostics();
    const meta=readDiagnosticMeta();
    const header=[
      'LOUREX v341 runtime diagnostics',
      `events=${log.length}`,
      `currentMeta=${meta?JSON.stringify(meta):'none'}`,
      'privacy=Lifecycle metadata only. No invoice/customer/supplier contents are collected.',
      ''
    ];
    return [...header,...log.map(formatDiagnosticEvent)].join('\n');
  };
  const renderDiagnostics=()=>{
    const pre=document.getElementById('diagnosticLog');
    if(pre)pre.textContent=diagnosticText();
    const count=readDiagnostics().length;
    const badge=document.getElementById('diagnosticCount');
    if(badge)badge.textContent=`${count} event${count===1?'':'s'} stored on this device`;
  };
  const render=()=>{
    const grid=document.getElementById('grid');grid.innerHTML='';
    rows.forEach(row=>{const el=document.createElement('div');el.className='row';el.innerHTML=`<span class="label"></span><span class="value ${row.status}Text"></span>`;el.querySelector('.label').textContent=row.label;el.querySelector('.value').textContent=row.value;grid.appendChild(el);});
    const bad=rows.filter(row=>row.status==='bad').length,warn=rows.filter(row=>row.status==='warn').length;const dot=document.getElementById('summaryDot');dot.className=`dot ${bad?'bad':warn?'warn':'ok'}`;document.getElementById('summaryText').textContent=bad?`${bad} critical check(s) need attention / توجد مشكلة حرجة`:warn?`Core checks passed with ${warn} warning(s) / الفحص الأساسي سليم مع تنبيهات`:'All core checks passed / جميع الفحوص الأساسية سليمة';
    const diag=readDiagnostics();
    document.getElementById('report').textContent=['LOUREX Invoice system health',`time=${new Date().toISOString()}`,...details,`runtimeDiagnosticEvents=${diag.length}`,`userAgent=${navigator.userAgent}`].join('\n');
    renderDiagnostics();
  };
  function vaultSizeStatus(){
    const scope=readJson(ACTIVE_SCOPE_META_KEY,null);
    const vault=readJson(ACTIVE_VAULT_META_KEY,null);
    if(!scope||typeof scope!=='object'){
      add('Active encrypted vault','Awaiting active storage measurement','warn');
      return;
    }
    const scopeKind=scope.kind==='account'?'Account scope':'Public scope';
    if(!vault||typeof vault!=='object'||!vault.fingerprint||vault.fingerprint!==scope.fingerprint){
      add('Active encrypted vault',`${scopeKind}; size not measured yet`,'warn');
      return;
    }
    const cipherChars=Math.max(0,Number(vault.cipherChars)||0);
    const encryptedBytes=Math.max(0,Number(vault.encryptedBytes)||0);
    const label=`${scopeKind}: ${formatMb(cipherChars)} Base64 cipher (~${formatMb(encryptedBytes)} encrypted bytes)`;
    add('Active encrypted vault',label,cipherChars>64*MB?'warn':'ok');
    if(vault.measuredAt)add('Vault size measured',String(vault.measuredAt),'ok');
  }
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
      add('Runtime diagnostics',`${readDiagnostics().length} stored event(s)`,'ok');
      add('Service worker support',yesNo('serviceWorker' in navigator),'serviceWorker' in navigator?'ok':'bad');
      if('serviceWorker' in navigator){
        try{const reg=await withTimeout(navigator.serviceWorker.getRegistration(),'Service worker check');add('PWA worker',reg?(reg.waiting?'Update waiting':navigator.serviceWorker.controller?'Active':'Installed'):'Not registered',reg?'ok':'warn');}catch(error){add('PWA worker',error?.message||'Check failed','warn');}
      }
      if('caches' in window){try{const keys=await withTimeout(caches.keys(),'Cache storage check');const lourex=keys.filter(key=>key.startsWith('lourex-invoice-'));add('PWA cache',lourex.join(', ')||'None',lourex.length?'ok':'warn');}catch(error){add('Cache storage',error?.message||'Unavailable','warn');}}
      else add('Cache storage','Unavailable','warn');
      if(navigator.storage?.estimate){try{const estimate=await withTimeout(navigator.storage.estimate(),'Browser storage estimate');const used=Math.round((estimate.usage||0)/1024/1024*10)/10;const quota=Math.round((estimate.quota||0)/1024/1024);add('Browser storage',`${used} MB used / ${quota} MB quota`,quota?'ok':'warn');}catch(error){add('Browser storage',error?.message||'Estimate unavailable','warn');}}
      else add('Browser storage','Estimate unavailable','warn');
      vaultSizeStatus();
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
  document.getElementById('copyDiag')?.addEventListener('click',async()=>{const text=diagnosticText();try{await navigator.clipboard.writeText(text);document.getElementById('copyDiag').textContent='Copied / تم النسخ';}catch{}});
  document.getElementById('clearDiag')?.addEventListener('click',()=>{
    try{localStorage.removeItem(DIAG_LOG_KEY);localStorage.removeItem(DIAG_META_KEY);}catch{}
    renderDiagnostics();
    const button=document.getElementById('clearDiag');if(button)button.textContent='Cleared / تم المسح';
  });
  renderDiagnostics();
  void run().finally(()=>clearTimeout(deadline));
})();