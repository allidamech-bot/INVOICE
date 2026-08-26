import type { AppSettings, CompanySettings, Customer, DocumentKind, LourexDocument, SavedItem, UiLanguage, VaultPayload } from '../types.js';
import { defaultCompany, emptyVault } from '../lib/defaults.js';
import { createBlankDocument, convertToInvoice, duplicateDocument, nextDocumentNumber, validateDocument } from '../lib/documents.js';
import { savedItemFromDocumentItem } from '../lib/saved-items.js';
import { exportBackup, readBackup } from '../lib/backup.js';
import { safeFilename } from '../lib/id.js';
import { getCloudAccount, getPublicPreferences, getSecurity, hasSecurity, putCloudAccount, putPublicPreferences } from '../storage/db.js';
import { changePin, restoreVaultWithCurrentKey, resumeVaultSession, saveVault, setupVault, unlockVault } from '../storage/vault.js';
import { mergeVaultIntent } from '../storage/vault-merge.js';
import { clearSession, establishSession, isCurrentSessionExpired, touchSession } from '../storage/session.js';
import { verifyPin } from '../crypto/crypto.js';
import { setUiLanguage, t } from '../lib/i18n.js';
import { AuthScreenSelector } from './AuthScreenSelector.js';
import { DocumentsPage } from '../components/DocumentsPage.js';
import { CustomersPage } from '../components/CustomersPage.js';
import { EditorPage } from '../components/EditorPage.js';
import { SettingsModal } from '../components/SettingsModal.js';
import { CloudAccountModal } from '../components/CloudAccountModal.js';
import { Brand, Button, ConfirmDialog, Icon, IconButton, Toast } from '../components/UI.js';
import { TemplateRenderer } from '../templates/TemplateRenderer.js';
import { createCloudUser, friendlyCloudError, getCloudVaultMeta, pushLocalVaultToCloud, reconcileCloudVault, sendCloudPasswordReset, signInCloudUser, signOutCloudUser, waitForCloudUser } from '../cloud/firebase.js';
import type { CloudUser } from '../cloud/firebase.js';

type CloudSyncState='local'|'syncing'|'synced'|'error';

interface State {
  loading:boolean; firstRun:boolean; unlocked:boolean; key:CryptoKey|null; vault:VaultPayload|null;
  screen:'documents'|'customers'|'editor'; editorDoc:LourexDocument|null; settingsOpen:boolean; newMenu:boolean;
  deletingDoc:LourexDocument|null; toast:string; toastTone:'default'|'success'|'error'; printDoc:LourexDocument|null;
  publicLogo:string; uiLanguage:UiLanguage;
  cloudUser:CloudUser|null; cloudLinked:boolean; cloudModal:boolean; cloudSyncState:CloudSyncState; cloudSyncMessage:string;
}

export class App extends React.Component<{},State> {
  state:State={loading:true,firstRun:false,unlocked:false,key:null,vault:null,screen:'documents',editorDoc:null,settingsOpen:false,newMenu:false,deletingDoc:null,toast:'',toastTone:'default',printDoc:null,publicLogo:'./brand/lourex-logo.svg',uiLanguage:'en',cloudUser:null,cloudLinked:false,cloudModal:false,cloudSyncState:'local',cloudSyncMessage:''};
  private lockTimer:number|undefined;
  private toastTimer:number|undefined;
  private cloudTimer:number|undefined;
  private cloudSyncRunning=false;
  private cloudSyncQueued=false;
  private vaultWriteTail:Promise<VaultPayload|null>=Promise.resolve(null);
  private vaultReplacing=false;

  componentDidMount():void{
    void this.initialize();
    ['pointerdown','keydown','touchstart'].forEach(ev=>window.addEventListener(ev,this.activity,{passive:true}));
    document.addEventListener('visibilitychange',this.handleVisibilityChange);
    document.addEventListener('pointerdown',this.closeTransientMenus);
    window.addEventListener('afterprint',this.afterPrint);
    window.addEventListener('online',this.handleOnline);
  }
  componentWillUnmount():void{
    ['pointerdown','keydown','touchstart'].forEach(ev=>window.removeEventListener(ev,this.activity));
    document.removeEventListener('visibilitychange',this.handleVisibilityChange);
    document.removeEventListener('pointerdown',this.closeTransientMenus);
    window.removeEventListener('afterprint',this.afterPrint);
    window.removeEventListener('online',this.handleOnline);
    if(this.lockTimer)clearTimeout(this.lockTimer);
    if(this.toastTimer)clearTimeout(this.toastTimer);
    if(this.cloudTimer)clearTimeout(this.cloudTimer);
  }

  private initialize=async()=>{
    let cloudUser:CloudUser|null=null;
    let cloudLinked=false;
    let cloudSyncState:CloudSyncState='local';
    let cloudSyncMessage='';
    try{cloudUser=await waitForCloudUser();}catch{}
    try{
      let configured=await hasSecurity();
      let linked=await getCloudAccount();
      if(cloudUser&&linked&&linked.uid!==cloudUser.uid){cloudSyncState='error';cloudSyncMessage=t('This device is linked to a different LOUREX cloud account.','هذا الجهاز مرتبط بحساب LOUREX سحابي مختلف.');}
      else if(cloudUser&&linked?.uid===cloudUser.uid){
        cloudLinked=true;
        try{
          const result=await reconcileCloudVault(cloudUser.uid);
          if(result==='pulled'){await clearSession();configured=true;}
          if(result!=='empty'){cloudSyncState='synced';cloudSyncMessage=t('Encrypted cloud data is up to date.','البيانات السحابية المشفّرة محدثة.');}
        }catch(e){cloudSyncState='error';cloudSyncMessage=friendlyCloudError(e);}
      }else if(cloudUser&&!configured&&!linked){
        try{
          await putCloudAccount(cloudUser.uid,cloudUser.email);
          linked=await getCloudAccount();cloudLinked=true;
          const result=await reconcileCloudVault(cloudUser.uid);
          if(result==='pulled'){configured=true;await clearSession();}
          if(result!=='empty'){cloudSyncState='synced';cloudSyncMessage=t('Encrypted cloud data restored.','تمت استعادة البيانات السحابية المشفّرة.');}
        }catch(e){cloudSyncState='error';cloudSyncMessage=friendlyCloudError(e);}
      }
      const preferences=await getPublicPreferences();
      let uiLanguage=preferences?.uiLanguage??'en';
      let publicLogo=preferences?.logoDataUrl||'./brand/lourex-logo.svg';
      if(configured){
        const resumed=await resumeVaultSession();
        if(resumed){
          const vault={...resumed.vault,appSettings:{...resumed.vault.appSettings,uiLanguage:resumed.vault.appSettings.uiLanguage??uiLanguage}};
          uiLanguage=vault.appSettings.uiLanguage;publicLogo=vault.company.logoDataUrl||publicLogo;setUiLanguage(uiLanguage);
          this.vaultWriteTail=Promise.resolve(vault);
          this.setState({loading:false,firstRun:false,unlocked:true,key:resumed.key,vault,screen:'documents',editorDoc:null,uiLanguage,publicLogo,cloudUser,cloudLinked,cloudSyncState,cloudSyncMessage},this.resetAutoLock);return;
        }
      }
      setUiLanguage(uiLanguage);
      this.setState({loading:false,firstRun:!configured,unlocked:false,key:null,vault:null,uiLanguage,publicLogo,cloudUser,cloudLinked,cloudSyncState,cloudSyncMessage});
    }catch(e){this.setState({loading:false,cloudUser,cloudLinked,cloudSyncState:'error',cloudSyncMessage:friendlyCloudError(e)});this.showToast(e instanceof Error?e.message:t('Unable to access local storage.','تعذر الوصول إلى التخزين المحلي.'),'error');}
  };

  private activity=()=>{if(this.state.unlocked){touchSession();this.resetAutoLock();}};
  private handleOnline=()=>{this.scheduleCloudSync(700);};
  private handleVisibilityChange=()=>{if(document.visibilityState!=='visible'||!this.state.unlocked)return;const mins=this.state.vault?.appSettings.autoLockMinutes??15;if(isCurrentSessionExpired(mins)){void this.lockNow(true);return;}touchSession();this.resetAutoLock();this.scheduleCloudSync(1000);};
  private closeTransientMenus=(event:PointerEvent)=>{if(!this.state.newMenu)return;const target=event.target;if(target instanceof Element&&target.closest('.new-doc-menu'))return;this.setState({newMenu:false});};
  private resetAutoLock=()=>{if(this.lockTimer)window.clearTimeout(this.lockTimer);const mins=this.state.vault?.appSettings.autoLockMinutes??15;if(mins>0)this.lockTimer=window.setTimeout(()=>void this.lockNow(true),mins*60_000);};
  private showToast=(toast:string,tone:'default'|'success'|'error'='default')=>{if(this.toastTimer)clearTimeout(this.toastTimer);this.setState({toast,toastTone:tone});this.toastTimer=window.setTimeout(()=>this.setState({toast:''}),3600);};
  private normalizedVault=(vault:VaultPayload):VaultPayload=>({...vault,appSettings:{...vault.appSettings,uiLanguage:vault.appSettings.uiLanguage??this.state.uiLanguage??'en'}});
  private syncPublicPreferences=async(logoDataUrl:string,uiLanguage:UiLanguage)=>{
    const publicLogo=logoDataUrl||'./brand/lourex-logo.svg';
    setUiLanguage(uiLanguage);
    this.setState({publicLogo,uiLanguage});
    try{await putPublicPreferences({logoDataUrl:publicLogo,uiLanguage});}catch{}
  };
  private changePublicLanguage=async(uiLanguage:UiLanguage)=>{await this.syncPublicPreferences(this.state.publicLogo||'./brand/lourex-logo.svg',uiLanguage);};
  private drainVaultWrites=async()=>{try{await this.vaultWriteTail;}catch{}};
  private waitForCloudIdle=async()=>{while(this.cloudSyncRunning)await new Promise(resolve=>window.setTimeout(resolve,30));};
  private editorMustBeClosed=(actionEn:string,actionAr:string)=>{if(this.state.screen!=='editor')return;throw new Error(t(`Close the document editor before ${actionEn}.`,`أغلق محرر المستند قبل ${actionAr}.`));};
  private beginProtectedOperation=async()=>{
    if(this.cloudTimer){window.clearTimeout(this.cloudTimer);this.cloudTimer=undefined;}
    await this.drainVaultWrites();
    await this.waitForCloudIdle();
    this.vaultReplacing=true;
  };
  private endProtectedOperation=()=>{this.vaultReplacing=false;};

  private scheduleCloudSync=(delay=4000)=>{
    if(!this.state.cloudUser||!this.state.cloudLinked)return;
    if(this.cloudTimer)window.clearTimeout(this.cloudTimer);
    this.cloudTimer=window.setTimeout(()=>void this.flushCloudSync(),delay);
  };
  private flushCloudSync=async()=>{
    const user=this.state.cloudUser;if(!user||!this.state.cloudLinked)return;
    if(this.vaultReplacing){this.cloudSyncQueued=true;return;}
    if(this.cloudSyncRunning){this.cloudSyncQueued=true;return;}
    if(typeof navigator!=='undefined'&&!navigator.onLine){this.setState({cloudSyncState:'local',cloudSyncMessage:t('Offline — changes are saved locally and will sync later.','غير متصل — التغييرات محفوظة محليًا وستتم مزامنتها لاحقًا.')});return;}
    await this.drainVaultWrites();
    if(this.vaultReplacing){this.cloudSyncQueued=true;return;}
    const linked=await getCloudAccount();if(!linked||linked.uid!==user.uid)return;
    this.cloudSyncRunning=true;this.setState({cloudSyncState:'syncing',cloudSyncMessage:t('Syncing encrypted vault…','جارٍ مزامنة الخزنة المشفّرة…')});
    try{await pushLocalVaultToCloud(user.uid);this.setState({cloudSyncState:'synced',cloudSyncMessage:t('Encrypted cloud data is up to date.','البيانات السحابية المشفّرة محدثة.')});}
    catch(e){this.setState({cloudSyncState:'error',cloudSyncMessage:friendlyCloudError(e)});}
    finally{this.cloudSyncRunning=false;if(this.cloudSyncQueued){this.cloudSyncQueued=false;this.scheduleCloudSync(700);}}
  };
  private attachCloudUser=async(user:CloudUser)=>{
    const [linked,configured]=await Promise.all([getCloudAccount(),hasSecurity()]);
    if(linked&&linked.uid!==user.uid){await signOutCloudUser();this.setState({cloudUser:null,cloudLinked:false});throw new Error(t('This device is already linked to another LOUREX cloud account.','هذا الجهاز مرتبط مسبقًا بحساب LOUREX سحابي آخر.'));}
    if(!linked&&configured){
      const remote=await getCloudVaultMeta(user.uid);
      if(remote){await signOutCloudUser();this.setState({cloudUser:null,cloudLinked:false});throw new Error(t('This cloud account already contains LOUREX data. Use an empty device to restore it, or sign in with the account originally linked to this device.','هذا الحساب السحابي يحتوي بالفعل على بيانات LOUREX. استخدم جهازًا فارغًا لاستعادتها أو سجّل بالحساب المرتبط أصلًا بهذا الجهاز.'));}
    }
    await putCloudAccount(user.uid,user.email);
    this.setState({cloudUser:user,cloudLinked:true,cloudSyncState:'syncing',cloudSyncMessage:t('Connecting encrypted cloud backup…','جارٍ ربط النسخة السحابية المشفّرة…')});
    try{
      const result=await reconcileCloudVault(user.uid);
      if(result==='pulled'){await clearSession();this.setState({cloudSyncState:'synced',cloudSyncMessage:t('Cloud data restored. Enter your LOUREX PIN to unlock it.','تمت استعادة البيانات السحابية. أدخل رمز PIN الخاص بـ LOUREX لفتحها.')});window.location.reload();return;}
      this.setState({cloudSyncState:result==='empty'?'local':'synced',cloudSyncMessage:result==='empty'?t('Cloud account linked. Finish local setup to create the first encrypted sync.','تم ربط الحساب السحابي. أكمل الإعداد المحلي لإنشاء أول مزامنة مشفّرة.'):t('Encrypted cloud data is up to date.','البيانات السحابية المشفّرة محدثة.')});
    }catch(e){this.setState({cloudSyncState:'error',cloudSyncMessage:friendlyCloudError(e)});}
  };
  private cloudSignIn=async(email:string,password:string)=>{try{const user=await signInCloudUser(email,password);this.setState({cloudUser:user});await this.attachCloudUser(user);}catch(e){throw new Error(friendlyCloudError(e));}};
  private cloudCreate=async(email:string,password:string)=>{try{const user=await createCloudUser(email,password);this.setState({cloudUser:user});await this.attachCloudUser(user);}catch(e){throw new Error(friendlyCloudError(e));}};
  private cloudReset=async(email:string)=>{try{await sendCloudPasswordReset(email);}catch(e){throw new Error(friendlyCloudError(e));}};
  private cloudSignOut=async()=>{await signOutCloudUser();this.setState({cloudUser:null,cloudSyncState:'local',cloudSyncMessage:t('Signed out of cloud. Local encrypted data remains on this device.','تم تسجيل الخروج من السحابة. تبقى البيانات المحلية المشفّرة على هذا الجهاز.')});};
  private cloudSyncNow=async()=>{
    this.editorMustBeClosed('syncing from the cloud','المزامنة من السحابة');
    await this.beginProtectedOperation();
    try{
      const user=this.state.cloudUser;if(!user)throw new Error(t('Sign in to LOUREX Cloud first.','سجّل الدخول إلى سحابة LOUREX أولًا.'));
      const linked=await getCloudAccount();if(!linked){this.endProtectedOperation();await this.attachCloudUser(user);return;}
      if(linked.uid!==user.uid)throw new Error(t('This device is linked to another cloud account.','هذا الجهاز مرتبط بحساب سحابي آخر.'));
      this.setState({cloudSyncState:'syncing',cloudSyncMessage:t('Checking encrypted cloud data…','جارٍ فحص البيانات السحابية المشفّرة…')});
      const result=await reconcileCloudVault(user.uid);
      if(result==='pulled'){await clearSession();window.location.reload();return;}
      this.setState({cloudSyncState:'synced',cloudSyncMessage:t('Encrypted cloud data is up to date.','البيانات السحابية المشفّرة محدثة.')});
    }catch(e){const message=friendlyCloudError(e);this.setState({cloudSyncState:'error',cloudSyncMessage:message});throw new Error(message);}
    finally{this.endProtectedOperation();}
  };

  private finishSetup=async(pin:string,company:CompanySettings)=>{
    const base=emptyVault();const vault={...base,company,appSettings:{...base.appSettings,uiLanguage:this.state.uiLanguage,smartDefaults:{...base.appSettings.smartDefaults,currency:company.defaultCurrency||'USD',language:company.defaultLanguage,incoterm:company.defaultIncoterm,paymentTerms:company.defaultPaymentTerms,deliveryTime:company.defaultDeliveryTime}}};const setup=await setupVault(pin,vault);await establishSession(setup.key);await this.syncPublicPreferences(company.logoDataUrl,this.state.uiLanguage);
    let cloudLinked=this.state.cloudLinked,cloudSyncState=this.state.cloudSyncState,cloudSyncMessage=this.state.cloudSyncMessage;
    if(this.state.cloudUser){try{await putCloudAccount(this.state.cloudUser.uid,this.state.cloudUser.email);cloudLinked=true;await pushLocalVaultToCloud(this.state.cloudUser.uid);cloudSyncState='synced';cloudSyncMessage=t('Encrypted cloud backup created.','تم إنشاء النسخة السحابية المشفّرة.');}catch(e){cloudSyncState='error';cloudSyncMessage=friendlyCloudError(e);}}
    this.vaultWriteTail=Promise.resolve(setup.vault);
    this.setState({firstRun:false,unlocked:true,key:setup.key,vault:setup.vault,screen:'documents',cloudLinked,cloudSyncState,cloudSyncMessage},this.resetAutoLock);this.showToast(t('LOUREX Invoice is ready.','نظام LOUREX Invoice جاهز.'),'success');
  };
  private unlock=async(pin:string)=>{const result=await unlockVault(pin);const needsMigration=!result.vault.appSettings.uiLanguage;const vault=this.normalizedVault(result.vault);if(needsMigration)await saveVault(result.key,vault);await establishSession(result.key);await this.syncPublicPreferences(vault.company.logoDataUrl,vault.appSettings.uiLanguage);this.vaultWriteTail=Promise.resolve(vault);this.setState({unlocked:true,key:result.key,vault,screen:'documents',editorDoc:null},()=>{this.resetAutoLock();this.scheduleCloudSync(1600);});};
  private lock=()=>{void this.lockNow(false);};
  private lockNow=async(automatic:boolean)=>{if(!automatic&&this.state.screen==='editor'){this.showToast(t('Close the document editor before locking the app.','أغلق محرر المستند قبل قفل التطبيق.'),'error');return;}if(this.lockTimer)window.clearTimeout(this.lockTimer);await this.drainVaultWrites();await clearSession();this.vaultWriteTail=Promise.resolve(null);this.setState({unlocked:false,key:null,vault:null,editorDoc:null,screen:'documents',settingsOpen:false,newMenu:false});};
  private persist=async(intended:VaultPayload)=>{
    if(this.vaultReplacing)throw new Error(t('A protected data operation is in progress.','توجد عملية محمية على البيانات قيد التنفيذ.'));
    const key=this.state.key;if(!key)throw new Error(t('App is locked.','التطبيق مقفل.'));
    const base=this.requireVault();
    const operation=this.vaultWriteTail.catch(()=>null).then(async queued=>{
      if(this.vaultReplacing)throw new Error(t('A protected data operation is in progress.','توجد عملية محمية على البيانات قيد التنفيذ.'));
      const latest=queued??this.state.vault??base;
      const merged=mergeVaultIntent(base,intended,latest);
      await saveVault(key,merged);
      if(this.state.unlocked&&this.state.key===key)await new Promise<void>(resolve=>this.setState({vault:merged},resolve));
      this.scheduleCloudSync();
      return merged;
    });
    this.vaultWriteTail=operation;
    await operation;
  };
  private reserveDocument=async(kind:DocumentKind):Promise<{doc:LourexDocument;vault:VaultPayload}>=>{
    const vault=this.requireVault();const next=nextDocumentNumber(vault,kind);await this.persist(next.vault);
    const current=this.requireVault();const smart=current.appSettings.smartDefaults;const base=createBlankDocument(kind,next.number,current.company);
    const doc={...base,currency:smart.currency||base.currency,language:smart.language||base.language,terms:{...base.terms,incoterm:smart.incoterm,paymentTerms:smart.paymentTerms,deliveryTime:smart.deliveryTime},appearance:{...base.appearance,templateId:kind==='proforma'?smart.quoteTemplateId:smart.invoiceTemplateId}};
    return{doc,vault:current};
  };
  private newDocument=async(kind:DocumentKind)=>{try{const {doc}=await this.reserveDocument(kind);this.setState({screen:'editor',editorDoc:doc,newMenu:false});}catch(e){this.showToast(e instanceof Error?e.message:t('Unable to create document.','تعذر إنشاء المستند.'),'error');}};
  private saveDocument=async(doc:LourexDocument,auto=false)=>{
    const vault=this.requireVault();if(vault.documents.some(d=>d.id!==doc.id&&d.number.trim().toLowerCase()===doc.number.trim().toLowerCase()))throw new Error(t('Document number already exists.','رقم المستند مستخدم بالفعل.'));
    const index=vault.documents.findIndex(d=>d.id===doc.id);const documents=[...vault.documents];const updated={...doc,updatedAt:new Date().toISOString()};if(index>=0)documents[index]=updated;else documents.push(updated);
    const appSettings=auto?vault.appSettings:{...vault.appSettings,smartDefaults:{...vault.appSettings.smartDefaults,currency:updated.currency,language:updated.language,incoterm:updated.terms.incoterm,paymentTerms:updated.terms.paymentTerms,deliveryTime:updated.terms.deliveryTime,[updated.kind==='proforma'?'quoteTemplateId':'invoiceTemplateId']:updated.appearance.templateId}};
    await this.persist({...vault,documents,appSettings});this.setState({editorDoc:updated});if(!auto)this.showToast(t('Document saved. Smart defaults updated.','تم حفظ المستند وتحديث الإعدادات الذكية.'),'success');
  };
  private saveSmartDefaults=async(smartDefaults:AppSettings['smartDefaults'])=>{const vault=this.requireVault();await this.persist({...vault,appSettings:{...vault.appSettings,smartDefaults}});};
  private saveSavedItem=async(item:SavedItem)=>{const vault=this.requireVault();const index=vault.savedItems.findIndex(x=>x.id===item.id);const savedItems=[...vault.savedItems];if(index>=0)savedItems[index]={...item,updatedAt:new Date().toISOString()};else savedItems.push(item);await this.persist({...vault,savedItems});this.showToast(t('Item saved to product library.','تم حفظ الصنف في مكتبة الأصناف.'),'success');};
  private saveDocumentItem=async(item:LourexDocument['items'][number],currency:string)=>{const vault=this.requireVault();const existing=vault.savedItems.find(x=>(item.descriptionEn.trim()&&x.descriptionEn.trim().toLowerCase()===item.descriptionEn.trim().toLowerCase())||(item.descriptionAr.trim()&&x.descriptionAr.trim()===item.descriptionAr.trim()));await this.saveSavedItem(savedItemFromDocumentItem(item,currency,existing));};
  private deleteSavedItem=async(item:SavedItem)=>{const vault=this.requireVault();await this.persist({...vault,savedItems:vault.savedItems.filter(x=>x.id!==item.id)});this.showToast(t('Saved item deleted.','تم حذف الصنف المحفوظ.'),'success');};
  private openDocument=(doc:LourexDocument)=>this.setState({screen:'editor',editorDoc:structuredClone(doc)});
  private duplicate=async(source:LourexDocument)=>{try{const {doc:blank}=await this.reserveDocument(source.kind);const vault=this.requireVault();const copy=duplicateDocument(source,blank.number);await this.persist({...vault,documents:[...vault.documents,copy]});this.setState({screen:'editor',editorDoc:copy});this.showToast(t('Duplicate created.','تم إنشاء نسخة.'),'success');}catch(e){this.showToast(e instanceof Error?e.message:t('Duplicate failed.','تعذر إنشاء نسخة.'),'error');}};
  private convert=async(source:LourexDocument)=>{try{const current=this.requireVault();const errors=validateDocument(source);if(Object.keys(errors).length)throw new Error(t('Save a valid Proforma before converting it.','احفظ عرض سعر صالحًا قبل تحويله.'));if(current.documents.some(d=>d.id!==source.id&&d.number.trim().toLowerCase()===source.number.trim().toLowerCase()))throw new Error(t('Document number already exists.','رقم المستند مستخدم بالفعل.'));const savedSource={...source,updatedAt:new Date().toISOString()};const sourceIndex=current.documents.findIndex(d=>d.id===source.id);const sourceDocuments=[...current.documents];if(sourceIndex>=0)sourceDocuments[sourceIndex]=savedSource;else sourceDocuments.push(savedSource);const withSource={...current,documents:sourceDocuments};const numbered=nextDocumentNumber(withSource,'invoice');const converted=convertToInvoice(savedSource,numbered.number);await this.persist({...numbered.vault,documents:[...sourceDocuments,converted]});this.setState({screen:'editor',editorDoc:converted});this.showToast(t(`Created ${converted.number}.`,`تم إنشاء ${converted.number}.`),'success');}catch(e){this.showToast(e instanceof Error?e.message:t('Conversion failed.','فشل التحويل.'),'error');}};
  private deleteDocument=async()=>{const target=this.state.deletingDoc;if(!target)return;try{const vault=this.requireVault();await this.persist({...vault,documents:vault.documents.filter(d=>d.id!==target.id)});this.setState({deletingDoc:null});this.showToast(t('Document deleted.','تم حذف المستند.'),'success');}catch(e){this.showToast(e instanceof Error?e.message:t('Delete failed.','فشل الحذف.'),'error');}};
  private saveCustomer=async(customer:Customer)=>{const vault=this.requireVault();const index=vault.customers.findIndex(c=>c.id===customer.id);const customers=[...vault.customers];if(index>=0)customers[index]={...customer,updatedAt:new Date().toISOString()};else customers.push(customer);await this.persist({...vault,customers});};
  private deleteCustomer=async(customer:Customer)=>{const vault=this.requireVault();await this.persist({...vault,customers:vault.customers.filter(c=>c.id!==customer.id)});this.showToast(t('Customer deleted.','تم حذف العميل.'),'success');};
  private saveCompany=async(company:CompanySettings)=>{const vault=this.requireVault();const smartDefaults={...vault.appSettings.smartDefaults,currency:company.defaultCurrency||'USD',language:company.defaultLanguage,incoterm:company.defaultIncoterm,paymentTerms:company.defaultPaymentTerms,deliveryTime:company.defaultDeliveryTime};const appSettings={...vault.appSettings,smartDefaults};await this.persist({...vault,company,appSettings});await this.syncPublicPreferences(company.logoDataUrl,this.requireVault().appSettings.uiLanguage);};
  private saveAppSettings=async(appSettings:AppSettings)=>{const vault=this.requireVault();const next={...appSettings,uiLanguage:appSettings.uiLanguage??'en'};await this.persist({...vault,appSettings:next});const current=this.requireVault();await this.syncPublicPreferences(current.company.logoDataUrl,current.appSettings.uiLanguage);touchSession();this.resetAutoLock();};
  private changePin=async(currentPin:string,newPin:string)=>{this.editorMustBeClosed('changing the PIN','تغيير رمز PIN');await this.beginProtectedOperation();try{const result=await changePin(currentPin,newPin);await establishSession(result.key);this.vaultWriteTail=Promise.resolve(this.state.vault);this.setState({key:result.key},()=>this.scheduleCloudSync(500));this.showToast(t('PIN changed.','تم تغيير رمز PIN.'),'success');}finally{this.endProtectedOperation();}};
  private backup=async(pin:string)=>{this.editorMustBeClosed('creating a backup','إنشاء نسخة احتياطية');await this.drainVaultWrites();const security=await getSecurity();if(!security)throw new Error(t('Security settings are missing.','إعدادات الأمان غير موجودة.'));await verifyPin(pin,security);await exportBackup(pin,this.requireVault());};
  private restore=async(file:File,pin:string)=>{
    this.editorMustBeClosed('restoring a backup','استعادة نسخة احتياطية');
    const restored=this.normalizedVault(await readBackup(file,pin));
    await this.beginProtectedOperation();
    try{
      const key=this.state.key;if(!key)throw new Error(t('App is locked.','التطبيق مقفل.'));
      const vault=await restoreVaultWithCurrentKey(key,restored);
      this.vaultWriteTail=Promise.resolve(vault);
      await this.syncPublicPreferences(vault.company.logoDataUrl,vault.appSettings.uiLanguage);
      touchSession();
      await new Promise<void>(resolve=>this.setState({vault,screen:'documents',editorDoc:null},resolve));
      this.resetAutoLock();
    }finally{
      this.endProtectedOperation();
      this.scheduleCloudSync(500);
    }
  };
  private requireVault():VaultPayload{if(!this.state.vault)throw new Error(t('App is locked.','التطبيق مقفل.'));return this.state.vault;}
  private waitForPrintAssets=async()=>{
    await new Promise<void>(resolve=>window.requestAnimationFrame(()=>window.requestAnimationFrame(()=>resolve())));
    try{if(document.fonts)await document.fonts.ready;}catch{}
    const images=Array.from(document.querySelectorAll<HTMLImageElement>('.print-portal img'));
    await Promise.all(images.map(async image=>{
      if(image.complete&&image.naturalWidth>0)return;
      try{if(typeof image.decode==='function'){await image.decode();return;}}catch{}
      await new Promise<void>(resolve=>{const done=()=>resolve();image.addEventListener('load',done,{once:true});image.addEventListener('error',done,{once:true});window.setTimeout(done,1200);});
    }));
  };
  private launchPrint=async()=>{await this.waitForPrintAssets();if(!this.state.printDoc)return;window.print();};
  private requestPrint=async(doc:LourexDocument,mode:'print'|'pdf'|'share')=>{
    try{
      const errors=validateDocument(doc);if(Object.keys(errors).length)throw new Error(t('Complete the required document fields before printing or sharing.','أكمل الحقول المطلوبة قبل الطباعة أو المشاركة.'));
      const vault=this.requireVault();
      if(vault.documents.some(d=>d.id!==doc.id&&d.number.trim().toLowerCase()===doc.number.trim().toLowerCase()))throw new Error(t('Document number already exists.','رقم المستند مستخدم بالفعل.'));
      let target:LourexDocument;
      const existing=vault.documents.find(d=>d.id===doc.id);
      if(doc.status==='final'&&existing?.status==='final')target=structuredClone(doc);
      else{
        target={...structuredClone(doc),status:'final',updatedAt:new Date().toISOString()};
        const idx=vault.documents.findIndex(d=>d.id===target.id);const documents=[...vault.documents];if(idx>=0)documents[idx]=target;else documents.push(target);await this.persist({...vault,documents});
      }
      const customer=target.customerSnapshot?.companyNameEn||target.customerSnapshot?.companyNameAr||'Customer';const prefix=`LOUREX-${safeFilename(target.number)}-${safeFilename(customer)}`;
      document.title=prefix;
      this.setState({printDoc:target},()=>{document.body.classList.add('printing');void this.launchPrint();});
      if(mode==='pdf')this.showToast(t('PDF print view opened — choose “Save as PDF”.','تم فتح نافذة الطباعة — اختر «حفظ كملف PDF».'),'default');else if(mode==='share')this.showToast(t('System print view opened — save/share the PDF from your device.','تم فتح نافذة النظام — احفظ أو شارك ملف PDF من جهازك.'),'default');
    }catch(e){this.showToast(e instanceof Error?e.message:t('Unable to prepare document.','تعذر تجهيز المستند.'),'error');}
  };
  private afterPrint=()=>{document.body.classList.remove('printing');document.title='LOUREX Invoice';this.setState({printDoc:null});};
  private closeEditor=()=>{this.setState({screen:'documents',editorDoc:null});};

  private cloudModal=()=> <CloudAccountModal open={this.state.cloudModal} user={this.state.cloudUser} syncState={this.state.cloudSyncState} syncMessage={this.state.cloudSyncMessage} onClose={()=>this.setState({cloudModal:false})} onSignIn={this.cloudSignIn} onCreate={this.cloudCreate} onReset={this.cloudReset} onSync={this.cloudSyncNow} onSignOut={this.cloudSignOut}/>;
  private authCloudShell=(content:any)=> <div className="auth-shell">{content}<div className={`auth-cloud-launcher cloud-${this.state.cloudSyncState}`}><Button icon="backup" onClick={()=>this.setState({cloudModal:true})}>{this.state.cloudUser?t('Cloud Account','الحساب السحابي'):t('Cloud Sign In','الدخول السحابي')}</Button></div>{this.cloudModal()}</div>;

  render():any{
    const activeLanguage=this.state.vault?.appSettings.uiLanguage??this.state.uiLanguage;setUiLanguage(activeLanguage);
    if(this.state.loading)return <div className="loading-screen"><Brand logoDataUrl={this.state.publicLogo} language={activeLanguage}/><span className="loading-line"/></div>;
    if(this.state.firstRun)return this.authCloudShell(<AuthScreenSelector mode="setup" company={defaultCompany()} logoDataUrl={this.state.publicLogo} language={activeLanguage} onLanguageChange={this.changePublicLanguage} onFinish={this.finishSetup}/>);
    if(!this.state.unlocked)return this.authCloudShell(<AuthScreenSelector mode="unlock" logoDataUrl={this.state.publicLogo} language={activeLanguage} onLanguageChange={this.changePublicLanguage} onUnlock={this.unlock}/>);
    const vault=this.requireVault();
    return <div className="app-root"><div className="app-ui"><header className="app-header"><button className="header-brand" disabled={this.state.screen==='editor'} onClick={()=>this.setState({screen:'documents',editorDoc:null})}><Brand compact logoDataUrl={vault.company.logoDataUrl} language={activeLanguage}/></button>{this.state.screen!=='editor'?<nav className="main-nav"><button className={this.state.screen==='documents'?'active':''} onClick={()=>this.setState({screen:'documents',editorDoc:null})}><Icon name="file"/>{t('Documents','المستندات')}</button><button className={this.state.screen==='customers'?'active':''} onClick={()=>this.setState({screen:'customers',editorDoc:null})}><Icon name="users"/>{t('Customers','العملاء')}</button></nav>:<div className="header-editor-context">{t('Document Editor','محرر المستند')}</div>}<div className="header-actions">{this.state.screen!=='editor'?<div className="new-doc-menu"><Button icon="plus" variant="primary" onClick={()=>this.setState({newMenu:!this.state.newMenu})}>{t('New Document','مستند جديد')}</Button>{this.state.newMenu?<div className="new-menu"><button onClick={()=>void this.newDocument('proforma')}><Icon name="proforma"/><span><strong>{t('Proforma Invoice','عرض سعر')}</strong><small>{t('Commercial quotation','عرض تجاري')}</small></span></button><button onClick={()=>void this.newDocument('invoice')}><Icon name="invoice"/><span><strong>{t('Invoice','فاتورة')}</strong><small>{t('Final invoice','فاتورة نهائية')}</small></span></button></div>:null}</div>:null}<Button icon="backup" className={`cloud-header-button cloud-${this.state.cloudSyncState}`} onClick={()=>this.setState({cloudModal:true})}>{t('Cloud','السحابة')}</Button><IconButton icon="settings" label={t('Settings','الإعدادات')} onClick={()=>this.setState({settingsOpen:true})}/></div></header>
      <main className={this.state.screen==='editor'?'editor-main':'main-content'}>{this.state.screen==='documents'?<DocumentsPage documents={vault.documents} onNew={(k)=>void this.newDocument(k)} onOpen={this.openDocument} onDuplicate={(d)=>void this.duplicate(d)} onPrint={(d,m)=>void this.requestPrint(d,m)} onDelete={(d)=>this.setState({deletingDoc:d})}/>:null}{this.state.screen==='customers'?<CustomersPage customers={vault.customers} onSave={this.saveCustomer} onDelete={this.deleteCustomer}/>:null}{this.state.screen==='editor'&&this.state.editorDoc?<EditorPage document={this.state.editorDoc} documents={vault.documents} customers={vault.customers} company={vault.company} savedItems={vault.savedItems} smartDefaults={vault.appSettings.smartDefaults} onClose={this.closeEditor} onSave={this.saveDocument} onSaveCustomer={this.saveCustomer} onSaveSavedItem={this.saveSavedItem} onSaveDocumentItem={this.saveDocumentItem} onDeleteSavedItem={this.deleteSavedItem} onSaveSmartDefaults={this.saveSmartDefaults} onConvert={this.convert} onPrint={(d,m)=>void this.requestPrint(d,m)}/>:null}</main>
      <SettingsModal open={this.state.settingsOpen} company={vault.company} appSettings={vault.appSettings} onClose={()=>this.setState({settingsOpen:false})} onSaveCompany={this.saveCompany} onSaveAppSettings={this.saveAppSettings} onChangePin={this.changePin} onLock={this.lock} onBackup={this.backup} onRestore={this.restore}/>
      {this.cloudModal()}
      <ConfirmDialog open={Boolean(this.state.deletingDoc)} title={t(`Delete ${this.state.deletingDoc?.number ?? 'document'}?`,`حذف ${this.state.deletingDoc?.number ?? 'المستند'}؟`)} message={t('This action cannot be undone.','لا يمكن التراجع عن هذا الإجراء.')} onCancel={()=>this.setState({deletingDoc:null})} onConfirm={()=>void this.deleteDocument()}/><Toast text={this.state.toast} tone={this.state.toastTone}/></div>
      <div className="print-portal">{this.state.printDoc?<TemplateRenderer document={this.state.printDoc} scale={1}/>:null}</div></div>;
  }
}
