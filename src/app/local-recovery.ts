import { getSafetySnapshot, swapSafetySnapshotIntoCurrent } from '../storage/db.js';
import { decryptVault, verifyPin } from '../crypto/crypto.js';
import { currentCloudUser, signOutCloudUser } from '../cloud/firebase.js';

type RecoveryPreview={quotes:number;invoices:number;customers:number;documents:number;latestDocumentAt:string;createdAt:string;reason:string};

function formatDate(value:string):string{
  const parsed=new Date(value);
  if(Number.isNaN(parsed.getTime()))return value||'—';
  try{return parsed.toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'});}catch{return parsed.toLocaleString();}
}

function button(text:string,primary=false):HTMLButtonElement{
  const el=document.createElement('button');
  el.type='button';el.textContent=text;
  Object.assign(el.style,{minHeight:'42px',borderRadius:'11px',padding:'0 14px',fontWeight:'800',fontSize:'14px',cursor:'pointer',border:primary?'1px solid #123b52':'1px solid rgba(18,59,82,.22)',background:primary?'#123b52':'#fff',color:primary?'#fff':'#123b52'});
  return el;
}

function text(tag:'div'|'p'|'strong'|'small',value:string):HTMLElement{const el=document.createElement(tag);el.textContent=value;return el;}

function recoveryReason(reason:string):string{
  if(reason==='pre-restore')return 'Before a previous restore / قبل استعادة سابقة';
  if(reason==='pre-migration')return 'Before a data upgrade / قبل ترقية البيانات';
  if(reason==='pre-pin-change')return 'Before a PIN change / قبل تغيير رمز PIN';
  return reason||'Safety snapshot / نسخة أمان';
}

function previewCard(preview:RecoveryPreview):HTMLElement{
  const card=document.createElement('div');
  Object.assign(card.style,{display:'grid',gap:'9px',padding:'14px',borderRadius:'12px',background:'#f5f8fa',border:'1px solid rgba(18,59,82,.12)'});
  const title=text('strong','Recovery copy contents / محتويات نسخة الاسترجاع');title.style.fontSize='15px';card.append(title);
  const rows=[
    `Quotations / عروض أسعار: ${preview.quotes}`,
    `Invoices / فواتير: ${preview.invoices}`,
    `All documents / كل المستندات: ${preview.documents}`,
    `Customers / العملاء: ${preview.customers}`,
    `Snapshot time / وقت النسخة: ${formatDate(preview.createdAt)}`,
    `Latest document / آخر مستند: ${preview.latestDocumentAt?formatDate(preview.latestDocumentAt):'—'}`,
    `Reason / السبب: ${recoveryReason(preview.reason)}`
  ];
  rows.forEach(value=>{const row=text('div',value);row.style.fontSize='13px';row.style.lineHeight='1.45';card.append(row);});
  return card;
}

async function inspectSnapshot(pin:string):Promise<RecoveryPreview>{
  const snapshot=await getSafetySnapshot();
  if(!snapshot)throw new Error('No local recovery copy exists on this device. / لا توجد نسخة استرجاع محلية على هذا الجهاز.');
  const key=await verifyPin(pin,snapshot.security);
  const vault=await decryptVault(key,snapshot.vault);
  const documents=Array.isArray(vault.documents)?vault.documents:[];
  const quotes=documents.filter((doc:any)=>doc?.kind==='proforma').length;
  const invoices=documents.filter((doc:any)=>doc?.kind==='invoice').length;
  const customers=Array.isArray(vault.customers)?vault.customers.length:0;
  const latestDocumentAt=documents.reduce((latest:string,doc:any)=>{
    const candidate=typeof doc?.updatedAt==='string'?doc.updatedAt:typeof doc?.createdAt==='string'?doc.createdAt:'';
    if(!candidate)return latest;
    if(!latest)return candidate;
    const candidateTime=Date.parse(candidate),latestTime=Date.parse(latest);
    return Number.isFinite(candidateTime)&&(!Number.isFinite(latestTime)||candidateTime>latestTime)?candidate:latest;
  },'');
  return {quotes,invoices,customers,documents:documents.length,latestDocumentAt,createdAt:snapshot.createdAt,reason:snapshot.reason};
}

function createRecoveryModal(onClose:()=>void):HTMLElement{
  const backdrop=document.createElement('div');
  backdrop.setAttribute('role','dialog');backdrop.setAttribute('aria-modal','true');backdrop.setAttribute('aria-label','LOUREX local data recovery');
  Object.assign(backdrop.style,{position:'fixed',inset:'0',zIndex:'2147483646',display:'grid',placeItems:'center',padding:'18px',background:'rgba(4,17,27,.68)',backdropFilter:'blur(7px)'});
  const panel=document.createElement('div');
  Object.assign(panel.style,{width:'min(560px,100%)',maxHeight:'min(760px,92vh)',overflow:'auto',borderRadius:'18px',background:'#fff',boxShadow:'0 24px 80px rgba(0,0,0,.28)',padding:'20px',fontFamily:'inherit',color:'#102431'});
  const head=document.createElement('div');Object.assign(head.style,{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:'14px'});
  const titleWrap=document.createElement('div');const title=text('strong','Local Data Recovery / استرجاع البيانات المحلية');title.style.fontSize='18px';const subtitle=text('small','Inspect the protected copy on this device before restoring anything. / افحص النسخة المحمية على هذا الجهاز قبل استعادة أي شيء.');Object.assign(subtitle.style,{display:'block',marginTop:'5px',lineHeight:'1.5',opacity:'.72'});titleWrap.append(title,subtitle);
  const close=button('×');Object.assign(close.style,{minHeight:'34px',width:'38px',padding:'0',fontSize:'22px'});close.onclick=onClose;head.append(titleWrap,close);panel.append(head);

  const warning=text('p','Do not sync another device while recovering. Restoring here first signs out of LOUREX Cloud and keeps the current local copy as the new reverse-recovery snapshot. / لا تزامن جهازًا آخر أثناء الاسترجاع. الاستعادة هنا تسجل الخروج من السحابة أولًا وتحفظ النسخة الحالية كنسخة رجوع.');Object.assign(warning.style,{fontSize:'13px',lineHeight:'1.6',padding:'11px 12px',borderRadius:'11px',background:'#fff7e6',border:'1px solid rgba(157,104,0,.18)'});panel.append(warning);

  const field=document.createElement('label');field.textContent='PIN used by that recovery copy / رمز PIN الخاص بتلك النسخة';Object.assign(field.style,{display:'grid',gap:'7px',fontSize:'13px',fontWeight:'750'});
  const input=document.createElement('input');input.type='password';input.inputMode='numeric';input.autocomplete='current-password';input.placeholder='••••';Object.assign(input.style,{minHeight:'44px',border:'1px solid rgba(18,59,82,.22)',borderRadius:'11px',padding:'0 12px',font:'inherit',fontSize:'16px'});field.append(input);panel.append(field);

  const status=text('div','');Object.assign(status.style,{display:'none',marginTop:'12px',fontSize:'13px',lineHeight:'1.5'});panel.append(status);
  const previewHost=document.createElement('div');Object.assign(previewHost.style,{display:'grid',gap:'10px',marginTop:'12px'});panel.append(previewHost);
  const actions=document.createElement('div');Object.assign(actions.style,{display:'flex',flexWrap:'wrap',gap:'9px',marginTop:'14px'});
  const inspect=button('Inspect copy / فحص النسخة',true);const restore=button('Restore this copy / استعادة هذه النسخة',true);restore.disabled=true;restore.style.opacity='.45';actions.append(inspect,restore);panel.append(actions);backdrop.append(panel);

  let inspectedPin='';
  inspect.onclick=()=>void (async()=>{
    const pin=input.value.trim();
    if(!pin){status.style.display='block';status.style.color='#9a2f2f';status.textContent='Enter the PIN first. / أدخل رمز PIN أولًا.';return;}
    inspect.disabled=true;status.style.display='block';status.style.color='#425867';status.textContent='Inspecting encrypted copy… / جارٍ فحص النسخة المشفّرة…';previewHost.replaceChildren();restore.disabled=true;restore.style.opacity='.45';
    try{
      const preview=await inspectSnapshot(pin);inspectedPin=pin;previewHost.append(previewCard(preview));status.style.color='#1f6b4d';status.textContent='Copy verified. Confirm the document counts and dates before restoring. / تم التحقق من النسخة. تأكد من أعداد المستندات والتواريخ قبل الاستعادة.';restore.disabled=false;restore.style.opacity='1';
    }catch(error){inspectedPin='';status.style.color='#9a2f2f';status.textContent=error instanceof Error?error.message:'Unable to inspect recovery copy.';}
    finally{inspect.disabled=false;}
  })();

  restore.onclick=()=>void (async()=>{
    if(restore.disabled||!inspectedPin)return;
    if(input.value.trim()!==inspectedPin){restore.disabled=true;restore.style.opacity='.45';status.style.display='block';status.style.color='#9a2f2f';status.textContent='PIN changed after inspection. Inspect the copy again. / تغيّر رمز PIN بعد الفحص. افحص النسخة مرة أخرى.';return;}
    const confirmed=window.confirm('Restore the inspected local recovery copy now? The current local copy will be kept as the reverse-recovery snapshot. Cloud will be signed out first.\n\nاستعادة نسخة الاسترجاع المحلية التي تم فحصها الآن؟ سيتم حفظ النسخة الحالية كنسخة رجوع وسيتم تسجيل الخروج من السحابة أولًا.');
    if(!confirmed)return;
    restore.disabled=true;inspect.disabled=true;status.style.display='block';status.style.color='#425867';status.textContent='Protecting current data and restoring… / جارٍ حماية البيانات الحالية والاستعادة…';
    try{
      const user=currentCloudUser();
      if(user)await signOutCloudUser();
      await swapSafetySnapshotIntoCurrent();
      try{sessionStorage.setItem('lourex-recovery-restored','1');}catch{}
      window.location.reload();
    }catch(error){restore.disabled=false;inspect.disabled=false;status.style.color='#9a2f2f';status.textContent=error instanceof Error?error.message:'Recovery failed. Nothing was intentionally deleted.';}
  })();

  backdrop.addEventListener('click',event=>{if(event.target===backdrop)onClose();});
  return backdrop;
}

function showRecoveredNotice():void{
  let restored=false;try{restored=sessionStorage.getItem('lourex-recovery-restored')==='1';if(restored)sessionStorage.removeItem('lourex-recovery-restored');}catch{}
  if(!restored)return;
  const notice=document.createElement('div');Object.assign(notice.style,{position:'fixed',left:'50%',bottom:'18px',transform:'translateX(-50%)',zIndex:'2147483645',width:'min(620px,calc(100vw - 28px))',padding:'13px 15px',borderRadius:'13px',background:'#102f42',color:'#fff',boxShadow:'0 12px 34px rgba(0,0,0,.28)',fontSize:'13px',lineHeight:'1.55'});
  notice.textContent='Local recovery copy restored. Check the missing quotations now and create an encrypted backup before signing back into Cloud. / تمت استعادة النسخة المحلية. افحص عروض الأسعار المفقودة الآن وأنشئ نسخة احتياطية مشفّرة قبل تسجيل الدخول إلى السحابة.';
  document.body.append(notice);window.setTimeout(()=>notice.remove(),16000);
}

export async function startLocalRecoveryAssistant():Promise<void>{
  showRecoveredNotice();
  const snapshot=await getSafetySnapshot().catch(()=>null);
  if(!snapshot)return;
  const trigger=button('Recover local data / استرجاع بيانات');
  trigger.setAttribute('data-lourex-recovery','true');
  Object.assign(trigger.style,{position:'fixed',right:'14px',bottom:'14px',zIndex:'2147483644',boxShadow:'0 10px 28px rgba(0,0,0,.18)',background:'#fff',color:'#123b52'});
  let modal:HTMLElement|null=null;
  trigger.onclick=()=>{if(modal)return;modal=createRecoveryModal(()=>{modal?.remove();modal=null;});document.body.append(modal);};
  document.body.append(trigger);
}
