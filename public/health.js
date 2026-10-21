(() => {
  // Fail closed: never read runtime logs or run diagnostics until the server
  // verifies this Firebase user matches the single owner UID in Vercel.
  async function ownerPermission(){
    try{
      const fb=window.firebase;
      if(!fb||typeof fb.auth!=='function')return false;
      if(!fb.apps.length)fb.initializeApp({
        apiKey:'AIzaSyAgakNDqcKlyAFiOyfm1ebA8PB-_HKM-go',
        authDomain:'lourex-invoice.firebaseapp.com',projectId:'lourex-invoice'
      });
      const user=await new Promise(resolve=>{
        let off=()=>{},settled=false;
        const settle=value=>{if(settled)return;settled=true;clearTimeout(timer);off();resolve(value);};
        const timer=setTimeout(()=>settle(null),6500);
        off=fb.auth().onAuthStateChanged(settle,()=>settle(null));
      });
      if(!user||typeof user.getIdToken!=='function')return false;
      const token=await user.getIdToken();
      const response=await fetch('/api/ai-core',{
        method:'POST',cache:'no-store',
        headers:{'Authorization':'Bearer '+token,'X-Requested-With':'LOUREX-Invoice','X-Lourex-Admin-Diagnostics':'access-check'},
        signal:AbortSignal.timeout(7000)
      });
      return response.ok&&(await response.json())?.allowed===true;
    }catch{return false;}
  }
  void (async()=>{
    if(!await ownerPermission()){
      const gate=document.getElementById('ownerGate');
      if(gate)gate.textContent='Administrator-only diagnostics. Return to LOUREX. / التشخيص متاح للمسؤول المصرّح له فقط.';
      return;
    }
    document.getElementById('ownerGate')?.remove();
    const main=document.querySelector('main');
    if(main)main.hidden=false;

  // Health has the same strict script-src CSP as the workspace. Apply persisted
  // presentation preference from this external script, never inline HTML.
  function applyDiagnosticTheme(){
    let preference='system';
    try{
      const saved=localStorage.getItem('lourex-ui-theme');
      if(saved==='light'||saved==='dark'||saved==='system')preference=saved;
    }catch{}
    let selected=preference;
    if(selected==='system'){
      try{selected=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}
      catch{selected='dark';}
    }
    document.documentElement.dataset.uiTheme=selected;
    document.documentElement.style.colorScheme=selected;
    const meta=document.querySelector('meta[name="theme-color"]');
    if(meta)meta.setAttribute('content',selected==='dark'?'#0D0D0D':'#f4f7fb');
  }
  applyDiagnosticTheme();

  const EXPECTED_OWNER='allidamech-bot',EXPECTED_REPO='INVOICE';
  const PUBLIC_DB_NAME='lourex-invoice-public',ACCOUNT_DB_PREFIX='lourex-invoice-account-';
  const DIAG_LOG_KEY='lourex-runtime-diagnostics-v340',DIAG_META_KEY='lourex-runtime-diagnostics-meta-v340',DIAG_SNAPSHOT_KEY='lourex-runtime-diagnostics-snapshot-v344';
  const ACTIVE_SCOPE_META_KEY='lourex-active-storage-meta-v341',ACTIVE_VAULT_META_KEY='lourex-active-vault-meta-v341';
  const VAULT_BREAKDOWN_KEY='lourex-vault-payload-breakdown-v342';
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
  const readDiagnosticSnapshot=()=>{const value=readJson(DIAG_SNAPSHOT_KEY,null);return value&&typeof value==='object'?value:null;};
  const repeatOf=event=>Math.max(1,Number(event?.repeat)||1);
  const diagnosticCounts=()=>{
    const counts={};
    for(const event of readDiagnostics())counts[event?.type||'unknown']=(counts[event?.type||'unknown']||0)+repeatOf(event);
    return counts;
  };
  const formatDiagnosticEvent=event=>{
    const at=String(event?.at||'n/a');
    const type=String(event?.type||'unknown');
    const screen=String(event?.screen||'unknown');
    const visibility=String(event?.visibility||'unknown');
    const online=event?.online===false?'offline':'online';
    const repeat=repeatOf(event);
    const detail=String(event?.detail||'').trim();
    return `${at} | ${type} | screen=${screen} | ${visibility} | ${online}${repeat>1?` | repeat=${repeat}`:''}${detail?` | ${detail}`:''}`;
  };
  const diagnosticText=()=>{
    const log=readDiagnostics(),meta=readDiagnosticMeta(),snapshot=readDiagnosticSnapshot(),counts=diagnosticCounts();
    const header=[
      'LOUREX v344 unified runtime diagnostics',
      `events=${log.length}`,
      `counts=${JSON.stringify(counts)}`,
      `currentMeta=${meta?JSON.stringify(meta):'none'}`,
      `snapshot=${snapshot?JSON.stringify(snapshot):'none'}`,
      'privacy=Runtime/lifecycle metadata only. No invoice/customer/supplier content, passwords, PINs, amounts, attachment contents or decrypted business fields are collected.',
      ''
    ];
    return [...header,...log.map(formatDiagnosticEvent)].join('\n');
  };
  const systemReportText=()=>['LOUREX Invoice system health',`time=${new Date().toISOString()}`,...details,`runtimeDiagnosticEvents=${readDiagnostics().length}`,`userAgent=${navigator.userAgent}`].join('\n');
  const fullReportText=()=>`${systemReportText()}\n\n${diagnosticText()}`;
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
    document.getElementById('report').textContent=systemReportText();
    renderDiagnostics();
  };
  function diagnosticStatus(){
    const log=readDiagnostics(),counts=diagnosticCounts(),snapshot=readDiagnosticSnapshot(),meta=readDiagnosticMeta();
    const js=(counts['javascript-error']||0)+(counts['react-error-boundary']||0);
    const promises=counts['unhandled-rejection']||0;
    const resources=counts['resource-error']||0;
    const nav=counts['navigation-request']||0;
    const authErrors=counts['auth-recovery-error']||0;
    const errorTotal=js+promises+resources+authErrors;
    add('Unified diagnostics',`v344; ${log.length} stored event(s); ${errorTotal} error signal(s)`,errorTotal?'warn':'ok');
    add('Diagnostic error signals',`javascript/react=${js}; promise=${promises}; resource=${resources}; auth=${authErrors}`,errorTotal?'warn':'ok');
    add('Intentional navigation markers',`${nav} navigation request(s) recorded`,'ok');
    if(snapshot){
      const root=snapshot.root&&typeof snapshot.root==='object'?snapshot.root:{};
      add('Last runtime snapshot',`screen=${snapshot.screen||'unknown'}; nav=${snapshot.nav||'unknown'}; visible=${snapshot.visibility||'unknown'}; editor=${root.editor?'yes':'no'}; dirty=${root.dirty?'yes':'no'}`,'ok');
    }else add('Last runtime snapshot','Not recorded yet — open LOUREX once, then return here','warn');
    if(meta?.lastSeen)add('Last runtime heartbeat',`${meta.lastSeen}; screen=${meta.lastScreen||'unknown'}; event=${meta.lastEvent||'unknown'}`,'ok');
  }
  function vaultSizeStatus(){
    const scope=readJson(ACTIVE_SCOPE_META_KEY,null);
    const vault=readJson(ACTIVE_VAULT_META_KEY,null);
    if(!scope||typeof scope!=='object'){
      add('Historical encrypted cache','No legacy cache measurement available. The current Firebase V2 workspace is separate.','ok');
      return;
    }
    const scopeKind=scope.kind==='account'?'Account scope':'Public scope';
    if(!vault||typeof vault!=='object'||!vault.fingerprint||vault.fingerprint!==scope.fingerprint){
      add('Historical encrypted cache',`${scopeKind}; no legacy cache measurement`,'ok');
      return;
    }
    const cipherChars=Math.max(0,Number(vault.cipherChars)||0);
    const encryptedBytes=Math.max(0,Number(vault.encryptedBytes)||0);
    const label=`${scopeKind}: ${formatMb(cipherChars)} Base64 cipher (~${formatMb(encryptedBytes)} encrypted bytes)`;
    add('Historical encrypted cache',label,cipherChars>64*MB?'warn':'ok');
    if(vault.measuredAt)add('Historical cache size measured',String(vault.measuredAt),'ok');
  }
  function vaultBreakdownStatus(){
    const scope=readJson(ACTIVE_SCOPE_META_KEY,null);
    const breakdown=readJson(VAULT_BREAKDOWN_KEY,null);
    if(!breakdown||typeof breakdown!=='object'){
      add('Historical cache breakdown','Not available; no legacy account unlock is required.','ok');
      return;
    }
    if(scope&&scope.fingerprint&&breakdown.fingerprint&&scope.fingerprint!==breakdown.fingerprint){
      add('Historical cache breakdown','Stored measurement belongs to a different local account scope','warn');
      return;
    }
    const strings=breakdown.strings&&typeof breakdown.strings==='object'?breakdown.strings:{};
    const current=breakdown.currentAttachments&&typeof breakdown.currentAttachments==='object'?breakdown.currentAttachments:{};
    const revisions=breakdown.revisionAttachments&&typeof breakdown.revisionAttachments==='object'?breakdown.revisionAttachments:{};
    const assets=breakdown.assets&&typeof breakdown.assets==='object'?breakdown.assets:{};
    const collections=breakdown.collections&&typeof breakdown.collections==='object'?breakdown.collections:{};
    const dataUrlChars=Math.max(0,Number(strings.dataUrlChars)||0);
    const dataUrlApproxBytes=Math.max(0,Number(strings.dataUrlApproxBytes)||0);
    const totalStringChars=Math.max(0,Number(strings.totalStringChars)||0);
    const nonDataStringChars=Math.max(0,Number(strings.nonDataStringChars)||0);
    const dataUrlCount=Math.max(0,Number(strings.dataUrlCount)||0);
    add('Vault embedded payload',`${dataUrlCount} data URL(s); ${formatMb(dataUrlChars)} Base64 characters (~${formatMb(dataUrlApproxBytes)} decoded binary)`,dataUrlChars>24*MB?'warn':'ok');
    add('Vault non-binary strings',`${formatMb(nonDataStringChars)} character-equivalent; ${formatMb(totalStringChars)} total string characters`,nonDataStringChars>12*MB?'warn':'ok');
    const currentCount=Math.max(0,Number(current.count)||0),currentDeclared=Math.max(0,Number(current.declaredBytes)||0),currentChars=Math.max(0,Number(current.dataUrlChars)||0),currentLargest=Math.max(0,Number(current.largestDeclaredBytes)||0);
    add('Current document attachments',`${currentCount} file(s); ${formatMb(currentDeclared)} declared; ${formatMb(currentChars)} Base64; largest ${formatMb(currentLargest)}`,currentChars>8*MB?'warn':'ok');
    const revisionCount=Math.max(0,Number(revisions.count)||0),revisionDeclared=Math.max(0,Number(revisions.declaredBytes)||0),revisionChars=Math.max(0,Number(revisions.dataUrlChars)||0);
    add('Revision attachment payloads',`${revisionCount} historical file payload(s); ${formatMb(revisionDeclared)} declared; ${formatMb(revisionChars)} Base64`,revisionChars>4*MB?'warn':'ok');
    const currentCompany=Math.max(0,Number(assets.currentCompanyDataUrlChars)||0),documentSnapshots=Math.max(0,Number(assets.documentSnapshotDataUrlChars)||0),revisionSnapshots=Math.max(0,Number(assets.revisionSnapshotDataUrlChars)||0);
    const repeatedAssets=documentSnapshots+revisionSnapshots;
    add('Company asset payloads',`current=${formatMb(currentCompany)}; document snapshots=${formatMb(documentSnapshots)}; revision snapshots=${formatMb(revisionSnapshots)}`,repeatedAssets>8*MB?'warn':'ok');
    add('Vault collections',`documents=${Number(collections.documents)||0}; revisions=${Number(collections.revisions)||0}; customers=${Number(collections.customers)||0}; suppliers=${Number(collections.suppliers)||0}; purchases=${Number(collections.purchases)||0}; savedItems=${Number(collections.savedItems)||0}`,'ok');
    if(breakdown.measuredAt)add('Payload breakdown measured',String(breakdown.measuredAt),'ok');
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
      diagnosticStatus();
      add('Service worker support',yesNo('serviceWorker' in navigator),'serviceWorker' in navigator?'ok':'bad');
      if('serviceWorker' in navigator){
        try{const reg=await withTimeout(navigator.serviceWorker.getRegistration(),'Service worker check');add('PWA worker',reg?(reg.waiting?'Update waiting':navigator.serviceWorker.controller?'Active':'Installed'):'Not registered',reg?'ok':'warn');}catch(error){add('PWA worker',error?.message||'Check failed','warn');}
      }
      if('caches' in window){try{const keys=await withTimeout(caches.keys(),'Cache storage check');const lourex=keys.filter(key=>key.startsWith('lourex-invoice-'));add('PWA cache',lourex.join(', ')||'None',lourex.length?'ok':'warn');}catch(error){add('Cache storage',error?.message||'Unavailable','warn');}}
      else add('Cache storage','Unavailable','warn');
      if(navigator.storage?.estimate){try{const estimate=await withTimeout(navigator.storage.estimate(),'Browser storage estimate');const used=Math.round((estimate.usage||0)/1024/1024*10)/10;const quota=Math.round((estimate.quota||0)/1024/1024);add('Browser storage',`${used} MB used / ${quota} MB quota`,quota?'ok':'warn');}catch(error){add('Browser storage',error?.message||'Estimate unavailable','warn');}}
      else add('Browser storage','Estimate unavailable','warn');
      vaultSizeStatus();
      vaultBreakdownStatus();
      await dbStatus();
    }catch(error){add('Health runner',error?.message||'Unexpected diagnostic failure','warn');}
    finally{finished=true;render();}
  }
  const deadline=setTimeout(()=>{
    if(finished)return;
    add('Health runner','Diagnostic deadline reached','warn');
    render();
  },HEALTH_DEADLINE_MS);
  const providerButtons=[...document.querySelectorAll('[data-provider-test]')];
  const accuracyButtons=[...document.querySelectorAll('[data-provider-accuracy]')];
  const keyButtons=[...document.querySelectorAll('[data-provider-key-check]')];
  const allProbeButtons=[...providerButtons,...accuracyButtons,...keyButtons];
  const safeProviders=new Set(['groq','cloudflare','gemini','kilo','openrouter','mistral','ollama']);
  let probeRunning=false;
  const probeLabels={
    PASSED:'Correct answer / إجابة صحيحة',
    WRONG_ANSWER:'Connected, incorrect answer / متصل لكن الإجابة خاطئة',
    NOT_CONFIGURED:'No key configured / المفتاح غير مهيأ',
    FREE_TIER_NOT_VERIFIED:'Free allowance unverified — no request sent / لم تُؤكّد مجانية الخطة، لم يُرسل طلب',
    KEY_REJECTED:'API key rejected / المفتاح مرفوض',
    PAYMENT_REQUIRED:'Payment required / يتطلب رصيدًا مدفوعًا',
    RATE_LIMITED:'Provider rate limit / حدّ الاستخدام لدى الشركة',
    MODEL_UNAVAILABLE:'Model unavailable / النموذج غير متاح',
    PROVIDER_UNAVAILABLE:'Service unavailable / الخدمة غير متاحة',
    PROVIDER_ERROR:'Provider error / خطأ من المزوّد',
    INVALID_RESPONSE:'Empty or malformed provider response / استجابة فارغة أو غير صالحة',
    ANSWER_FORMAT:'Answer format cannot be graded / تنسيق الإجابة غير قابل للتقييم',
    OUTPUT_TRUNCATED:'Model response cut off / الإجابة مقطوعة بسبب حد الرموز',
    OUTPUT_BLOCKED:'Provider blocked model output / المزوّد منع إخراج الإجابة',
    TIMEOUT:'Timed out / انتهت المهلة',
    NETWORK_ERROR:'Network error / خطأ اتصال'
  };
  const reasonLabels={
    EMPTY_CONTENT:'No text returned / لم يُرجع نصًا',
    TRUNCATED_CONTENT:'Incomplete answer rejected / رُفضت إجابة غير مكتملة',
    UPSTREAM_NON_JSON:'Non-JSON provider response / رد غير متوافق',
    RESPONSE_TOO_LARGE:'Response exceeds safe size / الرد أكبر من الحد الآمن',
    OVERLONG_ANSWER:'Verbose answer / إجابة مطوّلة',
    NO_NUMERIC_ANSWER:'No numeric result / لا توجد نتيجة رقمية',
    MULTIPLE_NUMBERS:'Multiple numbers in response / عدة أرقام في الإجابة',
    OUTPUT_BLOCKED:'Safety/content restriction / قيود الأمان أو المحتوى',
    UPSTREAM_ERROR_BODY:'Provider returned an error envelope / المزوّد أعاد رسالة خطأ'
  };
  for(const button of providerButtons)button.addEventListener('click',async()=>{
    const provider=button.getAttribute('data-provider-test');
    if(probeRunning||!safeProviders.has(provider))return;
    probeRunning=true;
    allProbeButtons.forEach(item=>item.disabled=true);
    const result=document.querySelector('[data-provider-result="'+provider+'"]');
    if(result)result.textContent='Testing… / جارٍ الاختبار…';
    try{
      const user=window.firebase?.auth()?.currentUser;
      if(!user)throw new Error('SIGN_IN_REQUIRED');
      const token=await user.getIdToken();
      const response=await fetch('/api/ai-core',{
        method:'POST',cache:'no-store',
        headers:{Authorization:'Bearer '+token,'X-Requested-With':'LOUREX-Invoice','X-Lourex-Admin-Diagnostics':'provider-probe','Content-Type':'application/json'},
        body:JSON.stringify({provider}),signal:AbortSignal.timeout(18000)
      });
      const data=await response.json();
      if(!response.ok){
        if(result)result.textContent=response.status===403?'Access denied / الوصول مرفوض':
          response.status===429&&data?.code==='DIAGNOSTIC_RATE_LIMITED'?('LOUREX test limit for '+provider+' only. Try again in '+Math.ceil(Math.max(1,Number(data.retryAfterSeconds)||1)/60)+' min / حدّ اختبارات لوريكس لهذا المزوّد فقط، انتظر ثم حاول مجددًا'):'Test unavailable / تعذر الاختبار';
      }else if(result){
        const label=probeLabels[data?.status]||'Test failed / فشل الاختبار';
        const latency=Number.isFinite(data?.latencyMs)?' · '+Math.round(data.latencyMs)+' ms':'';
        const model=typeof data?.model==='string'?data.model.slice(0,80):'';
        const reported=Number.isFinite(data?.reportedTotal)?' · Returned: '+data.reportedTotal+' / الناتج: '+data.reportedTotal:'';
        const reason=reasonLabels[data?.reason]?' · '+reasonLabels[data.reason]:'';
        const finish=data?.finishReason==='LENGTH'||data?.finishReason==='MAX_TOKENS'?' · Token limit reached / انتهى حد الرموز':'';
        // The server only exposes a short character-filtered preview of a synthetic reply.
        const preview=typeof data?.answerPreview==='string'&&data.answerPreview.length<=110?' · '+data.answerPreview:'';
        const actual=typeof data?.actualModel==='string'&&data.actualModel.length<=110&&data.actualModel!==model?
          ' · Routed model / النموذج المستخدم: '+data.actualModel:'';
        // textContent, never HTML: no provider-supplied executable markup.
        result.textContent=label+reported+reason+finish+preview+
          (model?'\nModel: '+model:'')+
          (actual?'\n'+actual.replace(/^ · /,''):'')+
          (latency?'\nResponse time / زمن الاستجابة: '+Math.round(data.latencyMs)+' ms':'');
      }
    }catch{
      if(result)result.textContent='Connection/authentication failed / تعذر الاتصال أو التحقق';
    }finally{probeRunning=false;allProbeButtons.forEach(item=>item.disabled=false);}
  });
  // Metadata-only checks for unverified vendors. No prompts, inference or payment.
  for(const button of keyButtons)button.addEventListener('click',async()=>{
    const provider=button.getAttribute('data-provider-key-check');
    if(probeRunning||!['mistral','ollama'].includes(provider))return;
    probeRunning=true;allProbeButtons.forEach(item=>item.disabled=true);
    const result=document.querySelector('[data-provider-key-result="'+provider+'"]');
    if(result)result.textContent='Checking key only… / جارٍ فحص المفتاح فقط…';
    try{
      const user=window.firebase?.auth()?.currentUser;
      if(!user)throw new Error('SIGN_IN_REQUIRED');
      const token=await user.getIdToken();
      const response=await fetch('/api/ai-core',{
        method:'POST',cache:'no-store',
        headers:{Authorization:'Bearer '+token,'X-Requested-With':'LOUREX-Invoice','X-Lourex-Admin-Diagnostics':'provider-probe','Content-Type':'application/json'},
        body:JSON.stringify({provider,mode:'key-check'}),signal:AbortSignal.timeout(15000)
      });
      const data=await response.json();
      if(result){
        if(!response.ok)result.textContent=response.status===403?'Owner access required / يلزم حساب المالك':response.status===429?'Diagnostic limit reached / انتهى حد الفحص':'Key check unavailable / تعذر فحص المفتاح';
        else{
          const labels={
            KEY_AUTHENTICATED:'Key authenticated — free allowance NOT verified / المفتاح صالح، مجانية الخطة غير مؤكدة',
            KEY_REJECTED:'Key rejected / المفتاح مرفوض',
            NOT_CONFIGURED:'Key missing / المفتاح غير موجود',
            RATE_LIMITED:'Provider limit reached / حدّ استخدام المزوّد',
            TIMEOUT:'Connection timed out / انتهت مهلة الاتصال',
            NETWORK_ERROR:'Connection failed / تعذر الاتصال',
            PROVIDER_UNAVAILABLE:'Provider unavailable / المزوّد غير متاح'
          };
          result.textContent=(labels[data?.status]||'Key status inconclusive / نتيجة فحص المفتاح غير حاسمة')+
            ' · No AI request sent / دون طلب توليد';
        }
      }
    }catch{
      if(result)result.textContent='Connection/authentication failed / تعذر الاتصال أو التحقق';
    }finally{probeRunning=false;allProbeButtons.forEach(item=>item.disabled=false);}
  });
  const qaCaseLabels={
    D1:'Discount + tax / خصم وضريبة',
    D2:'Partial receipts / دفعات جزئية',
    D3:'Fixed FX / تحويل عملة',
    D4:'Credit note / إشعار دائن',
    D5:'Tax-inclusive net / صافي قبل الضريبة'
  };
  for(const button of accuracyButtons)button.addEventListener('click',async()=>{
    const provider=button.getAttribute('data-provider-accuracy');
    const alternativeModel=button.getAttribute('data-diagnostic-model');
    if(probeRunning||!safeProviders.has(provider))return;
    // The alternative is intentionally limited to ONE owner-clicked synthetic suite.
    if(alternativeModel!==null&&(provider!=='ollama'||alternativeModel!=='gpt-oss:20b'))return;
    probeRunning=true;
    allProbeButtons.forEach(item=>item.disabled=true);
    const result=document.querySelector(alternativeModel!==null?'[data-ollama-alt-result]':'[data-accuracy-result="'+provider+'"]');
    if(result)result.textContent='Five-case financial QA running… / جارٍ اختبار خمس مسائل مالية وهمية…';
    try{
      const user=window.firebase?.auth()?.currentUser;
      if(!user)throw new Error('SIGN_IN_REQUIRED');
      const token=await user.getIdToken();
      const response=await fetch('/api/ai-core',{
        method:'POST',cache:'no-store',
        headers:{Authorization:'Bearer '+token,'X-Requested-With':'LOUREX-Invoice',
          'X-Lourex-Admin-Diagnostics':'provider-probe','Content-Type':'application/json'},
        body:JSON.stringify(alternativeModel!==null?{provider,mode:'financial',model:alternativeModel}:{provider,mode:'financial'}),signal:AbortSignal.timeout(18000)
      });
      const data=await response.json();
      if(!result)return;
      if(!response.ok){
        result.textContent=response.status===403?'Access denied / الوصول مرفوض':
          response.status===429&&data?.code==='DIAGNOSTIC_RATE_LIMITED'?
          ('LOUREX test cap for '+provider+' only. Retry in '+Math.ceil(Math.max(1,Number(data.retryAfterSeconds)||1)/60)+' min / تجاوز حدّ لوريكس لهذا المزوّد فقط'):
          'Test unavailable / تعذر الاختبار';
        return;
      }
      const model=typeof data?.actualModel==='string'&&data.actualModel.length<=110?
        ' · Model: '+data.actualModel:typeof data?.model==='string'?' · '+data.model.slice(0,80):'';
      const latency=Number.isFinite(data?.latencyMs)?' · '+Math.round(data.latencyMs)+' ms':'';
      if(Array.isArray(data?.cases)&&data.cases.length===5&&Number.isInteger(data.score)&&data.score>=0&&data.score<=5){
        const details=data.cases.map(item=>{
          if(!qaCaseLabels[item?.id]||!Number.isFinite(item.reported)||!Number.isFinite(item.expected))return '';
          return item.id+' '+(item.correct===true?'✓':'✗')+
            ' ['+Number(item.reported).toFixed(2)+' / '+Number(item.expected).toFixed(2)+'] · '+qaCaseLabels[item.id];
        }).filter(Boolean);
        result.textContent='Synthetic accuracy / دقة وهمية: '+data.score+'/5'+
          (data.score===5?' ✓':' — Review required / تحتاج مراجعة')+
          (model?'\n'+model.replace(/^ · /,''):'')+
          (latency?'\nResponse time: '+Math.round(data.latencyMs)+' ms':'')+
          (details.length?'\n'+details.join('\n'):'')+
          '\nNot a production accounting certification / ليس اعتمادًا محاسبيًا';
      }else{
        const reason=reasonLabels[data?.reason]?' · '+reasonLabels[data.reason]:'';
        result.textContent=(probeLabels[data?.status]||'QA not gradeable / تعذر تقييم الاختبار')+reason+model+latency;
      }
    }catch{
      if(result)result.textContent='Connection/authentication failed / تعذر الاتصال أو التحقق';
    }finally{
      probeRunning=false;
      allProbeButtons.forEach(item=>item.disabled=false);
    }
  });
  document.getElementById('back').addEventListener('click',()=>{if(history.length>1)history.back();else location.href='./';});
  document.getElementById('copy').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(fullReportText());document.getElementById('copy').textContent='Copied full report / تم النسخ';}catch{}});
  document.getElementById('copyDiag')?.addEventListener('click',async()=>{const text=diagnosticText();try{await navigator.clipboard.writeText(text);document.getElementById('copyDiag').textContent='Copied / تم النسخ';}catch{}});
  document.getElementById('clearDiag')?.addEventListener('click',()=>{
    try{localStorage.removeItem(DIAG_LOG_KEY);localStorage.removeItem(DIAG_META_KEY);localStorage.removeItem(DIAG_SNAPSHOT_KEY);}catch{}
    renderDiagnostics();
    const button=document.getElementById('clearDiag');if(button)button.textContent='Cleared / تم المسح';
  });
  renderDiagnostics();
  void run().finally(()=>clearTimeout(deadline));

  })();
})();
