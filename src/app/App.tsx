import {postIssuedInvoiceStock,isIssuedInvoiceStockIssue} from '../lib/invoice-stock.js';
import {postVoidedInvoiceWithPhysicalReceipt} from '../lib/invoice-void-stock.js';
import {postSalesReturn,correctSalesReturn,type SalesReturnInput,type SalesReturnCorrectionInput} from '../lib/sales-returns.js';
import {validateManualMovementEvidence} from '../lib/inventory-evidence.js';
import { createLinkedDeliveryDraft } from '../lib/delivery-flow.js';
import { salesOrderForQuotation, assertSalesOrderIntegrity } from '../lib/sales-order-flow.js';
import { confirmedSalesDeliveries } from '../lib/sales-delivery-flow.js';
import { createConfirmedDeliveryInvoiceDraft, assertDeliveryInvoiceIntegrity, isDeliveryLinkedInvoice } from '../lib/sales-delivery-invoice.js';
import { createLinkedPurchaseOrderDraft } from '../lib/procurement-flow.js';
import type { AppSettings, ApprovalPolicyRecord, CompanySettings, Customer, DocumentAttachment, DocumentKind, EncryptedVaultRecord, ExpenseRecord, InventoryMovementRecord, LourexDocument, PaymentRecord, PurchaseRecord, RecurringTarget, RecurringWorkflowRecord, SavedItem, Supplier, SupplierPaymentRecord, TeamMemberRecord, UiLanguage, VaultPayload } from '../types.js';
import { customerSnapshotFrom, emptyVault } from '../lib/defaults.js';
import { createBlankDocument, convertToInvoice, duplicateDocument, nextCreditNoteNumber, nextDocumentNumber, validateDocument } from '../lib/documents.js';
import { assertDocumentLifecycleInvariant, auditedDocument, beginRevisionDraft, createCreditNoteDraft, createDocumentEvent, createRevisionRecord, invoiceCreditCapacity, restoreRevisionSnapshot, voidFinalDocument } from '../lib/document-lifecycle.js';
import { assertInvoicePaymentInvariant, normalizePaymentRecord } from '../lib/payments.js';
import { normalizeSupplierPayment, voidSupplierPayment } from '../lib/payables.js';
import { applyCustomerCommercialDefaults, applyPaymentTermPreset, assertCustomerCreditLimit, paymentTermPresetById, paymentTermPresetByLabel } from '../lib/commercial-controls.js';
import { inventoryMovementIsManual, nextPurchaseNumber, postPurchase, reversePurchase, validateExpense, validatePurchase, validateSupplier } from '../lib/operations.js';
import { findSavedItemDuplicate, findSavedItemMatch, markSavedItemsUsed, normalizeSavedItemIdentity, savedItemFromDocumentItem } from '../lib/saved-items.js';
import { safeFilename } from '../lib/id.js';
import { calculateTotals } from '../lib/money.js';
import { buildBusinessHealth } from '../lib/business-health.js';
import { activateAccountStorage, activeAccountStorageUid, getPublicPreferences, putCloudAccount, putPublicPreferences } from '../storage/db.js';
import { mergeVaultIntent } from '../storage/vault-merge.js';
import { setActiveAccountUid, suspendSession, touchSession } from '../storage/session.js';
import { setUiLanguage, t } from '../lib/i18n.js';
import { confirmWorkspaceDeparture } from '../lib/workspace-dirty.js';
import { assertRecurringWorkflow, completeRecurringRun, materializeRecurringDocumentDraft, materializeRecurringPurchaseDraft, recurringWorkflowDue } from '../lib/recurring-workflows.js';
import { appendAuditEventsForVaultDiff } from '../lib/audit-diff.js';
import { approvalGate, decideApprovalRequest, assertGovernancePermission, activeTeamMember } from '../lib/governance.js';
import { activateBranch, activateWorkspace, applyWorkspaceScope, createBranch, createWorkspace, overlayWorkspaceScope, scopeVault } from '../lib/workspaces.js';
import { AccountEntryScreen } from '../components/AccountEntryScreen.js';
import { exportPlainBackup, readPlainBackup, assertPostedStockRestoreContinuity } from '../lib/backup.js';
import { synchronizeActiveWorkspaceOnSave } from '../storage/vault.js';
import { getPlainWorkspace, savePlainWorkspace, updatePlainWorkspaceIfUnchanged, replacePlainWorkspaceIfUnchanged } from '../storage/db.js';
import { assertPlainCloudWorkspaceUploadable, reconcilePlainCloudWorkspace, uploadPlainCloudWorkspace, downloadPlainCloudWorkspace, getPlainCloudMeta } from '../cloud/plain-workspace.js';
import type { PlainWorkspaceRecord } from '../types.js';
import { DocumentsPage } from '../components/DocumentsPage.js';
import { CustomersPage } from '../components/CustomersPage.js';
import { ReportsPage } from '../components/ReportsPage.js';
import { OperationsPage } from '../components/OperationsPage.js';
import { ProductsInventoryWorkspace } from '../components/ProductsInventoryWorkspace.js';
import { FinanceWorkspace } from '../components/FinanceWorkspace.js';
import { EditorPage } from '../components/EditorPage.js';
import { SettingsModal } from '../components/SettingsModal.js';
import { CloudAccountModal } from '../components/CloudAccountModal.js';
import { AppShell } from '../components/AppShell.js';
import { WorkspaceHome } from '../components/WorkspaceHome.js';
import { GlobalSearch } from '../components/GlobalSearch.js';
import { RecurringWorkflowsManager } from '../components/RecurringWorkflowsManager.js';
import { Brand, Button, ConfirmDialog, Modal, Select, Toast } from '../components/UI.js';
import { TemplateRenderer } from '../templates/TemplateRenderer.js';
import { DraftDocumentRenderer } from '../components/DraftDocumentRenderer.js';
import { isLetterDocument } from '../lib/document-extras.js';
import { documentUsesCommercialDefaults } from '../lib/document-kinds.js';
import { currentCloudUser, createCloudUser, friendlyCloudError, sendCloudPasswordReset, signInCloudUser, signOutCloudUser, waitForCloudUser } from '../cloud/firebase.js';
import type { CloudUser } from '../cloud/firebase.js';

type CloudSyncState='local'|'queued'|'syncing'|'synced'|'offline'|'error'|'conflict';
type CatalogLauncher=''|'credit-note'|'statement-account';
const CLOUD_SAVE_SETTLE_MS=350;
const CLOUD_EDIT_ACTIVITY_SETTLE_MS=800;
const OUTPUT_TOTAL_KEYS=['subtotal','discount','shipping','otherCharges','tax','grandTotal'] as const;

function assertFinancialOutputParity(source:LourexDocument,target:LourexDocument):void{
  const sourceTotals=calculateTotals(source.items,source.adjustments);
  const targetTotals=calculateTotals(target.items,target.adjustments);
  const totalsChanged=OUTPUT_TOTAL_KEYS.some(key=>sourceTotals[key]!==targetTotals[key]);
  const financialInputsChanged=source.currency!==target.currency
    ||JSON.stringify(source.items.map(item=>[item.quantity,item.unitPrice]))!==JSON.stringify(target.items.map(item=>[item.quantity,item.unitPrice]))
    ||JSON.stringify(source.adjustments)!==JSON.stringify(target.adjustments);
  if(totalsChanged||financialInputsChanged)throw new Error(t('Document totals changed while preparing the output. Reopen the document and retry so the PDF uses the exact reviewed amounts.','تغيّرت أرقام المستند أثناء تجهيز الإخراج. أعد فتح المستند وحاول مرة أخرى لضمان أن يستخدم PDF نفس الأرقام التي تمت مراجعتها.'));
}

interface State {
  loading:boolean; firstRun:boolean; unlocked:boolean; vault:VaultPayload|null;
  screen:'home'|'documents'|'customers'|'receivables'|'reports'|'items'|'operations'|'editor'; editorDoc:LourexDocument|null; settingsOpen:boolean; newMenu:boolean;
  documentsInitialStatus:'all'|'draft';
  reportsPeriod:{from:string;to:string}|null;reportsPeriodVersion:number;
  deletingDoc:LourexDocument|null; toast:string; toastTone:'default'|'success'|'error'; printDoc:LourexDocument|null;
  publicLogo:string; uiLanguage:UiLanguage;
  cloudUser:CloudUser|null; cloudLinked:boolean; cloudModal:boolean; cloudSyncState:CloudSyncState; cloudSyncMessage:string;
  catalogLauncher:CatalogLauncher; catalogSourceId:string;
  recurringOpen:boolean; recurringFilter:'all'|RecurringTarget; recurringSourceDocumentId:string; recurringSourcePurchaseId:string;
}

export class App extends React.Component<{},State> {
  state:State={loading:true,firstRun:false,unlocked:false,vault:null,screen:'home',editorDoc:null,settingsOpen:false,newMenu:false,documentsInitialStatus:'all',reportsPeriod:null,reportsPeriodVersion:0,deletingDoc:null,toast:'',toastTone:'default',printDoc:null,publicLogo:'./brand/lourex-logo.svg',uiLanguage:'en',cloudUser:null,cloudLinked:false,cloudModal:false,cloudSyncState:'local',cloudSyncMessage:'',catalogLauncher:'',catalogSourceId:'',recurringOpen:false,recurringFilter:'all',recurringSourceDocumentId:'',recurringSourcePurchaseId:''};
  private lockTimer:number|undefined;
  private toastTimer:number|undefined;
  private cloudTimer:number|undefined;
  private cloudSyncRunning=false;
  private cloudSyncQueued=false;
  private cloudReconcileRunning=false;
  private cloudReconcileQueued=false;
  private deferredRemoteTimer:number|undefined;
  private cloudRetryDelay=5_000;
  private lastCloudSyncedAt='';
  private lastActivityTouch=0;
  private latestEncryptedVault:EncryptedVaultRecord|null=null;
  private deliveryCreations=new Set<string>();
  private deliveryInvoiceCreations=new Set<string>();
  private purchaseOrderCreations=new Set<string>();
  private quoteConversions=new Set<string>();
  private creditCreations=new Set<string>();
  private vaultWriteTail:Promise<VaultPayload|null>=Promise.resolve(null);
  private vaultReplacing=false;
  private documentCreateBusy=false;
  private accountTransitionRunning=false;
  /** Invalidates in-flight business actions across Firebase sessions, without a CryptoKey or PIN. */
  private accountEpoch=0;
  private recurringProcessRunning=false;

  componentDidMount():void{
    void this.initialize();
    ['pointerdown','keydown','touchstart'].forEach(ev=>window.addEventListener(ev,this.activity,{passive:true}));
    document.addEventListener('visibilitychange',this.handleVisibilityChange);
    document.addEventListener('pointerdown',this.closeTransientMenus);
    document.addEventListener('keydown',this.closeTransientMenusOnEscape);
    window.addEventListener('afterprint',this.afterPrint);
    window.addEventListener('online',this.handleOnline);
    window.addEventListener('lourex-cloud-remote-newer',this.handleRemoteCloudNewer);
    window.addEventListener('lourex-cloud-conflict',this.handleCloudConflict);
    window.addEventListener('lourex-account-transition-request',this.handleAccountTransitionRequest as EventListener);
  }
  componentDidUpdate(_previousProps:Readonly<{}>,previousState:Readonly<State>):void{
    if(!this.cloudReconcileQueued||this.cloudReconcileRunning||this.vaultReplacing||
       !this.state.unlocked||!this.state.cloudUser||this.cloudReplaceBlocked())return;
    // Retry only after a meaningful UI transition; cloudSyncNow handles
    // in-flight writes and serializes application state with IndexedDB.
    if(previousState.screen===this.state.screen&&
       previousState.settingsOpen===this.state.settingsOpen&&
       previousState.cloudModal===this.state.cloudModal)return;
    this.cloudReconcileQueued=false;
    window.setTimeout(()=>void this.cloudSyncNow().catch(error=>this.retryCloudSync(error)),0);
  }
  componentWillUnmount():void{
    if(this.deferredRemoteTimer){window.clearTimeout(this.deferredRemoteTimer);this.deferredRemoteTimer=undefined;}
    ['pointerdown','keydown','touchstart'].forEach(ev=>window.removeEventListener(ev,this.activity));
    document.removeEventListener('visibilitychange',this.handleVisibilityChange);
    document.removeEventListener('pointerdown',this.closeTransientMenus);
    document.removeEventListener('keydown',this.closeTransientMenusOnEscape);
    window.removeEventListener('afterprint',this.afterPrint);
    window.removeEventListener('online',this.handleOnline);
    window.removeEventListener('lourex-cloud-remote-newer',this.handleRemoteCloudNewer);
    window.removeEventListener('lourex-cloud-conflict',this.handleCloudConflict);
    window.removeEventListener('lourex-account-transition-request',this.handleAccountTransitionRequest as EventListener);
    if(this.lockTimer)clearTimeout(this.lockTimer);
    if(this.toastTimer)clearTimeout(this.toastTimer);
    if(this.cloudTimer)clearTimeout(this.cloudTimer);
  }

  /** Firebase is the only interactive login boundary. Legacy encrypted records
   * remain stored but are neither unlocked nor installed into the clean account.
   */
  private initialize=async()=>{
    this.accountEpoch++;
    try{
      const preferences=await getPublicPreferences();
      let uiLanguage=preferences?.uiLanguage??'en';
      const publicLogo=preferences?.logoDataUrl||'./brand/lourex-logo.svg';
      setUiLanguage(uiLanguage);
      const user=await waitForCloudUser();
      if(!user){
        this.setState({loading:false,firstRun:true,unlocked:false,vault:null,uiLanguage,publicLogo,cloudUser:null,cloudLinked:false,cloudSyncState:'local',cloudSyncMessage:''});
        return;
      }
      if(activeAccountStorageUid()!==user.uid){
        setActiveAccountUid(user.uid);
        await activateAccountStorage(user.uid);
      }
      let local=await getPlainWorkspace();
      let syncState:CloudSyncState='local';
      let syncMessage='';
      const online=typeof navigator==='undefined'||navigator.onLine;
      if(online){
        try{
          const result=await reconcilePlainCloudWorkspace(user.uid);
          if(result==='retry'){
            syncState='queued';
            syncMessage=t('A newer local edit is pending. Firebase will retry safely.','هناك تعديل محلي أحدث بانتظار المزامنة. ستُعاد المحاولة بأمان.');
          }else if(result==='diverged'){
            if(!local){
              throw new Error('Cloud account changed while starting. Reload to retry safely.');
            }
            syncState='conflict';
            syncMessage=t('This device and the cloud have different saved changes. Neither was overwritten.','هناك تعديلات مختلفة محفوظة في الجهاز والسحابة. لم يتم استبدال أي نسخة.');
          }else if(result!=='empty'){
            syncState=result==='pushed'?'synced':'synced';
            syncMessage=t('Cloud workspace ready.','مساحة العمل السحابية جاهزة.');
          }
          local=await getPlainWorkspace();
        }catch(error){
          if(!local)throw error;
          syncState='error';
          syncMessage=error instanceof Error?error.message:String(error);
        }
      }else if(!local){
        throw new Error(t('Connect to the internet once to initialize your LOUREX account.','اتصل بالإنترنت مرة واحدة لتهيئة حساب LOUREX.'));
      }else{
        syncState='offline';
        syncMessage=t('Offline. Changes are saved on this device until your account reconnects.','غير متصل. تُحفظ التعديلات على هذا الجهاز حتى يعود الاتصال بالحساب.');
      }
      if(!local){
        // Cloud-first bootstrap: do NOT create an authoritative local blank
        // until the server has committed it. A simultaneous second device
        // must never strand this browser with a divergent empty local record.
        if(!online)throw new Error('Internet connection is required to start a new account.');
        const existing=await getPlainCloudMeta(user.uid);
        if(existing)throw new Error('Cloud workspace appeared during initialization. Retry to restore it.');
        const blank=emptyVault();
        blank.appSettings={...blank.appSettings,autoLockMinutes:0};
        const proposal:PlainWorkspaceRecord={
          id:'workspace-v2',uid:user.uid,payload:blank,schemaVersion:blank.schemaVersion,
          updatedAt:new Date().toISOString(),localRevision:crypto.randomUUID(),
          baseCloudRevision:null,baseCloudSha256:null
        };
        const outcome=await uploadPlainCloudWorkspace(user.uid,proposal);
        if(outcome==='remote-changed'){
          // Two fresh devices may bootstrap the same Firebase UID at once.
          // The losing device must hydrate the verified winning revision,
          // not turn a safe CAS race into an account-blocking reload prompt.
          const winner=await reconcilePlainCloudWorkspace(user.uid);
          if(winner!=='pulled'&&winner!=='same')
            throw new Error('Another device is preparing your account. Retry in a moment.');
        }else{
          const committed=await getPlainCloudMeta(user.uid);
          if(!committed)throw new Error('Cloud workspace could not be verified after setup.');
          const accepted=await replacePlainWorkspaceIfUnchanged(user.uid,null,{
            ...proposal,baseCloudRevision:committed.revision,baseCloudSha256:committed.sha256
          });
          if(!accepted)throw new Error('Another browser tab created local data while setup completed. Retry safely.');
        }
        syncState='synced';
        syncMessage=t('Your Firebase workspace is ready.','مساحة Firebase الخاصة بك جاهزة.');
        local=await getPlainWorkspace();
      }
      if(!local)throw new Error('The account workspace is unavailable.');
      if(currentCloudUser()?.uid!==user.uid||activeAccountStorageUid()!==user.uid)
        throw new Error('Account identity changed while opening the workspace.');
      const vault=this.normalizedVault(local.payload);
      uiLanguage=vault.appSettings.uiLanguage??uiLanguage;
      setUiLanguage(uiLanguage);
      this.vaultWriteTail=Promise.resolve(vault);
      await putCloudAccount(user.uid,user.email);
      this.setState({loading:false,firstRun:false,unlocked:true,vault,
        uiLanguage,publicLogo:vault.company.logoDataUrl||publicLogo,cloudUser:user,cloudLinked:true,
        cloudSyncState:syncState,cloudSyncMessage:syncMessage,screen:'home',editorDoc:null},
        ()=>{
          // Firebase auth can resolve before the account database is selected.
          // Tell the cloud observer that the UID-scoped workspace is now ready.
          window.dispatchEvent(new Event('lourex-cloud-account-ready'));
          if(syncState!=='conflict'&&syncState!=='synced')this.scheduleCloudSync(500);
          void this.processDueRecurringWorkflows(true);
        });
    }catch(error){
      this.setState({loading:false,firstRun:false,unlocked:false,vault:null,
        cloudUser:currentCloudUser(),cloudLinked:false,cloudSyncState:'error',
        cloudSyncMessage:error instanceof Error?error.message:String(error)});
    }
  };

  private activity=()=>{
    if(!this.state.unlocked)return;
    const now=Date.now();
    if(now-this.lastActivityTouch<15_000)return;
    this.lastActivityTouch=now;
    touchSession(now);
    this.resetAutoLock();
  };
  private handleAccountTransitionRequest=(event:Event)=>{
    const requested=(event as CustomEvent<{uid?:string|null}>).detail?.uid;
    if(requested===undefined||this.accountTransitionRunning)return;
    const uid=requested===null?null:String(requested).trim();
    if(uid==='')return;
    this.accountTransitionRunning=true;
    // Mask the outgoing account immediately, including when a pending cloud
    // operation takes time to settle. Preserve the key until queued local
    // writes have drained; revoke it before activating another account scope.
    this.setState({loading:true,newMenu:false,settingsOpen:false,cloudModal:false});
    void (async()=>{
      try{
        if(this.cloudTimer){window.clearTimeout(this.cloudTimer);this.cloudTimer=undefined;}
        this.cloudSyncQueued=false;
        await this.drainVaultWrites();
        await this.waitForCloudIdle();
        // The outgoing account's CryptoKey must be invalidated *before*
        // changing the IndexedDB scope. Never erase the encrypted vault.
        await suspendSession();
        this.accountEpoch++;
        setActiveAccountUid(uid);
        await activateAccountStorage(uid);
        await suspendSession();
        this.latestEncryptedVault=null;
        this.vaultWriteTail=Promise.resolve(null);
        await new Promise<void>(resolve=>this.setState({loading:true,unlocked:false,vault:null,screen:'home',editorDoc:null,settingsOpen:false,newMenu:false,cloudModal:false,cloudUser:null,cloudLinked:false,cloudSyncState:'local',cloudSyncMessage:'',catalogLauncher:'',catalogSourceId:'',recurringOpen:false,recurringFilter:'all',recurringSourceDocumentId:'',recurringSourcePurchaseId:''},resolve));
        await this.initialize();
      }catch(error){
        // Fail closed: a rejected or interrupted account transition may not
        // leave the previous decrypted workspace accessible.
        await suspendSession();
        this.latestEncryptedVault=null;
        this.vaultWriteTail=Promise.resolve(null);
        this.setState({loading:false,unlocked:false,vault:null,screen:'home',editorDoc:null,newMenu:false,cloudSyncState:'error',cloudSyncMessage:friendlyCloudError(error)});
      }finally{
        this.accountTransitionRunning=false;
        window.dispatchEvent(new CustomEvent('lourex-account-transition-complete',{detail:{uid}}));
      }
    })();
  };
  private handleOnline=()=>{
    if(this.state.unlocked&&!this.cloudReplaceBlocked())
      void this.cloudSyncNow().catch(error=>this.retryCloudSync(error));
    else this.scheduleCloudSync(300);
  };
  private handleCloudConflict=()=>{if(this.cloudTimer){window.clearTimeout(this.cloudTimer);this.cloudTimer=undefined;}this.cloudSyncQueued=false;this.setState({cloudSyncState:'conflict',cloudSyncMessage:t('This device and the cloud both contain newer changes. Neither copy was overwritten. Choose which copy to keep.','يحتوي هذا الجهاز والسحابة على تعديلات أحدث. لم يتم استبدال أي نسخة. اختر النسخة التي تريد الاحتفاظ بها.')});};
  private announceRemoteCloudUpdate=()=>{if(!this.state.cloudUser||!this.state.cloudLinked||this.state.cloudSyncState==='conflict')return;this.deferRemoteCloud();try{window.dispatchEvent(new Event('lourex-cloud-refresh-available'));}catch{}};
  private retryDeferredRemoteHydration=()=>{
    if(this.deferredRemoteTimer||!this.cloudReconcileQueued)return;
    this.deferredRemoteTimer=window.setTimeout(()=>{
      this.deferredRemoteTimer=undefined;
      if(!this.cloudReconcileQueued)return;
      if(!this.state.unlocked||!this.state.cloudUser){this.cloudReconcileQueued=false;return;}
      // An inline customer/inventory editor can clear its DOM dirty flag
      // without causing a BaseApp setState. The bounded retry ensures cloud
      // refresh resumes when it is safe rather than remaining queued forever.
      if(this.cloudReplaceBlocked()||this.cloudSyncRunning||
         this.cloudReconcileRunning||this.vaultReplacing){
        this.retryDeferredRemoteHydration();return;
      }
      this.cloudReconcileQueued=false;
      void this.cloudSyncNow().catch(error=>this.retryCloudSync(error));
    },2000);
  };
  private handleRemoteCloudNewer=()=>{
    if(!this.state.cloudUser||!this.state.cloudLinked||!this.state.unlocked)return;
    if(this.cloudReplaceBlocked()||this.cloudSyncRunning||this.vaultReplacing){
      // The listener can fire while an invoice editor is active. Remember the
      // pending cloud revision; publishing blindly on editor close would
      // manufacture a conflict even when this device has no unsynced edits.
      this.cloudReconcileQueued=true;
      this.retryDeferredRemoteHydration();
      this.announceRemoteCloudUpdate();return;
    }
    void this.cloudSyncNow().catch(error=>this.retryCloudSync(error));
  };
  private handleVisibilityChange=()=>{if(document.visibilityState!=='visible'||!this.state.unlocked)return;touchSession();this.resetAutoLock();this.scheduleCloudSync(120);};
  private closeTransientMenus=(event:PointerEvent)=>{if(!this.state.newMenu)return;const target=event.target;if(target instanceof Element&&target.closest('.ta-create-menu, .new-doc-menu'))return;this.setState({newMenu:false});};
  private closeTransientMenusOnEscape=(event:KeyboardEvent)=>{if(event.key==='Escape'&&this.state.newMenu)this.setState({newMenu:false});};
  private resetAutoLock=()=>{if(this.lockTimer){window.clearTimeout(this.lockTimer);this.lockTimer=undefined;}};
  private showToast=(toast:string,tone:'default'|'success'|'error'='default')=>{if(this.toastTimer)clearTimeout(this.toastTimer);this.setState({toast,toastTone:tone});this.toastTimer=window.setTimeout(()=>this.setState({toast:''}),3600);};
  private normalizedVault=(vault:VaultPayload):VaultPayload=>({...vault,appSettings:{...vault.appSettings,uiLanguage:vault.appSettings.uiLanguage??this.state.uiLanguage??'en'}});
  private syncPublicPreferences=async(logoDataUrl:string,uiLanguage:UiLanguage)=>{const publicLogo=logoDataUrl||'./brand/lourex-logo.svg';setUiLanguage(uiLanguage);this.setState({publicLogo,uiLanguage});try{await putPublicPreferences({logoDataUrl:publicLogo,uiLanguage});}catch{}};
  private changePublicLanguage=async(uiLanguage:UiLanguage)=>{await this.syncPublicPreferences(this.state.publicLogo||'./brand/lourex-logo.svg',uiLanguage);};
  private drainVaultWrites=async()=>{try{await this.vaultWriteTail;}catch{}};
  private waitForCloudIdle=async()=>{while(this.cloudSyncRunning)await new Promise(resolve=>window.setTimeout(resolve,30));};
  private waitForProtectedDataOperation=async()=>{const deadline=Date.now()+30_000;while(this.vaultReplacing){if(!this.state.unlocked||!this.state.cloudUser?.uid||this.state.cloudUser.uid!==activeAccountStorageUid())throw new Error(t('Account session changed. Sign in again.','تغيرت جلسة الحساب. سجّل الدخول مجددًا.'));if(Date.now()>=deadline)throw new Error(t('Cloud restore is still finishing. Try again in a moment.','ما زالت استعادة البيانات السحابية قيد الإنهاء. حاول مرة أخرى بعد لحظة.'));await new Promise(resolve=>window.setTimeout(resolve,50));}};
  private editorMustBeClosed=(actionEn:string,actionAr:string)=>{if(this.state.screen!=='editor')return;throw new Error(t(`Close the document editor before ${actionEn}.`,`أغلق محرر المستند قبل ${actionAr}.`));};
  private beginProtectedOperation=async()=>{if(this.cloudTimer){window.clearTimeout(this.cloudTimer);this.cloudTimer=undefined;}await this.drainVaultWrites();await this.waitForCloudIdle();this.latestEncryptedVault=null;this.vaultReplacing=true;};
  private endProtectedOperation=()=>{this.vaultReplacing=false;};
  private cloudReplaceBlocked=()=>this.state.screen==='editor'||this.state.settingsOpen||this.state.cloudModal;
  private deferRemoteCloud=()=>this.setState({cloudSyncState:'queued',cloudSyncMessage:t('Newer cloud data is available. Apply it when you are ready.','توجد بيانات سحابية أحدث. طبّقها عندما تكون جاهزًا.')});
  private retryCloudSync=(error:unknown)=>{
    const retryDelay=this.cloudRetryDelay;
    this.cloudRetryDelay=Math.min(60_000,this.cloudRetryDelay*2);
    const detail=friendlyCloudError(error);
    this.setState({cloudSyncState:'error',cloudSyncMessage:t(`${detail} Retry scheduled.`,`${detail} ستتم إعادة المحاولة تلقائيًا.`)});
    if(!this.cloudTimer)this.cloudTimer=window.setTimeout(()=>void this.flushCloudSync(),retryDelay);
  };
  private deferQueuedCloudSaveForDocumentEdit=()=>{
    if(this.state.cloudSyncState!=='queued'||!this.cloudTimer)return;
    window.clearTimeout(this.cloudTimer);
    this.cloudTimer=window.setTimeout(()=>void this.flushCloudSync(),CLOUD_EDIT_ACTIVITY_SETTLE_MS);
  };

  private scheduleCloudSync=(delay=CLOUD_SAVE_SETTLE_MS)=>{
    if(!this.state.cloudUser||!this.state.cloudLinked)return;
    if(this.state.cloudSyncState==='conflict')return;
    if(this.cloudTimer)window.clearTimeout(this.cloudTimer);
    const offline=typeof navigator!=='undefined'&&!navigator.onLine;
    this.setState({cloudSyncState:offline?'offline':'queued',cloudSyncMessage:offline?t('Offline — saved locally. Cloud sync will resume automatically.','غير متصل — تم الحفظ محليًا وستُستأنف المزامنة تلقائيًا.'):t('Saved locally — cloud sync queued.','تم الحفظ محليًا — المزامنة السحابية في الانتظار.')});
    this.cloudTimer=window.setTimeout(()=>void this.flushCloudSync(),offline?this.cloudRetryDelay:delay);
  };
  private flushCloudSync=async()=>{
    this.cloudTimer=undefined;
    const user=this.state.cloudUser;
    if(!user||!this.state.cloudLinked||!this.state.unlocked||this.state.cloudSyncState==='conflict')return;
    if(this.vaultReplacing||this.cloudSyncRunning){this.cloudSyncQueued=true;return;}
    if(typeof navigator!=='undefined'&&!navigator.onLine){
      this.setState({cloudSyncState:'offline',cloudSyncMessage:t('Offline — saved on this device.','غير متصل — محفوظ على هذا الجهاز.')});
      return;
    }
    this.cloudSyncRunning=true;
    try{
      await this.drainVaultWrites();
      const local=await getPlainWorkspace();
      if(!local||local.uid!==user.uid)return;
      this.setState({cloudSyncState:'syncing',cloudSyncMessage:t('Saving account data…','جارٍ حفظ بيانات الحساب…')});
      const result=await uploadPlainCloudWorkspace(user.uid,local);
      if(result==='remote-changed'){
        this.setState({cloudSyncState:'conflict',cloudSyncMessage:t('Another device saved changes. Your local work was preserved. Review the account copies.','حفظ جهاز آخر تعديلات. تم الاحتفاظ بعملك المحلي. راجع نسختي الحساب.')});
        return;
      }
      const latest=await getPlainWorkspace();
      if(latest?.localRevision!==local.localRevision){
        this.cloudSyncQueued=true;
        this.setState({cloudSyncState:'queued',cloudSyncMessage:t('Newer local edits are queued.','تعديلات محلية أحدث بانتظار المزامنة.')});
      }else{
        this.cloudRetryDelay=5_000;
        this.setState({cloudSyncState:'synced',cloudSyncMessage:t('Saved to Firebase.','تم الحفظ في Firebase.')});
      }
    }catch(error){this.retryCloudSync(error);}
    finally{
      this.cloudSyncRunning=false;
      if(this.cloudSyncQueued){this.cloudSyncQueued=false;this.scheduleCloudSync(250);}
    }
  };
  private attachCloudUser=async(user:CloudUser)=>{
    if(currentCloudUser()?.uid!==user.uid)throw new Error('Account identity changed. Sign in again.');
    // Firebase may return the same UID after a deliberate sign-out. Its old
    // IndexedDB cache remains selected, but React must STILL rehydrate and
    // authenticate the workspace; the old public gateway is not unlocked.
    const scopeChanged=activeAccountStorageUid()!==user.uid;
    if(scopeChanged){
      setActiveAccountUid(user.uid);
      await activateAccountStorage(user.uid);
    }
    if(scopeChanged||!this.state.unlocked||!this.state.vault||this.state.firstRun||!this.state.cloudLinked){
      await new Promise<void>(resolve=>this.setState({
        loading:true,firstRun:false,unlocked:false,vault:null,cloudUser:user,
        cloudLinked:false,cloudSyncState:'local'
      },resolve));
      await this.initialize();
      if(!this.state.unlocked)throw new Error(this.state.cloudSyncMessage||'Could not open your Firebase workspace.');
      return;
    }
    await putCloudAccount(user.uid,user.email);
    this.setState({cloudUser:user,cloudLinked:true});
    await this.cloudSyncNow();
  };
  private cloudSignIn=async(email:string,password:string)=>{try{const user=await signInCloudUser(email,password);this.setState({cloudUser:user});await this.attachCloudUser(user);}catch(e){throw new Error(friendlyCloudError(e));}};
  private cloudCreate=async(email:string,password:string)=>{try{const user=await createCloudUser(email,password);this.setState({cloudUser:user});await this.attachCloudUser(user);}catch(e){throw new Error(friendlyCloudError(e));}};
  private cloudReset=async(email:string)=>{try{await sendCloudPasswordReset(email);}catch(e){throw new Error(friendlyCloudError(e));}};
  private cloudRestore=async()=>{
    this.editorMustBeClosed('restoring cloud data','استعادة بيانات السحابة');
    await this.beginProtectedOperation();
    try{
      const uid=this.state.cloudUser?.uid;
      if(!uid)throw new Error('Sign in to your LOUREX account first.');
      const remote=await downloadPlainCloudWorkspace(uid);
      if(!remote)throw new Error('There is no cloud account copy.');
      const local=await getPlainWorkspace();
      const current=await getPlainWorkspace();
      const replacement:PlainWorkspaceRecord={
        id:'workspace-v2',uid,payload:remote.payload,schemaVersion:remote.payload.schemaVersion,
        localRevision:crypto.randomUUID(),updatedAt:remote.meta.updatedAt,
        baseCloudRevision:remote.meta.revision,baseCloudSha256:remote.meta.sha256
      };
      const ok=await replacePlainWorkspaceIfUnchanged(uid,current?.localRevision??null,replacement,'replaced-by-cloud');
      if(!ok)throw new Error('Local data changed during cloud restore. Retry to avoid losing edits.');
      const vault=this.normalizedVault(remote.payload);
      this.vaultWriteTail=Promise.resolve(vault);
      this.setState({vault,screen:'home',editorDoc:null,cloudSyncState:'synced',
        cloudSyncMessage:t('Cloud copy restored.','تمت استعادة النسخة السحابية.')});
    }finally{this.endProtectedOperation();}
  };
  private keepLocalCloudCopy=async()=>{
    this.editorMustBeClosed('resolving cloud changes','حل تعارض السحابة');
    await this.beginProtectedOperation();
    try{
      const uid=this.state.cloudUser?.uid;
      if(!uid)throw new Error('Sign in to your account first.');
      const local=await getPlainWorkspace();
      if(!local)throw new Error('Local workspace is unavailable.');
      const result=await uploadPlainCloudWorkspace(uid,local,true);
      if(result==='remote-changed')throw new Error('Cloud changed during conflict resolution. Retry.');
      this.setState({cloudSyncState:'synced',cloudSyncMessage:t('Local copy saved to Firebase.','تم حفظ النسخة المحلية في Firebase.')});
    }finally{this.endProtectedOperation();}
  };
  private cloudSignOut=async()=>{
    await this.drainVaultWrites();
    try{
      await signOutCloudUser();
      this.accountEpoch++;
      if(this.cloudTimer){window.clearTimeout(this.cloudTimer);this.cloudTimer=undefined;}
      this.vaultWriteTail=Promise.resolve(null);
      this.setState({cloudUser:null,cloudLinked:false,firstRun:true,unlocked:false,vault:null,
        cloudSyncState:'local',cloudSyncMessage:'',settingsOpen:false,cloudModal:false});
    }catch(error){throw new Error(friendlyCloudError(error));}
  };
  private cloudSyncNow=async()=>{
    // Cloud pull and React hydration must be one protected operation.
    // Otherwise an edit can land between IndexedDB CAS and UI setState,
    // replacing the user's new in-memory invoice with the older download.
    if(this.cloudReplaceBlocked())return;
    if(this.cloudReconcileRunning||this.vaultReplacing){
      this.cloudReconcileQueued=true;return;
    }
    const uid=this.state.cloudUser?.uid;
    if(!uid)return;
    this.cloudReconcileRunning=true;
    let protectedOperation=false;
    try{
      await this.beginProtectedOperation();
      protectedOperation=true;
      if(this.cloudReplaceBlocked())return;
      if(uid!==this.state.cloudUser?.uid||uid!==currentCloudUser()?.uid||
         uid!==activeAccountStorageUid())
        throw new Error('Account changed during cloud reconciliation.');
      const result=await reconcilePlainCloudWorkspace(uid);
      if(result==='diverged'){this.handleCloudConflict();return;}
      if(result==='retry'){
        this.cloudSyncQueued=true;
        this.setState({cloudSyncState:'queued',cloudSyncMessage:t('Checking newer edits before syncing.','جارٍ التحقق من التعديلات الأحدث قبل المزامنة.')});
        return;
      }
      if(result==='pulled'){
        const local=await getPlainWorkspace();
        if(local){
          const vault=this.normalizedVault(local.payload);
          this.vaultWriteTail=Promise.resolve(vault);
          await new Promise<void>(resolve=>this.setState({vault,editorDoc:null,cloudSyncState:'synced',
            cloudSyncMessage:t('Cloud updates loaded.','تم تحميل تحديثات السحابة.')},resolve));
        }
      }else if(result==='pushed'||result==='same'){
        this.setState({cloudSyncState:'synced',cloudSyncMessage:t('Cloud is up to date.','السحابة محدثة.')});
      }
    }finally{
      if(protectedOperation)this.endProtectedOperation();
      this.cloudReconcileRunning=false;
      if(this.cloudSyncQueued){
        this.cloudSyncQueued=false;
        this.scheduleCloudSync(250);
      }
      if(this.cloudReconcileQueued){
        this.cloudReconcileQueued=false;
        window.setTimeout(()=>void this.cloudSyncNow().catch(error=>this.retryCloudSync(error)),0);
      }
    }
  };

  // Account access is provided by Firebase Auth; there is no device PIN or lock.
  private lock=()=>{};
  private lockNow=async(_automatic:boolean)=>{};
  private persist=async(intended:VaultPayload)=>{
    const base=this.requireVault();
    const operation=this.vaultWriteTail.catch(()=>null).then(async queued=>{
      await this.waitForProtectedDataOperation();
      const uid=this.state.cloudUser?.uid;
      if(!uid||uid!==currentCloudUser()?.uid||uid!==activeAccountStorageUid())throw new Error('Account session changed. Save was not applied.');
      const latestFull=queued??this.state.vault;
      if(!latestFull)throw new Error('Workspace is not ready.');
      const local=await getPlainWorkspace();
      if(!local)throw new Error('Local account workspace is unavailable.');
      const latest=scopeVault(latestFull);
      const scopedIntended=applyWorkspaceScope(base,intended);
      const merged=mergeVaultIntent(base,scopedIntended,latest);
      const audited=appendAuditEventsForVaultDiff(latest,merged);
      const next=synchronizeActiveWorkspaceOnSave(overlayWorkspaceScope(latestFull,audited));
      assertPlainCloudWorkspaceUploadable(next);
      const stored=await updatePlainWorkspaceIfUnchanged(uid,local.localRevision,next);
      if(!stored)throw new Error('Another tab updated this account. Refresh before saving to avoid overwriting its work.');
      if(this.state.unlocked&&this.state.cloudUser?.uid===uid)
        await new Promise<void>(resolve=>this.setState({vault:next},resolve));
      this.scheduleCloudSync();
      return next;
    });
    this.vaultWriteTail=operation;await operation;
  };
  private persistFullMutation=async(mutation:(vault:VaultPayload)=>VaultPayload)=>{
    const operation=this.vaultWriteTail.catch(()=>null).then(async queued=>{
      await this.waitForProtectedDataOperation();
      const uid=this.state.cloudUser?.uid;
      if(!uid||uid!==currentCloudUser()?.uid||uid!==activeAccountStorageUid())throw new Error('Account session changed.');
      const local=await getPlainWorkspace();
      if(!local)throw new Error('Local account workspace is unavailable.');
      const latest=queued??this.state.vault;
      if(!latest)throw new Error('Workspace is not ready.');
      const next=synchronizeActiveWorkspaceOnSave(mutation(latest));
      assertPlainCloudWorkspaceUploadable(next);
      const stored=await updatePlainWorkspaceIfUnchanged(uid,local.localRevision,next);
      if(!stored)throw new Error('Another tab saved changes. Refresh before continuing.');
      if(this.state.unlocked&&this.state.cloudUser?.uid===uid)
        await new Promise<void>(resolve=>this.setState({vault:next},resolve));
      this.scheduleCloudSync();
      return next;
    });
    this.vaultWriteTail=operation;await operation;
  };
  private reserveDocument=async(kind:DocumentKind):Promise<{doc:LourexDocument;vault:VaultPayload;reservation:Promise<void>}>=>{if(this.vaultReplacing)await this.waitForProtectedDataOperation();const vault=this.requireVault();const next=nextDocumentNumber(vault,kind);const reservation=this.persist(next.vault);const current=next.vault;const smart=current.appSettings.smartDefaults;const base=createBlankDocument(kind,next.number,current.company);const paymentTerms=smart.paymentTerms||base.terms.paymentTerms;let doc={...base,currency:smart.currency||base.currency,language:smart.language||base.language,terms:{...base.terms,incoterm:smart.incoterm,paymentTerms,deliveryTime:smart.deliveryTime},appearance:{...base.appearance,templateId:(kind==='proforma'||kind==='proforma-invoice'||kind==='rfq')?smart.quoteTemplateId:kind==='invoice'?smart.invoiceTemplateId:base.appearance.templateId}};const paymentPreset=paymentTermPresetByLabel(current.company,paymentTerms);if(paymentPreset&&(kind==='invoice'||kind==='proforma'||kind==='proforma-invoice'))doc=applyPaymentTermPreset(doc,paymentPreset);return{doc,vault:current,reservation};};
  private newDocument=async(kind:DocumentKind)=>{if(this.documentCreateBusy||!confirmWorkspaceDeparture())return;this.documentCreateBusy=true;document.documentElement.setAttribute('data-lourex-document-editor','opening');this.setState({newMenu:false});try{const {doc,vault,reservation}=await this.reserveDocument(kind);await reservation;await this.persist({...vault,documents:[...vault.documents,doc]});await new Promise<void>(resolve=>this.setState({screen:'editor',editorDoc:doc,newMenu:false},resolve));}catch(e){document.documentElement.removeAttribute('data-lourex-document-editor');this.showToast(e instanceof Error?e.message:t('Unable to create document.','تعذر إنشاء المستند.'),'error');}finally{this.documentCreateBusy=false;}};
  private newDocumentForCustomer=async(kind:DocumentKind,customer:Customer)=>{if(this.documentCreateBusy||!confirmWorkspaceDeparture())return;this.documentCreateBusy=true;document.documentElement.setAttribute('data-lourex-document-editor','opening');try{const {doc,vault,reservation}=await this.reserveDocument(kind);await reservation;const prepared=applyCustomerCommercialDefaults({...doc,customerSnapshot:customerSnapshotFrom(customer)},customer,vault.company);await this.persist({...vault,documents:[...vault.documents,prepared]});await new Promise<void>(resolve=>this.setState({screen:'editor',editorDoc:prepared,newMenu:false},resolve));}catch(e){document.documentElement.removeAttribute('data-lourex-document-editor');throw e instanceof Error?e:new Error(t('Unable to create document.','تعذر إنشاء المستند.'));}finally{this.documentCreateBusy=false;}};
  private saveDocument=async(doc:LourexDocument,auto=false)=>{const vault=this.requireVault();if(doc.kind==='delivery-note'&&confirmedSalesDeliveries(doc.id,vault.documentEvents).length)throw new Error(t('A confirmed Delivery Note is locked to preserve delivery evidence.','سند التسليم المؤكد مقفل لحماية إثبات التسليم.'));if(salesOrderForQuotation(doc.id,vault.documentEvents))throw new Error(t('A quotation with an accepted Sales Order is locked. Preserve the original commitment.','عرض السعر المرتبط بأمر بيع معتمد مقفل للحفاظ على الالتزام الأصلي.'));if(vault.documents.some(d=>d.id!==doc.id&&d.number.trim().toLowerCase()===doc.number.trim().toLowerCase()))throw new Error(t('Document number already exists.','رقم المستند مستخدم بالفعل.'));const index=vault.documents.findIndex(d=>d.id===doc.id);const existing=index>=0?vault.documents[index]:undefined;if(existing?.status==='final'&&isDeliveryLinkedInvoice(existing.id,vault.documentEvents))throw new Error(t('This issued delivery-linked invoice is immutable. Use a Credit Note for financial corrections.','الفاتورة الصادرة المرتبطة بالتسليم ثابتة. استخدم إشعارًا دائنًا للتصحيحات المالية.'));if(existing?.lifecycleStatus==='voided')throw new Error(t('Voided documents are locked permanently.','المستندات الملغاة مقفلة بشكل دائم.'));const documents=[...vault.documents];const updated={...doc,role:doc.role||'standard',lifecycleStatus:doc.lifecycleStatus||'active',revision:Math.max(1,doc.revision||1),creditForId:doc.creditForId||'',creditForNumber:doc.creditForNumber||'',voidedAt:doc.voidedAt||'',voidReason:doc.voidReason||'',bankAccountId:doc.bankAccountId||'',paymentTermPresetId:doc.paymentTermPresetId||'',updatedAt:new Date().toISOString()};if(updated.status==='final'&&existing?.status!=='final'){const gate=approvalGate(vault,{action:'issue-document',entityType:'document',entityId:updated.id,entityLabel:updated.number,entityUpdatedAt:existing?.updatedAt||''});if(!gate.allowed){if(gate.created)await this.persist(gate.vault);throw new Error(t('Approval is required before this document can be issued. Open Settings → Access to approve the request.','يلزم الحصول على موافقة قبل إصدار هذا المستند. افتح الإعدادات ← الوصول للموافقة على الطلب.'));}assertCustomerCreditLimit(updated,vault.customers,vault.documents,vault.payments);}assertInvoicePaymentInvariant(updated,vault.payments,vault.documents);if(index>=0)documents[index]=updated;else documents.push(updated);assertDocumentLifecycleInvariant(updated,documents,vault.payments);let documentEvents=vault.documentEvents;if(!existing){documentEvents=[...documentEvents,createDocumentEvent(updated,'created')];if(updated.status==='final')documentEvents=[...documentEvents,createDocumentEvent(updated,updated.revision>1?'reissued':'issued')];}else if(existing.status==='draft'&&updated.status==='final')documentEvents=[...documentEvents,createDocumentEvent(updated,updated.revision>1?'reissued':'issued')];const updatesSmartDefaults=!auto&&documentUsesCommercialDefaults(updated.kind);const templateDefault=(updated.kind==='proforma'||updated.kind==='proforma-invoice'||updated.kind==='rfq')?{quoteTemplateId:updated.appearance.templateId}:updated.kind==='invoice'?{invoiceTemplateId:updated.appearance.templateId}:{};const appSettings=updatesSmartDefaults?{...vault.appSettings,smartDefaults:{...vault.appSettings.smartDefaults,currency:updated.currency,language:updated.language,incoterm:updated.terms.incoterm,paymentTerms:updated.terms.paymentTerms,deliveryTime:updated.terms.deliveryTime,...templateDefault}}:vault.appSettings;assertDeliveryInvoiceIntegrity(documents,documentEvents);const stock=updated.kind==='invoice'&&updated.status==='final'&&existing?.status!=='final'?postIssuedInvoiceStock({...vault,documents,documentEvents},updated):{vault,created:false};await this.persist({...stock.vault,documents,documentEvents,appSettings});if(!auto)this.setState({editorDoc:updated});if(!auto)this.showToast(updated.kind==='draft'?t('Company draft saved.','تم حفظ مسودة الشركة.'):updatesSmartDefaults?t('Document saved. Smart defaults updated.','تم حفظ المستند وتحديث الإعدادات الذكية.'):t('Document saved.','تم حفظ المستند.'),'success');};
  private beginRevision=async(source:LourexDocument):Promise<LourexDocument>=>{const vault=this.requireVault();if(source.kind==='delivery-note'&&confirmedSalesDeliveries(source.id,vault.documentEvents).length)throw new Error(t('A confirmed Delivery Note cannot be revised.','لا يمكن تعديل سند التسليم المؤكد.'));if(isDeliveryLinkedInvoice(source.id,vault.documentEvents))throw new Error(t('An issued delivery-linked invoice cannot be revised. Correct it using a Credit Note.','لا يمكن مراجعة فاتورة صادرة مرتبطة بالتسليم. استخدم إشعارًا دائنًا للتصحيح.'));if(salesOrderForQuotation(source.id,vault.documentEvents))throw new Error(t('An accepted Sales Order locks this quotation against revision.','أمر البيع المعتمد يمنع مراجعة عرض السعر المرتبط به.'));const current=vault.documents.find(doc=>doc.id===source.id)??source;if(current.kind==='invoice'&&vault.inventoryMovements.some(m=>m.sourceId===current.id&&isIssuedInvoiceStockIssue(m)))throw new Error(t('Issued stock is immutable. Correct with an auditable stock reversal before revising.','صرف المخزون الصادر ثابت، ويلزم عكسه بحركة موثقة قبل مراجعة الفاتورة.'));if(current.kind==='invoice'&&current.role==='standard'){const exposure=invoiceCreditCapacity(current,vault.documents,vault.payments);if(exposure.paid!=='0.00'||exposure.credited!=='0.00')throw new Error(t('An invoice with payments or issued credit notes cannot be revised. Use a credit note for financial corrections.','لا يمكن مراجعة فاتورة عليها دفعات أو إشعارات دائنة صادرة. استخدم إشعارًا دائنًا للتصحيح المالي.'));}const draft=beginRevisionDraft(current);const revision=createRevisionRecord(current);const documents=vault.documents.map(doc=>doc.id===current.id?draft:doc);const documentRevisions=[...vault.documentRevisions,revision];const documentEvents=[...vault.documentEvents,createDocumentEvent(current,'revision-started',t(`Revision ${draft.revision} started.`,`بدأت المراجعة ${draft.revision}.`))];await this.persist({...vault,documents,documentRevisions,documentEvents});this.setState({editorDoc:draft});return draft;};
  private discardRevision=async(source:LourexDocument)=>{const vault=this.requireVault();const restored=restoreRevisionSnapshot(source,vault.documentRevisions);const documents=vault.documents.map(doc=>doc.id===source.id?restored:doc);const documentEvents=[...vault.documentEvents,createDocumentEvent(restored,'revision-discarded',t(`Revision ${source.revision} discarded.`,`تم إلغاء المراجعة ${source.revision}.`))];await this.persist({...vault,documents,documentEvents});this.setState({editorDoc:restored});this.showToast(t('Revision discarded. Previous final restored.','تم إلغاء المراجعة واستعادة النسخة النهائية السابقة.'),'success');};
  private voidDocument=async(source:LourexDocument,reason:string,evidence?:DocumentAttachment)=>{const vault=this.requireVault();const current=vault.documents.find(doc=>doc.id===source.id)??source;if(confirmedSalesDeliveries(current.id,vault.documentEvents).length)throw new Error(t('A confirmed Delivery Note cannot be cancelled without a dedicated correction.','لا يمكن إلغاء سند تسليم مؤكد دون إجراء تصحيح مخصص.'));if(isDeliveryLinkedInvoice(current.id,vault.documentEvents))throw new Error(t('A delivery-linked invoice cannot be voided. Use a Credit Note to correct an issued invoice while retaining proof of delivery.','لا يمكن إلغاء فاتورة مرتبطة بالتسليم. استخدم إشعارًا دائنًا لتصحيح فاتورة صادرة مع الحفاظ على إثبات التسليم.'));if(salesOrderForQuotation(current.id,vault.documentEvents))throw new Error(t('An accepted Sales Order locks the original quotation.','أمر البيع المعتمد يمنع إلغاء عرض السعر الأصلي.'));if(current.role==='credit-note'&&vault.inventoryMovements.some(m=>m.salesReturn?.creditNoteId===current.id))throw new Error(t('This credit note has physically received stock and cannot be voided without an audited return correction.','هذا الإشعار الدائن مرتبط ببضاعة مرتجعة فعلًا ولا يمكن إلغاؤه دون تصحيح مخزني موثق.'));const hasPostedStock=current.kind==='invoice'&&current.role==='standard'&&vault.inventoryMovements.some(m=>m.sourceId===current.id&&isIssuedInvoiceStockIssue(m));const posted=hasPostedStock?postVoidedInvoiceWithPhysicalReceipt(vault,current,{reason,evidence:evidence!,operatorId:activeTeamMember(vault).id}):null;const voided=posted?.document??voidFinalDocument(current,reason,vault.documents,vault.payments);const documents=posted?.vault.documents??vault.documents.map(doc=>doc.id===current.id?voided:doc);const documentEvents=[...vault.documentEvents,createDocumentEvent(voided,'voided',reason)];await this.persist({...vault,...(posted?.vault??{}),documents,documentEvents});this.setState({editorDoc:voided});this.showToast(current.kind==='proforma'?t('Quote cancelled.','تم إلغاء عرض السعر.'):t('Document voided.','تم إلغاء المستند.'),'success');};
  private createCreditNote=async(source:LourexDocument)=>{if(this.creditCreations.has(source.id))return;this.creditCreations.add(source.id);try{const vault=this.requireVault();const current=vault.documents.find(doc=>doc.id===source.id)??source;const capacity=invoiceCreditCapacity(current,vault.documents,vault.payments);if(capacity.available==='0.00')throw new Error(t('No remaining invoice balance is available to credit.','لا يوجد رصيد متبقٍ في الفاتورة لإصدار إشعار دائن.'));const numbered=nextCreditNoteNumber(vault);const credit=createCreditNoteDraft(current,numbered.number,capacity.available);const documents=[...numbered.vault.documents,credit];assertDocumentLifecycleInvariant(credit,documents,vault.payments);const documentEvents=[...vault.documentEvents,createDocumentEvent(current,'credit-note-created','',credit),createDocumentEvent(credit,'created','',current)];await this.persist({...numbered.vault,documents,documentEvents});this.setState({screen:'editor',editorDoc:credit});this.showToast(t(`Created ${credit.number}.`,`تم إنشاء ${credit.number}.`),'success');}finally{this.creditCreations.delete(source.id);}};
  private launchCreditNote=(source:LourexDocument)=>{void this.createCreditNote(source).catch(e=>this.showToast(e instanceof Error?e.message:t('Unable to create credit note.','تعذر إنشاء إشعار دائن.'),'error'));};
  private saveSmartDefaults=async(smartDefaults:AppSettings['smartDefaults'])=>{const vault=this.requireVault();await this.persist({...vault,appSettings:{...vault.appSettings,smartDefaults}});};
  private saveSavedItem=async(item:SavedItem)=>{const vault=this.requireVault();const current=vault.savedItems.find(existing=>existing.id===item.id);const identityChanged=!current||normalizeSavedItemIdentity(current.descriptionEn)!==normalizeSavedItemIdentity(item.descriptionEn)||normalizeSavedItemIdentity(current.descriptionAr)!==normalizeSavedItemIdentity(item.descriptionAr);const duplicate=identityChanged?findSavedItemDuplicate(vault.savedItems,item):undefined;if(duplicate)throw new Error(t('This item already exists. Open the existing item to edit it.','هذا الصنف موجود بالفعل. افتح الصنف الموجود لتعديله.'));const index=vault.savedItems.findIndex(x=>x.id===item.id);const savedItems=[...vault.savedItems];if(index>=0)savedItems[index]={...item,updatedAt:new Date().toISOString()};else savedItems.push(item);await this.persist({...vault,savedItems});this.showToast(t('Item saved to product library.','تم حفظ الصنف في مكتبة الأصناف.'),'success');};
  private saveSavedItemsBatch=async(items:SavedItem[])=>{if(!items.length)return;const vault=this.requireVault();const savedItems=[...vault.savedItems];const updatedAt=new Date().toISOString();for(const source of items){const item={...source,sku:(source.sku??'').trim().toUpperCase(),lastCurrency:(source.lastCurrency||vault.appSettings.smartDefaults.currency||'USD').trim().toUpperCase(),category:(source.category??'').trim(),tags:Array.from(new Set((source.tags??[]).map(tag=>tag.trim()).filter(Boolean))),favorite:Boolean(source.favorite),updatedAt};const duplicate=findSavedItemDuplicate(savedItems,item);if(duplicate)throw new Error(t(`Import conflict: ${item.sku||item.descriptionEn||item.descriptionAr} matches an existing product.`,`تعارض في الاستيراد: ${item.sku||item.descriptionEn||item.descriptionAr} يطابق صنفًا موجودًا.`));const index=savedItems.findIndex(existing=>existing.id===item.id);if(index>=0)savedItems[index]=item;else savedItems.push(item);}await this.persist({...vault,savedItems});this.showToast(t(`${items.length} products imported in one secure update.`,`تم استيراد ${items.length} صنف ضمن تحديث آمن واحد.`),'success');};
  private saveDocumentItem=async(item:LourexDocument['items'][number],currency:string)=>{const vault=this.requireVault();const existing=findSavedItemMatch(vault.savedItems,item);await this.saveSavedItem(savedItemFromDocumentItem(item,currency,existing));};
  private useSavedItems=async(items:SavedItem[])=>{const vault=this.requireVault();await this.persist({...vault,savedItems:markSavedItemsUsed(vault.savedItems,items)});};
  private deleteSavedItem=async(item:SavedItem)=>{const vault=this.requireVault();if(vault.inventoryMovements.some(movement=>movement.itemId===item.id)||vault.purchases.some(purchase=>purchase.items.some(line=>line.savedItemId===item.id)))throw new Error(t('This item has purchase or inventory history and cannot be deleted. Keep it for audit continuity.','لهذا الصنف سجل مشتريات أو مخزون ولا يمكن حذفه. احتفظ به لاستمرارية سجل التدقيق.'));await this.persist({...vault,savedItems:vault.savedItems.filter(x=>x.id!==item.id)});this.showToast(t('Saved item deleted.','تم حذف الصنف المحفوظ.'),'success');};
  private openDocument=async(doc:LourexDocument)=>{if(!confirmWorkspaceDeparture())return;document.documentElement.setAttribute('data-lourex-document-editor','opening');try{await this.waitForProtectedDataOperation();this.setState({screen:'editor',editorDoc:structuredClone(doc)});}catch(e){document.documentElement.removeAttribute('data-lourex-document-editor');this.showToast(e instanceof Error?e.message:t('Unable to open document.','تعذر فتح المستند.'),'error');}};
  private duplicate=async(source:LourexDocument)=>{try{if(source.role==='credit-note')throw new Error(t('Create a new credit note from the source invoice instead of duplicating a credit note.','أنشئ إشعارًا دائنًا جديدًا من الفاتورة الأصلية بدل نسخ إشعار دائن.'));if(isDeliveryLinkedInvoice(source.id,this.requireVault().documentEvents))throw new Error(t('A delivery-linked invoice cannot be duplicated. Use the confirmed Delivery Note for its exact quantities.','لا يمكن نسخ فاتورة مرتبطة بالتسليم. استخدم سند التسليم المؤكد للكميات الدقيقة.'));const {doc:blank,vault:numberedVault}=await this.reserveDocument(source.kind);const copy=duplicateDocument(source,blank.number);await this.persist({...numberedVault,documents:[...numberedVault.documents,copy]});this.setState({screen:'editor',editorDoc:copy});this.showToast(t('Duplicate created.','تم إنشاء نسخة.'),'success');}catch(e){this.showToast(e instanceof Error?e.message:t('Duplicate failed.','تعذر إنشاء نسخة.'),'error');}};
  private openRecurringForDocument=(source:LourexDocument)=>this.setState({recurringOpen:true,recurringFilter:'document',recurringSourceDocumentId:source.id,recurringSourcePurchaseId:''});
  private openRecurringForPurchase=(source:PurchaseRecord)=>this.setState({recurringOpen:true,recurringFilter:'purchase',recurringSourceDocumentId:'',recurringSourcePurchaseId:source.id});
  private openRecurringManager=(filter:'all'|RecurringTarget)=>this.setState({recurringOpen:true,recurringFilter:filter,recurringSourceDocumentId:'',recurringSourcePurchaseId:''});
  private closeRecurringManager=()=>this.setState({recurringOpen:false,recurringSourceDocumentId:'',recurringSourcePurchaseId:''});
  private saveRecurringWorkflow=async(workflow:RecurringWorkflowRecord)=>{assertRecurringWorkflow(workflow);const vault=this.requireVault();const recurringWorkflows=[...vault.recurringWorkflows];const index=recurringWorkflows.findIndex(item=>item.id===workflow.id);if(index>=0)recurringWorkflows[index]=workflow;else recurringWorkflows.push(workflow);await this.persist({...vault,recurringWorkflows});this.showToast(t('Recurring workflow saved.','تم حفظ المهمة المتكررة.'),'success');};
  private deleteRecurringWorkflow=async(workflow:RecurringWorkflowRecord)=>{const vault=this.requireVault();if(!vault.recurringWorkflows.some(item=>item.id===workflow.id))throw new Error(t('Recurring workflow was not found.','لم يتم العثور على المهمة المتكررة.'));await this.persist({...vault,recurringWorkflows:vault.recurringWorkflows.filter(item=>item.id!==workflow.id)});this.showToast(t('Recurring workflow deleted. Generated drafts were preserved.','تم حذف المهمة المتكررة مع الاحتفاظ بالمسودات التي أُنشئت سابقًا.'),'success');};
  private generateRecurringWorkflow=async(workflow:RecurringWorkflowRecord,notify=true)=>{const vault=this.requireVault();const current=vault.recurringWorkflows.find(item=>item.id===workflow.id);if(!current)throw new Error(t('Recurring workflow was not found. Reopen the manager.','لم يتم العثور على المهمة المتكررة. أعد فتح المدير.'));assertRecurringWorkflow(current);if(!recurringWorkflowDue(current))throw new Error(t('This workflow is not due yet or is paused.','هذه المهمة غير مستحقة بعد أو أنها متوقفة.'));const scheduledFor=current.nextRunDate;if(current.target==='document'){const template=current.documentTemplate;if(!template)throw new Error('Recurring document template is missing.');const numbered=nextDocumentNumber(vault,template.kind);const draft=materializeRecurringDocumentDraft(current,numbered.number,scheduledFor);const completed=completeRecurringRun(current,{id:draft.id,number:draft.number},scheduledFor);const recurringWorkflows=numbered.vault.recurringWorkflows.map(item=>item.id===current.id?completed:item);const documentEvents=[...numbered.vault.documentEvents,createDocumentEvent(draft,'created',t('Created as a recurring draft.','تم الإنشاء كمسودة متكررة.'))];await this.persist({...numbered.vault,documents:[...numbered.vault.documents,draft],documentEvents,recurringWorkflows});if(notify)this.showToast(t(`Recurring draft ${draft.number} created.`,`تم إنشاء المسودة المتكررة ${draft.number}.`),'success');return;}const number=nextPurchaseNumber(vault.purchases,scheduledFor);const draft=materializeRecurringPurchaseDraft(current,number,scheduledFor);const completed=completeRecurringRun(current,{id:draft.id,number:draft.number},scheduledFor);const recurringWorkflows=vault.recurringWorkflows.map(item=>item.id===current.id?completed:item);await this.persist({...vault,purchases:[...vault.purchases,draft],recurringWorkflows});if(notify)this.showToast(t(`Recurring purchase draft ${draft.number} created.`,`تم إنشاء مسودة الشراء المتكررة ${draft.number}.`),'success');};
  private processDueRecurringWorkflows=async(notify=true):Promise<number>=>{if(this.recurringProcessRunning||!this.state.unlocked||!this.state.vault)return 0;this.recurringProcessRunning=true;let generated=0;try{for(let guard=0;guard<24;guard+=1){const due=this.requireVault().recurringWorkflows.filter(item=>recurringWorkflowDue(item)).sort((a,b)=>a.nextRunDate.localeCompare(b.nextRunDate))[0];if(!due)break;await this.generateRecurringWorkflow(due,false);generated+=1;}if(notify&&generated)this.showToast(t(`${generated} recurring draft${generated===1?'':'s'} created for review.`,`تم إنشاء ${generated} مسودة متكررة للمراجعة.`),'success');return generated;}catch(error){if(notify)this.showToast(error instanceof Error?error.message:t('Unable to generate recurring drafts.','تعذر إنشاء المسودات المتكررة.'),'error');return generated;}finally{this.recurringProcessRunning=false;}};
  private openRecurringGenerated=(target:RecurringTarget,id:string)=>{const vault=this.requireVault();this.closeRecurringManager();if(target==='document'){const doc=vault.documents.find(item=>item.id===id);if(doc)void this.openDocument(doc);return;}const purchase=vault.purchases.find(item=>item.id===id);if(!purchase)return;this.setState({screen:'operations'},()=>window.setTimeout(()=>window.dispatchEvent(new CustomEvent('lourex-open-purchase',{detail:{id}})),0));};
  private createDelivery=async(source:LourexDocument)=>{
    if(this.deliveryCreations.has(source.id))return;
    this.deliveryCreations.add(source.id);
    const sessionUid=this.state.cloudUser?.uid,sessionEpoch=this.accountEpoch;
    let delivery:LourexDocument|undefined,created=false;
    try{
      const initial=this.requireVault();
      await this.persistFullMutation(full=>{
        if((this.accountEpoch!==sessionEpoch||this.state.cloudUser?.uid!==sessionUid||activeAccountStorageUid()!==sessionUid)||!this.state.unlocked)throw new Error(t('App is locked.','التطبيق مقفل.'));
        const scoped=scopeVault(full);
        if(scoped.appSettings.activeWorkspaceId!==initial.appSettings.activeWorkspaceId||scoped.appSettings.activeBranchId!==initial.appSettings.activeBranchId)throw new Error(t('Workspace changed. Reopen the source document.','تغيرت مساحة العمل. افتح المستند المصدر من جديد.'));
        const result=createLinkedDeliveryDraft(scoped,source.id);delivery=result.document;created=result.created;
        if(!result.created)return full;
        const intended=applyWorkspaceScope(scoped,result.vault);
        return overlayWorkspaceScope(full,appendAuditEventsForVaultDiff(scoped,intended));
      });
      if(delivery&&this.state.unlocked&&(this.accountEpoch===sessionEpoch&&this.state.cloudUser?.uid===sessionUid&&activeAccountStorageUid()===sessionUid)&&this.requireVault().documents.some(doc=>doc.id===delivery?.id)){
        this.setState({screen:'editor',editorDoc:delivery});
        if(created)this.showToast(t('Delivery draft ready for review. No inventory or payment was posted.','مسودة التسليم جاهزة للمراجعة. لم تُرحّل حركة مخزون أو دفعة.'),'success');
      }
    }catch(error){this.showToast(error instanceof Error?error.message:t('Delivery draft could not be saved.','تعذر حفظ مسودة التسليم.'),'error');}
    finally{this.deliveryCreations.delete(source.id);}
  };
  private createDeliveryInvoice=async(delivery:LourexDocument)=>{
    if(this.deliveryInvoiceCreations.has(delivery.id))return;
    this.deliveryInvoiceCreations.add(delivery.id);
    const sessionUid=this.state.cloudUser?.uid,sessionEpoch=this.accountEpoch;
    let invoice:LourexDocument|undefined,created=false;
    try{
      const initial=this.requireVault();
      await this.persistFullMutation(full=>{
        if((this.accountEpoch!==sessionEpoch||this.state.cloudUser?.uid!==sessionUid||activeAccountStorageUid()!==sessionUid)||!this.state.unlocked)throw new Error(t('App is locked.','التطبيق مقفل.'));
        const scoped=scopeVault(full);
        if(scoped.appSettings.activeWorkspaceId!==initial.appSettings.activeWorkspaceId
          ||scoped.appSettings.activeBranchId!==initial.appSettings.activeBranchId)
          throw new Error(t('Workspace changed. Reopen the Delivery Note.','تغيرت مساحة العمل. أعد فتح سند التسليم.'));
        const result=createConfirmedDeliveryInvoiceDraft(scoped,delivery.id);
        invoice=result.invoice;created=result.created;
        if(!created)return full;
        const intended=applyWorkspaceScope(scoped,result.vault);
        return overlayWorkspaceScope(full,appendAuditEventsForVaultDiff(scoped,intended));
      });
      if(invoice&&this.state.unlocked&&(this.accountEpoch===sessionEpoch&&this.state.cloudUser?.uid===sessionUid&&activeAccountStorageUid()===sessionUid)
        &&this.requireVault().documents.some(doc=>doc.id===invoice?.id)){
        this.setState({screen:'editor',editorDoc:invoice});
        if(created)this.showToast(t('Invoice draft prepared from confirmed delivered quantities. Review before issuing; nothing was posted automatically.','تم تجهيز مسودة فاتورة للكميات المسلّمة المؤكدة. راجعها قبل الإصدار؛ لم تُرحّل أي مبالغ تلقائيًا.'),'success');
      }
    }catch(error){
      this.showToast(error instanceof Error?error.message:t('Could not prepare delivery invoice.','تعذر تجهيز فاتورة التسليم.'),'error');
    }finally{this.deliveryInvoiceCreations.delete(delivery.id);}
  };
  private createPurchaseOrderFromRfq=async(source:LourexDocument)=>{
    if(this.purchaseOrderCreations.has(source.id))return;
    this.purchaseOrderCreations.add(source.id);
    const sessionUid=this.state.cloudUser?.uid,sessionEpoch=this.accountEpoch;
    let order:LourexDocument|undefined,created=false;
    try{
      const initial=this.requireVault();
      await this.persistFullMutation(full=>{
        if((this.accountEpoch!==sessionEpoch||this.state.cloudUser?.uid!==sessionUid||activeAccountStorageUid()!==sessionUid)||!this.state.unlocked)throw new Error(t('App is locked.','التطبيق مقفل.'));
        const scoped=scopeVault(full);
        if(scoped.appSettings.activeWorkspaceId!==initial.appSettings.activeWorkspaceId||scoped.appSettings.activeBranchId!==initial.appSettings.activeBranchId){
          throw new Error(t('Workspace changed. Reopen the source document.','تغيرت مساحة العمل. افتح المستند المصدر من جديد.'));
        }
        const result=createLinkedPurchaseOrderDraft(scoped,source.id);
        order=result.document;created=result.created;
        if(!created)return full;
        const intended=applyWorkspaceScope(scoped,result.vault);
        return overlayWorkspaceScope(full,appendAuditEventsForVaultDiff(scoped,intended));
      });
      if(order&&this.state.unlocked&&(this.accountEpoch===sessionEpoch&&this.state.cloudUser?.uid===sessionUid&&activeAccountStorageUid()===sessionUid)&&this.requireVault().documents.some(doc=>doc.id===order?.id)){
        this.setState({screen:'editor',editorDoc:order});
        if(created)this.showToast(t('Purchase order draft ready for pricing and review. No stock or supplier payment was posted.','مسودة أمر الشراء جاهزة للتسعير والمراجعة. لم يتم ترحيل المخزون أو أي دفعة للمورد.'),'success');
      }
    }catch(error){this.showToast(error instanceof Error?error.message:t('Purchase order draft could not be saved.','تعذر حفظ مسودة أمر الشراء.'),'error');}
    finally{this.purchaseOrderCreations.delete(source.id);}
  };
  private convert=async(source:LourexDocument)=>{if(this.quoteConversions.has(source.id))return;this.quoteConversions.add(source.id);try{const current=this.requireVault();const stored=current.documents.find(doc=>doc.id===source.id);if(stored)source=stored;const linked=current.documents.find(doc=>doc.convertedFromId===source.id&&doc.kind==='invoice'&&doc.role==='standard'&&doc.lifecycleStatus!=='voided');if(linked){this.setState({screen:'editor',editorDoc:linked});return;}if(source.lifecycleStatus==='voided')throw new Error(t('A cancelled quote cannot be converted to an invoice.','لا يمكن تحويل عرض سعر ملغى إلى فاتورة.'));const errors=validateDocument(source);if(Object.keys(errors).length)throw new Error(t('Save a valid Proforma before converting it.','احفظ عرض سعر صالحًا قبل تحويله.'));if(current.documents.some(d=>d.id!==source.id&&d.number.trim().toLowerCase()===source.number.trim().toLowerCase()))throw new Error(t('Document number already exists.','رقم المستند مستخدم بالفعل.'));const committedOrder=salesOrderForQuotation(source.id,current.documentEvents);if(committedOrder)throw new Error(t('This quotation has an accepted Sales Order. Invoice confirmed Delivery Notes instead of the entire order.','هذا العرض مرتبط بأمر بيع معتمد. أنشئ الفواتير من سندات التسليم المؤكدة بدل فوترة كامل الطلب.'));const savedSource=committedOrder?source:{...source,updatedAt:new Date().toISOString()};const sourceIndex=current.documents.findIndex(d=>d.id===source.id);const sourceDocuments=[...current.documents];if(sourceIndex>=0)sourceDocuments[sourceIndex]=savedSource;else sourceDocuments.push(savedSource);const withSource={...current,documents:sourceDocuments};const numbered=nextDocumentNumber(withSource,'invoice');let converted=convertToInvoice(savedSource,numbered.number);const convertedPaymentPreset=paymentTermPresetById(current.company,converted.paymentTermPresetId)||paymentTermPresetByLabel(current.company,converted.terms.paymentTerms);if(convertedPaymentPreset)converted=applyPaymentTermPreset(converted,convertedPaymentPreset);const convertedDocuments=[...sourceDocuments,converted];const documentEvents=[...current.documentEvents,createDocumentEvent(savedSource,'converted','',converted),createDocumentEvent(converted,'created','',savedSource)];await this.persist({...numbered.vault,documents:convertedDocuments,documentEvents});this.setState({screen:'editor',editorDoc:converted});this.showToast(t(`Created ${converted.number}.`,`تم إنشاء ${converted.number}.`),'success');}catch(e){this.showToast(e instanceof Error?e.message:t('Conversion failed.','فشل التحويل.'),'error');}finally{this.quoteConversions.delete(source.id);}};
  private deleteDocument=async()=>{const target=this.state.deletingDoc;if(!target)return;try{const vault=this.requireVault();if(target.status==='draft'&&target.revision>1)throw new Error(t('Discard the revision from Document History instead of deleting it.','ألغِ المراجعة من سجل المستند بدل حذفها.'));if(isDeliveryLinkedInvoice(target.id,vault.documentEvents))throw new Error(t('A delivery-linked invoice draft must remain traceable. Open and review the existing draft.','يجب الحفاظ على ارتباط مسودة الفاتورة بسند التسليم. افتح المسودة الحالية وراجعها.'));if(auditedDocument(vault,target))throw new Error(t('Issued or audited documents cannot be deleted. Void or cancel them to preserve history.','لا يمكن حذف المستندات الصادرة أو التي لها سجل. استخدم الإلغاء للحفاظ على التاريخ.'));if(vault.payments.some(payment=>payment.invoiceId===target.id))throw new Error(t('Delete the invoice payments before deleting this invoice.','احذف دفعات الفاتورة قبل حذف الفاتورة.'));await this.persist({...vault,documents:vault.documents.filter(d=>d.id!==target.id)});this.setState({deletingDoc:null});this.showToast(t('Draft deleted.','تم حذف المسودة.'),'success');}catch(e){this.showToast(e instanceof Error?e.message:t('Delete failed.','فشل الحذف.'),'error');}};
  private savePayment=async(payment:PaymentRecord)=>{const vault=this.requireVault();const invoice=vault.documents.find(document=>document.id===payment.invoiceId);if(!invoice)throw new Error(t('Invoice not found.','الفاتورة غير موجودة.'));const normalized=normalizePaymentRecord(invoice,vault.payments,payment,vault.documents);const payments=[...vault.payments];const index=payments.findIndex(item=>item.id===normalized.id);const isNew=index<0;if(index>=0)payments[index]=normalized;else payments.push(normalized);const documentEvents=isNew?[...vault.documentEvents,createDocumentEvent(invoice,'payment-recorded',normalized.reference,undefined,normalized.amount)]:vault.documentEvents;await this.persist({...vault,payments,documentEvents});this.showToast(t('Payment recorded.','تم تسجيل الدفعة.'),'success');};
  private deletePayment=async(payment:PaymentRecord)=>{const vault=this.requireVault();const invoice=vault.documents.find(document=>document.id===payment.invoiceId);const documentEvents=invoice?[...vault.documentEvents,createDocumentEvent(invoice,'payment-deleted',payment.reference,undefined,payment.amount)]:vault.documentEvents;await this.persist({...vault,payments:vault.payments.filter(item=>item.id!==payment.id),documentEvents});this.showToast(t('Payment deleted.','تم حذف الدفعة.'),'success');};
  private saveSupplierPayment=async(payment:SupplierPaymentRecord)=>{const vault=this.requireVault();const purchase=vault.purchases.find(item=>item.id===payment.purchaseId);if(!purchase)throw new Error(t('Purchase not found.','عملية الشراء غير موجودة.'));const supplier=vault.suppliers.find(item=>item.id===payment.supplierId)??null;if(vault.supplierPayments.some(item=>item.id===payment.id))throw new Error(t('Recorded supplier payments cannot be edited. Void the original payment and record a corrected payment.','لا يمكن تعديل دفعات الموردين المسجلة. ألغِ الدفعة الأصلية وسجّل دفعة مصححة.'));const normalized=normalizeSupplierPayment(purchase,supplier,vault.supplierPayments,payment);const supplierPayments=[...vault.supplierPayments,normalized];await this.persist({...vault,supplierPayments});this.showToast(t('Supplier payment recorded.','تم تسجيل دفعة المورد.'),'success');};
  private deleteSupplierPayment=async(payment:SupplierPaymentRecord,reason:string)=>{const vault=this.requireVault();const original=vault.supplierPayments.find(item=>item.id===payment.id);if(!original)throw new Error(t('Supplier payment not found.','دفعة المورد غير موجودة.'));if(vault.treasuryEntries.some(entry=>!entry.voidedAt&&entry.sourceType==='supplier-payment'&&entry.sourceId===original.id))throw new Error(t('This payment has an active Cash & Bank entry. Void that treasury entry first, then void the supplier payment.','هذه الدفعة مرتبطة بقيد خزينة نشط. ألغِ قيد الخزينة أولًا، ثم ألغِ دفعة المورد.'));const voided=voidSupplierPayment(original,reason);await this.persist({...vault,supplierPayments:vault.supplierPayments.map(item=>item.id===original.id?voided:item)});this.showToast(t('Supplier payment voided. Original history was retained.','تم إلغاء دفعة المورد مع الاحتفاظ بسجلها الأصلي.'),'success');};
  private saveCustomer=async(customer:Customer)=>{const vault=this.requireVault();const index=vault.customers.findIndex(c=>c.id===customer.id);const customers=[...vault.customers];if(index>=0)customers[index]={...customer,updatedAt:new Date().toISOString()};else customers.push(customer);await this.persist({...vault,customers});};
  private saveSupplier=async(supplier:Supplier)=>{const errors=validateSupplier(supplier);if(errors.length)throw new Error(errors[0]);const vault=this.requireVault();const suppliers=[...vault.suppliers];const index=suppliers.findIndex(item=>item.id===supplier.id);const next={...supplier,defaultCurrency:supplier.defaultCurrency.trim().toUpperCase(),updatedAt:new Date().toISOString()};if(index>=0)suppliers[index]=next;else suppliers.push(next);await this.persist({...vault,suppliers});this.showToast(t('Supplier saved.','تم حفظ المورد.'),'success');};
  private deleteSupplier=async(supplier:Supplier)=>{const vault=this.requireVault();if(vault.supplierPayments.some(payment=>payment.supplierId===supplier.id))throw new Error(t('This supplier has recorded supplier payments and cannot be deleted. Keep it for audit continuity.','لهذا المورد مدفوعات مسجلة ولا يمكن حذفه. احتفظ به لاستمرارية سجل التدقيق.'));if(vault.expenses.some(expense=>expense.supplierId===supplier.id))throw new Error(t('This supplier is referenced by historical expenses and cannot be deleted.','هذا المورد مرتبط بمصروفات تاريخية ولا يمكن حذفه.'));await this.persist({...vault,suppliers:vault.suppliers.filter(item=>item.id!==supplier.id)});this.showToast(t('Supplier deleted. Historical purchase snapshots were preserved.','تم حذف المورد مع الاحتفاظ بنسخ بياناته داخل المشتريات التاريخية.'),'success');};
  private savePurchaseRecord=async(purchase:PurchaseRecord)=>{const vault=this.requireVault();const existing=vault.purchases.find(item=>item.id===purchase.id);if(existing&&existing.status!=='draft')throw new Error(t('Posted or reversed purchases are read-only.','المشتريات المرحلة أو المعكوسة للقراءة فقط.'));const errors=validatePurchase(purchase,vault.savedItems);if(errors.length)throw new Error(errors[0]);if(vault.purchases.some(item=>item.id!==purchase.id&&item.number.trim().toLowerCase()===purchase.number.trim().toLowerCase()))throw new Error(t('Purchase number already exists.','رقم الشراء مستخدم بالفعل.'));const purchases=[...vault.purchases];const index=purchases.findIndex(item=>item.id===purchase.id);const next={...purchase,status:'draft' as const,currency:purchase.currency.trim().toUpperCase(),updatedAt:new Date().toISOString()};if(index>=0)purchases[index]=next;else purchases.push(next);await this.persist({...vault,purchases});this.showToast(t('Purchase draft saved.','تم حفظ مسودة الشراء.'),'success');};
  private deletePurchaseRecord=async(purchase:PurchaseRecord)=>{const vault=this.requireVault();const current=vault.purchases.find(item=>item.id===purchase.id);if(!current||current.status!=='draft')throw new Error(t('Only draft purchases can be deleted.','يمكن حذف مسودات الشراء فقط.'));if(vault.inventoryMovements.some(movement=>movement.sourceId===purchase.id))throw new Error(t('This purchase already has inventory history and cannot be deleted.','لهذا الشراء سجل مخزون ولا يمكن حذفه.'));await this.persist({...vault,purchases:vault.purchases.filter(item=>item.id!==purchase.id)});this.showToast(t('Purchase draft deleted.','تم حذف مسودة الشراء.'),'success');};
  private postPurchaseRecord=async(purchase:PurchaseRecord)=>{const vault=this.requireVault();const existing=vault.purchases.find(item=>item.id===purchase.id);const gate=approvalGate(vault,{action:'post-purchase',entityType:'purchase',entityId:purchase.id,entityLabel:purchase.number,entityUpdatedAt:existing?.updatedAt||''});if(!gate.allowed){if(gate.created)await this.persist(gate.vault);throw new Error(t('Approval is required before posting this purchase. Open Settings → Access.','يلزم الحصول على موافقة قبل ترحيل عملية الشراء. افتح الإعدادات ← الوصول.'));}if(existing&&existing.status!=='draft')throw new Error(t('Purchase is already posted or reversed.','الشراء مرحل أو معكوس بالفعل.'));if(vault.purchases.some(item=>item.id!==purchase.id&&item.number.trim().toLowerCase()===purchase.number.trim().toLowerCase()))throw new Error(t('Purchase number already exists.','رقم الشراء مستخدم بالفعل.'));const result=postPurchase(purchase,vault.savedItems,vault.inventoryMovements);const purchases=[...vault.purchases];const index=purchases.findIndex(item=>item.id===purchase.id);if(index>=0)purchases[index]=result.purchase;else purchases.push(result.purchase);await this.persist({...vault,purchases,inventoryMovements:[...vault.inventoryMovements,...result.movements],savedItems:result.savedItems});this.showToast(t('Purchase posted, inventory received and supplier payable opened.','تم ترحيل الشراء واستلام المخزون وفتح مستحق المورد.'),'success');};
  private reversePurchaseRecord=async(purchase:PurchaseRecord,reason:string)=>{const vault=this.requireVault();const current=vault.purchases.find(item=>item.id===purchase.id);if(!current)throw new Error(t('Purchase not found.','عملية الشراء غير موجودة.'));const gate=approvalGate(vault,{action:'reverse-purchase',entityType:'purchase',entityId:current.id,entityLabel:current.number,entityUpdatedAt:current.updatedAt});if(!gate.allowed){if(gate.created)await this.persist(gate.vault);throw new Error(t('Approval is required before reversing this purchase. Open Settings → Access.','يلزم الحصول على موافقة قبل عكس عملية الشراء. افتح الإعدادات ← الوصول.'));}if(vault.supplierPayments.some(payment=>payment.purchaseId===current.id&&!payment.voidedAt))throw new Error(t('This purchase has supplier payments. Delete or correct those payments in Finance before reversing the purchase.','لهذه العملية مدفوعات مورد. احذف أو صحح هذه المدفوعات من المالية قبل عكس عملية الشراء.'));const result=reversePurchase(current,reason,vault.inventoryMovements,vault.savedItems);const purchases=vault.purchases.map(item=>item.id===current.id?result.purchase:item);await this.persist({...vault,purchases,inventoryMovements:[...vault.inventoryMovements,...result.movements],savedItems:result.savedItems});this.showToast(t('Purchase reversed with an audit-preserving stock reversal.','تم عكس الشراء مع الحفاظ على سجل تدقيق وحركة مخزون عكسية.'),'success');};
  private saveExpenseRecord=async(expense:ExpenseRecord)=>{const errors=validateExpense(expense);if(errors.length)throw new Error(errors[0]);const vault=this.requireVault();const expenses=[...vault.expenses];const index=expenses.findIndex(item=>item.id===expense.id);const next={...expense,currency:expense.currency.trim().toUpperCase(),updatedAt:new Date().toISOString()};if(index>=0)expenses[index]=next;else expenses.push(next);await this.persist({...vault,expenses});this.showToast(t('Expense saved.','تم حفظ المصروف.'),'success');};
  private deleteExpenseRecord=async(expense:ExpenseRecord)=>{const vault=this.requireVault();await this.persist({...vault,expenses:vault.expenses.filter(item=>item.id!==expense.id)});this.showToast(t('Expense deleted.','تم حذف المصروف.'),'success');};
  private correctPhysicalSalesReturn=async(input:SalesReturnCorrectionInput)=>{const vault=this.requireVault();const next=correctSalesReturn(vault,{...input,operatorId:activeTeamMember(vault).id}).vault;await this.persist(next);this.showToast(t('Return receipt reversed by a separate evidenced inventory movement.','تم عكس استلام المرتجع بحركة مخزون مستقلة موثقة.'),'success');};
  private recordSalesReturn=async(input:SalesReturnInput)=>{const vault=this.requireVault();const actor=activeTeamMember(vault).id;const next=postSalesReturn(vault,{...input,operatorId:actor}).vault;await this.persist(next);this.showToast(t('Returned goods received into inventory with credit note and proof.','تم استلام المرتجع وإدخاله المخزون مع الإشعار الدائن والإثبات.'),'success');};
  private saveInventoryMovement=async(movement:InventoryMovementRecord)=>{if(!inventoryMovementIsManual(movement))throw new Error(t('Only manual inventory movements can be added here.','يمكن إضافة حركات المخزون اليدوية فقط من هنا.'));const vault=this.requireVault();assertGovernancePermission(vault,'issue-sales-stock');const recorded={...movement,createdBy:activeTeamMember(vault).id};validateManualMovementEvidence(recorded);if(vault.inventoryMovements.some(item=>item.id===movement.id))throw new Error(t('Inventory movement already exists.','حركة المخزون موجودة بالفعل.'));if(!vault.savedItems.some(item=>item.id===movement.itemId))throw new Error(t('Saved item not found.','الصنف المحفوظ غير موجود.'));await this.persist({...vault,inventoryMovements:[...vault.inventoryMovements,recorded]});this.showToast(t('Inventory movement recorded.','تم تسجيل حركة المخزون.'),'success');};
  private deleteInventoryMovement=async(_movement:InventoryMovementRecord)=>{throw new Error(t('A documented reversal requires a NEW reason and NEW supporting file. Open Inventory Movements and choose Reverse.','يتطلب العكس سببًا جديدًا وملف إثبات جديدًا. افتح حركات المخزون واختر عكس.'));};
  private deleteCustomer=async(customer:Customer)=>{const vault=this.requireVault();await this.persist({...vault,customers:vault.customers.filter(c=>c.id!==customer.id)});this.showToast(t('Customer deleted.','تم حذف العميل.'),'success');};
  private createCompanyWorkspace=async(name:string)=>{await this.persistFullMutation(vault=>createWorkspace(vault,name));this.showToast(t('Company workspace created.','تم إنشاء مساحة الشركة.'),'success');};
  private switchCompanyWorkspace=async(id:string)=>{this.editorMustBeClosed('switching company workspaces','تبديل مساحة الشركة');await this.persistFullMutation(vault=>activateWorkspace(vault,id));const current=this.requireVault();await this.syncPublicPreferences(current.company.logoDataUrl,current.appSettings.uiLanguage);this.setState({settingsOpen:false,screen:'home',editorDoc:null});this.showToast(t('Company workspace switched.','تم تبديل مساحة الشركة.'),'success');};
  private createWorkspaceBranch=async(name:string,code:string)=>{await this.persistFullMutation(vault=>createBranch(vault,name,code));this.showToast(t('Branch created.','تم إنشاء الفرع.'),'success');};
  private switchWorkspaceBranch=async(id:string)=>{this.editorMustBeClosed('switching branches','تبديل الفرع');await this.persistFullMutation(vault=>activateBranch(vault,id));this.setState({settingsOpen:false,screen:'home',editorDoc:null});this.showToast(t('Branch switched.','تم تبديل الفرع.'),'success');};
  private saveTeamMember=async(member:TeamMemberRecord)=>{const vault=this.requireVault();const teamMembers=[...vault.teamMembers];const index=teamMembers.findIndex(item=>item.id===member.id);const next={...member,displayName:member.displayName.trim(),email:member.email.trim(),updatedAt:new Date().toISOString()};if(!next.displayName)throw new Error(t('Team member name is required.','اسم عضو الفريق مطلوب.'));if(index>=0)teamMembers[index]=next;else teamMembers.push(next);await this.persist({...vault,teamMembers});};
  private toggleTeamMember=async(id:string)=>{const vault=this.requireVault();if(id==='owner')throw new Error(t('The workspace owner cannot be suspended.','لا يمكن تعليق مالك مساحة العمل.'));const member=vault.teamMembers.find(item=>item.id===id);if(!member)throw new Error(t('Team member not found.','عضو الفريق غير موجود.'));const status:TeamMemberRecord['status']=member.status==='active'?'suspended':'active';const teamMembers=vault.teamMembers.map(item=>item.id===id?{...item,status,updatedAt:new Date().toISOString()}:item);let appSettings=vault.appSettings;if(status==='suspended'&&appSettings.activeTeamMemberId===id)appSettings={...appSettings,activeTeamMemberId:'owner'};await this.persist({...vault,teamMembers,appSettings});};
  private setActiveTeamMember=async(id:string)=>{const vault=this.requireVault();const member=vault.teamMembers.find(item=>item.id===id&&item.status==='active');if(!member)throw new Error(t('Choose an active team member.','اختر عضو فريق مفعّلًا.'));await this.persist({...vault,appSettings:{...vault.appSettings,activeTeamMemberId:id}});};
  private toggleApprovalPolicy=async(id:string,enabled:boolean)=>{const vault=this.requireVault();const approvalPolicies=vault.approvalPolicies.map(policy=>policy.id===id?{...policy,enabled}:policy);if(!approvalPolicies.some(policy=>policy.id===id))throw new Error(t('Approval policy not found.','سياسة الموافقة غير موجودة.'));await this.persist({...vault,approvalPolicies});};
  private decideApproval=async(id:string,decision:'approved'|'rejected')=>{const vault=this.requireVault();await this.persist(decideApprovalRequest(vault,id,decision));this.showToast(decision==='approved'?t('Approval granted.','تمت الموافقة.'):t('Approval rejected.','تم رفض الطلب.'),'success');};
  private saveCompany=async(company:CompanySettings)=>{const vault=this.requireVault();const smartDefaults={...vault.appSettings.smartDefaults,currency:company.defaultCurrency||'USD',language:company.defaultLanguage,incoterm:company.defaultIncoterm,paymentTerms:company.defaultPaymentTerms,deliveryTime:company.defaultDeliveryTime};const appSettings={...vault.appSettings,smartDefaults};await this.persist({...vault,company,appSettings});await this.syncPublicPreferences(company.logoDataUrl,this.requireVault().appSettings.uiLanguage);};
  private saveAppSettings=async(appSettings:AppSettings)=>{const vault=this.requireVault();const next={...appSettings,uiLanguage:appSettings.uiLanguage??'en'};await this.persist({...vault,appSettings:next});const current=this.requireVault();await this.syncPublicPreferences(current.company.logoDataUrl,current.appSettings.uiLanguage);touchSession();this.resetAutoLock();};
  private backup=async()=>{
    this.editorMustBeClosed('downloading a local copy','تنزيل نسخة محلية');
    await this.drainVaultWrites();
    const uid=this.state.cloudUser?.uid;
    if(!uid||uid!==currentCloudUser()?.uid)throw new Error('Sign in to your account first.');
    const local=await getPlainWorkspace();
    if(!local)throw new Error('The account workspace is unavailable.');
    await exportPlainBackup(local.payload);
  };
  private restore=async(file:File)=>{
    this.editorMustBeClosed('importing a local copy','استيراد نسخة محلية');
    if(this.state.cloudSyncState==='conflict')
      throw new Error(t('Resolve the cloud/device conflict before importing a local copy. Neither version has been overwritten.','حل تعارض الجهاز والسحابة قبل استيراد النسخة المحلية. لم يتم استبدال أي نسخة.'));
    const restored=synchronizeActiveWorkspaceOnSave(this.normalizedVault(await readPlainBackup(file)));
    // Never replace this device with a backup that Firebase cannot publish.
    assertPlainCloudWorkspaceUploadable(restored);
    await this.beginProtectedOperation();
    try{
      const uid=this.state.cloudUser?.uid;
      if(!uid||uid!==currentCloudUser()?.uid)throw new Error('Sign in to your account first.');
      const current=await getPlainWorkspace();
      if(!current)throw new Error('The local workspace is unavailable.');
      // A locally imported older snapshot must never discard immutable invoice
      // stock issues, physical receipts or the associated source documents.
      assertPostedStockRestoreContinuity(current.payload,restored);
      const replacement:PlainWorkspaceRecord={
        id:'workspace-v2',uid,payload:restored,schemaVersion:restored.schemaVersion,
        localRevision:crypto.randomUUID(),updatedAt:new Date().toISOString(),
        baseCloudRevision:current.baseCloudRevision,baseCloudSha256:current.baseCloudSha256
      };
      const ok=await replacePlainWorkspaceIfUnchanged(uid,current.localRevision,replacement,'replaced-by-backup');
      if(!ok)throw new Error('Account data changed during import. Retry to protect newer changes.');
      this.vaultWriteTail=Promise.resolve(restored);
      await new Promise<void>(resolve=>this.setState({vault:restored,screen:'home',editorDoc:null},resolve));
      this.scheduleCloudSync(300);
    }finally{this.endProtectedOperation();}
  };
  private requireVault():VaultPayload{if(!this.state.vault)throw new Error(t('App is locked.','التطبيق مقفل.'));return scopeVault(this.state.vault);}
  private waitForPrintAssets=async()=>{await new Promise<void>(resolve=>window.requestAnimationFrame(()=>window.requestAnimationFrame(()=>resolve())));try{if(document.fonts)await document.fonts.ready;}catch{}const images=Array.from(document.querySelectorAll<HTMLImageElement>('.print-portal img'));await Promise.all(images.map(async image=>{if(image.complete&&image.naturalWidth>0)return;try{if(typeof image.decode==='function'){await image.decode();return;}}catch{}await new Promise<void>(resolve=>{const done=()=>resolve();image.addEventListener('load',done,{once:true});image.addEventListener('error',done,{once:true});window.setTimeout(done,1200);});}));};
  private launchPrint=async()=>{await this.waitForPrintAssets();await new Promise<void>((resolve,reject)=>{const deadline=Date.now()+5000;const check=()=>{const pages=document.querySelector('.print-portal [data-pagination-ready]');if(!pages||pages.getAttribute('data-pagination-ready')==='true'){resolve();return;}if(Date.now()>deadline){reject(new Error(t('Document layout could not finish. Please retry.','تعذر إكمال تخطيط المستند. حاول مجددًا.')));return;}window.requestAnimationFrame(check);};check();});if(!this.state.printDoc)return;window.print();};
  private requestPrint=async(doc:LourexDocument,mode:'print'|'pdf'|'share'):Promise<void>=>{try{const appleTouch=/iPad|iPhone|iPod/i.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);const preparePdf=(window as any).__LOUREX_PREPARE_PDF__;if(appleTouch&&mode!=='print'&&typeof preparePdf!=='function')throw new Error(t('Safari PDF engine is not ready. Reload LOUREX once and retry Save PDF.','محرك PDF في Safari غير جاهز. أعد تحميل LOUREX مرة واحدة ثم أعد حفظ PDF.'));try{preparePdf?.(mode);}catch(error){if(appleTouch&&mode!=='print')throw error;}const errors=validateDocument(doc);if(Object.keys(errors).length)throw new Error(t('Complete the required document fields before printing or sharing.','أكمل الحقول المطلوبة قبل الطباعة أو المشاركة.'));const vault=this.requireVault();if(vault.documents.some(d=>d.id!==doc.id&&d.number.trim().toLowerCase()===doc.number.trim().toLowerCase()))throw new Error(t('Document number already exists.','رقم المستند مستخدم بالفعل.'));let target:LourexDocument;const existing=vault.documents.find(d=>d.id===doc.id);if(doc.kind==='draft'){target=structuredClone(doc);}else if(doc.status==='final'&&existing?.status==='final')target=structuredClone(doc);else{target={...structuredClone(doc),status:'final',updatedAt:new Date().toISOString()};await this.saveDocument(target,false);target=structuredClone(this.requireVault().documents.find(saved=>saved.id===target.id)??target);}assertFinancialOutputParity(doc,target);const party=(target.kind==='purchase-order'||target.kind==='rfq')?(target.supplierSnapshot?.nameEn||target.supplierSnapshot?.nameAr||t('Supplier','المورد')):target.kind==='draft'?(target.letter?.subject||target.letter?.recipient||t('Company Document','مستند شركة')):(target.customerSnapshot?.companyNameEn||target.customerSnapshot?.companyNameAr||t('Customer','العميل'));const prefix=`LOUREX-${safeFilename(target.number)}-${safeFilename(party)}`;document.title=prefix;await new Promise<void>((resolve,reject)=>this.setState({printDoc:target},()=>{document.body.classList.add('printing');void this.launchPrint().then(resolve,reject);}));}catch(e){const message=e instanceof Error?e.message:t('Unable to prepare document.','تعذر تجهيز المستند.');try{(window as any).__LOUREX_OUTPUT_ERROR__?.(message);}catch{}this.showToast(message,'error');throw e;}};
  private afterPrint=()=>{document.body.classList.remove('printing');document.title='LOUREX Invoice';this.setState({printDoc:null});};
  private closeEditor=()=>{this.setState({screen:'documents',editorDoc:null});};
  private cloudModal=()=> <CloudAccountModal open={this.state.cloudModal} user={this.state.cloudUser} cloudState={this.state.cloudSyncState} cloudMessage={this.state.cloudSyncMessage} canResolve={this.state.screen!=='editor'&&!this.state.settingsOpen} onClose={()=>this.setState({cloudModal:false})} onSignIn={this.cloudSignIn} onCreate={this.cloudCreate} onReset={this.cloudReset} onRestore={this.cloudRestore} onKeepLocal={this.keepLocalCloudCopy} onSignOut={this.cloudSignOut}/>;
  private authCloudShell=(content:any)=> <div className="auth-shell">{content}<div className={`auth-cloud-launcher cloud-${this.state.cloudSyncState}`}><Button icon="backup" onClick={()=>this.setState({cloudModal:true})}>{this.state.cloudUser?t('Cloud Account','الحساب السحابي'):t('Cloud Sign In','الدخول السحابي')}</Button></div>{this.cloudModal()}</div>;
  private cloudHeaderLabel=()=>this.state.cloudSyncState==='local'?t('Saved locally','محفوظ محليًا'):this.state.cloudSyncState==='queued'?t('Cloud pending','بانتظار السحابة'):this.state.cloudSyncState==='syncing'?t('Syncing','جارٍ المزامنة'):this.state.cloudSyncState==='synced'?t('Saved to cloud','محفوظ سحابيًا'):this.state.cloudSyncState==='offline'?t('Offline · Local safe','غير متصل · محليًا آمن'):this.state.cloudSyncState==='error'?t('Sync failed','فشلت المزامنة'):t('Sync conflict','تعارض مزامنة');

  private openCreditNoteLauncher=()=>{
    const vault=this.requireVault();
    const eligible=vault.documents.filter(doc=>doc.kind==='invoice'&&doc.role==='standard'&&doc.status==='final'&&doc.lifecycleStatus!=='voided'&&invoiceCreditCapacity(doc,vault.documents,vault.payments).available!=='0.00');
    if(!eligible.length){this.setState({newMenu:false,screen:'documents'});this.showToast(t('Issue a Commercial Invoice with remaining balance before creating a Credit Note.','أصدر فاتورة تجارية فيها رصيد متبقٍ قبل إنشاء إشعار دائن.'),'error');return;}
    this.setState({newMenu:false,catalogLauncher:'credit-note',catalogSourceId:eligible.length===1?eligible[0]!.id:''});
  };
  private openStatementLauncher=()=>{
    const vault=this.requireVault();
    if(!vault.customers.length){this.setState({newMenu:false,screen:'customers'});this.showToast(t('Add a customer before opening a Statement of Account.','أضف عميلًا قبل فتح كشف الحساب.'),'error');return;}
    this.setState({newMenu:false,catalogLauncher:'statement-account',catalogSourceId:vault.customers.length===1?vault.customers[0]!.id:''});
  };
  private closeCatalogLauncher=()=>this.setState({catalogLauncher:'',catalogSourceId:''});
  private confirmCatalogLauncher=()=>{
    const vault=this.requireVault();
    const sourceId=this.state.catalogSourceId;
    if(!sourceId)return;
    if(this.state.catalogLauncher==='credit-note'){
      const source=vault.documents.find(doc=>doc.id===sourceId&&doc.kind==='invoice'&&doc.role==='standard'&&doc.status==='final'&&doc.lifecycleStatus!=='voided');
      if(!source){this.showToast(t('Select an eligible Commercial Invoice.','اختر فاتورة تجارية صالحة.'),'error');return;}
      this.setState({catalogLauncher:'',catalogSourceId:''},()=>this.launchCreditNote(source));
      return;
    }
    if(this.state.catalogLauncher==='statement-account'){
      const customer=vault.customers.find(item=>item.id===sourceId);
      if(!customer){this.showToast(t('Select a customer.','اختر العميل.'),'error');return;}
      this.setState({catalogLauncher:'',catalogSourceId:'',screen:'receivables',editorDoc:null,newMenu:false},()=>window.setTimeout(()=>window.dispatchEvent(new CustomEvent('lourex-finance-statement',{detail:{customerId:customer.id}})),0));
    }
  };
  private catalogLauncherModal=(vault:VaultPayload)=>{
    const launcher=this.state.catalogLauncher;
    if(!launcher)return null;
    const credit=launcher==='credit-note';
    const invoices=credit?vault.documents.filter(doc=>doc.kind==='invoice'&&doc.role==='standard'&&doc.status==='final'&&doc.lifecycleStatus!=='voided'&&invoiceCreditCapacity(doc,vault.documents,vault.payments).available!=='0.00'):[];
    const valid=credit?invoices.some(doc=>doc.id===this.state.catalogSourceId):vault.customers.some(customer=>customer.id===this.state.catalogSourceId);
    return <Modal open title={credit?t('Create Credit Note','إنشاء إشعار دائن'):t('Statement of Account','كشف حساب')} onClose={this.closeCatalogLauncher} footer={<div className="modal-footer-actions"><Button onClick={this.closeCatalogLauncher}>{t('Cancel','إلغاء')}</Button><Button variant="primary" disabled={!valid} onClick={this.confirmCatalogLauncher}>{credit?t('Create Credit Note','إنشاء إشعار دائن'):t('Open Statement','فتح كشف الحساب')}</Button></div>}>
      <div className="field-stack"><label><span>{credit?t('Issued Commercial Invoice','الفاتورة التجارية الصادرة'):t('Customer','العميل')}</span><Select value={this.state.catalogSourceId} onChange={(event:any)=>this.setState({catalogSourceId:event.target.value})}><option value="">{credit?t('Select invoice…','اختر الفاتورة…'):t('Select customer…','اختر العميل…')}</option>{credit?invoices.map(doc=><option key={doc.id} value={doc.id}>{doc.number} — {doc.customerSnapshot?.companyNameEn||doc.customerSnapshot?.companyNameAr||t('Customer','عميل')}</option>):vault.customers.map(customer=><option key={customer.id} value={customer.id}>{customer.companyNameEn||customer.companyNameAr||t('Customer','عميل')}</option>)}</Select></label><p className="field-hint">{credit?t('Credit Notes stay linked to the original invoice and remaining credit balance.','يبقى الإشعار الدائن مرتبطًا بالفاتورة الأصلية والرصيد المتاح لها.'):t('The statement opens from finalized invoices, payments and active credit notes for the selected customer.','يُفتح الكشف من الفواتير النهائية والمدفوعات والإشعارات الدائنة الفعالة للعميل المحدد.')}</p></div>
    </Modal>;
  };

  render():any{
    const activeLanguage=this.state.vault?.appSettings.uiLanguage??this.state.uiLanguage;setUiLanguage(activeLanguage);
    if(this.state.loading)return <div className="loading-screen"><Brand logoDataUrl={this.state.publicLogo} language={activeLanguage}/><span className="loading-line"/></div>;
    if(this.state.firstRun)return <AccountEntryScreen language={activeLanguage} onLanguageChange={this.changePublicLanguage}/>;
    if(!this.state.unlocked)return <main className="auth-recovery-state" role="alert">
      <strong>{t('Account workspace unavailable','تعذر فتح مساحة الحساب')}</strong>
      <p>{this.state.cloudSyncMessage||t('Connect to Firebase and retry.','اتصل بـ Firebase ثم حاول مجددًا.')}</p>
      <button type="button" className="button primary" onClick={()=>this.setState({loading:true},()=>void this.initialize())}>{t('Retry','إعادة المحاولة')}</button>
      <button type="button" className="button" onClick={()=>void signOutCloudUser().then(()=>window.location.reload())}>{t('Sign out','تسجيل الخروج')}</button>
    </main>;
    const vault=this.requireVault();
    const businessHealth=buildBusinessHealth(vault);
    const activeWorkspaceMeta=vault.workspaces.find(item=>item.id===vault.appSettings.activeWorkspaceId)??vault.workspaces[0];
    const activeBranchMeta=vault.branches.find(item=>item.workspaceId===activeWorkspaceMeta?.id&&item.id===vault.appSettings.activeBranchId)??vault.branches.find(item=>item.workspaceId===activeWorkspaceMeta?.id&&item.active);
    const defaultCurrency=vault.appSettings.smartDefaults.currency||vault.company.defaultCurrency||'USD';
    const navigate=(screen:'home'|'documents'|'customers'|'receivables'|'reports'|'items'|'operations',reportPeriod?:{from:string;to:string})=>{if(screen===this.state.screen){if(screen==='reports'&&reportPeriod)this.setState(state=>({reportsPeriod:reportPeriod,reportsPeriodVersion:state.reportsPeriodVersion+1}));return;}if(this.state.screen==='editor'){this.showToast(t('Save and close the document with Back before navigating away.','احفظ وأغلق المستند بزر الرجوع قبل الانتقال إلى قسم آخر.'),'error');return;}if(!confirmWorkspaceDeparture())return;this.setState(state=>({screen,editorDoc:null,newMenu:false,documentsInitialStatus:'all',reportsPeriod:screen==='reports'?reportPeriod||null:null,reportsPeriodVersion:state.reportsPeriodVersion+1}));};
    const navigateToIncompleteDocuments=()=>{if(this.state.screen==='editor'){this.showToast(t('Save and close the document with Back before navigating away.','احفظ وأغلق المستند بزر الرجوع قبل الانتقال إلى قسم آخر.'),'error');return;}if(!confirmWorkspaceDeparture())return;this.setState({screen:'documents',editorDoc:null,newMenu:false,documentsInitialStatus:'draft'});};
    const openSupplierFinance=(supplierId:string)=>{if(!confirmWorkspaceDeparture())return;this.setState({screen:'receivables',editorDoc:null,newMenu:false},()=>window.setTimeout(()=>window.dispatchEvent(new CustomEvent('lourex-finance-supplier-payables',{detail:{supplierId}})),0));};
    const operationsProps={suppliers:vault.suppliers,purchases:vault.purchases,supplierPayments:vault.supplierPayments,expenses:vault.expenses,inventoryMovements:vault.inventoryMovements,treasuryAccounts:vault.treasuryAccounts,treasuryEntries:vault.treasuryEntries,treasuryReconciliations:vault.treasuryReconciliations,fxRates:vault.fxRates,warehouses:vault.warehouses,workspaceId:vault.appSettings.activeWorkspaceId,branchId:vault.appSettings.activeBranchId,items:vault.savedItems,defaultCurrency,recurringWorkflows:vault.recurringWorkflows,onMakeRecurringPurchase:this.openRecurringForPurchase,onOpenRecurring:()=>this.openRecurringManager('purchase'),onOpenSupplierFinance:openSupplierFinance,onSaveSupplier:this.saveSupplier,onDeleteSupplier:this.deleteSupplier,onSavePurchase:this.savePurchaseRecord,onDeletePurchase:this.deletePurchaseRecord,onPostPurchase:this.postPurchaseRecord,onReversePurchase:this.reversePurchaseRecord,onSaveExpense:this.saveExpenseRecord,onDeleteExpense:this.deleteExpenseRecord,documents:vault.documents,onRecordSalesReturn:this.recordSalesReturn,onCorrectSalesReturn:this.correctPhysicalSalesReturn,onSaveInventoryMovement:this.saveInventoryMovement,onDeleteInventoryMovement:this.deleteInventoryMovement};
    return <div className="app-root"><div className="app-ui">
      <AppShell screen={this.state.screen} logoDataUrl={vault.company.logoDataUrl} language={activeLanguage} workspaceName={activeWorkspaceMeta?.name||'LOUREX'} branchName={activeBranchMeta?.name||activeBranchMeta?.code||t('Main Branch','الفرع الرئيسي')} newMenu={this.state.newMenu} cloudState={this.state.cloudSyncState} cloudLabel={this.cloudHeaderLabel()} cloudMessage={this.state.cloudSyncMessage} onNavigate={navigate} onToggleNew={()=>this.setState(state=>({newMenu:!state.newMenu}))} onNew={(kind)=>void this.newDocument(kind)} onCreditNote={this.openCreditNoteLauncher} onStatementAccount={this.openStatementLauncher} onSettings={()=>this.setState({settingsOpen:true})} onCloud={()=>this.setState({cloudModal:true})}>
        <main className={this.state.screen==='editor'?'editor-main':'main-content'}>
          {this.state.screen==='home'?<WorkspaceHome companyName={vault.company.nameEn||vault.company.nameAr||'LOUREX Invoice'} documents={vault.documents} payments={vault.payments} purchases={vault.purchases} expenses={vault.expenses} inventoryMovements={vault.inventoryMovements} items={vault.savedItems} customerCount={vault.customers.length} health={businessHealth} onNewDocument={()=>this.setState({newMenu:true})} onOpenDocument={(doc)=>void this.openDocument(doc)} onNavigate={(screen)=>navigate(screen)} onOpenIncompleteDocuments={navigateToIncompleteDocuments} onOpenSettings={()=>this.setState({settingsOpen:true})}/>:null}
          {this.state.screen==='documents'?<DocumentsPage initialStatus={this.state.documentsInitialStatus} savedItems={vault.savedItems} inventoryMovements={vault.inventoryMovements} warehouses={vault.warehouses} workspaceId={vault.appSettings.activeWorkspaceId} branchId={vault.appSettings.activeBranchId} documents={vault.documents} payments={vault.payments} documentEvents={vault.documentEvents} recurringWorkflows={vault.recurringWorkflows} onMakeRecurring={this.openRecurringForDocument} onOpenRecurring={()=>this.openRecurringManager('document')} onNew={(k)=>void this.newDocument(k)} onOpen={(d)=>void this.openDocument(d)} onDuplicate={(d)=>void this.duplicate(d)} onConvert={this.convert} onCreateDelivery={this.createDelivery} onCreateDeliveryInvoice={this.createDeliveryInvoice} onCreatePurchaseOrder={this.createPurchaseOrderFromRfq} onPrint={this.requestPrint} onDelete={(d)=>this.setState({deletingDoc:d})} onRecordPayment={(doc)=>this.setState({screen:'receivables'},()=>window.setTimeout(()=>window.dispatchEvent(new CustomEvent('lourex-finance-payment',{detail:{invoiceId:doc.id}})),0))} onCreateCreditNote={this.launchCreditNote} onOpenStatements={()=>navigate('receivables')}/>:null}
          {this.state.screen==='customers'?<CustomersPage customers={vault.customers} company={vault.company} onSave={this.saveCustomer} onDelete={this.deleteCustomer} onNewDocument={this.newDocumentForCustomer} onViewStatement={(customer)=>this.setState({screen:'receivables'},()=>window.setTimeout(()=>window.dispatchEvent(new CustomEvent('lourex-finance-statement',{detail:{customerId:customer.id}})),0))}/>:null}
          {this.state.screen==='receivables'?<FinanceWorkspace customers={vault.customers} payments={vault.payments} company={vault.company} onSavePayment={this.savePayment} onDeletePayment={this.deletePayment} onSaveSupplierPayment={this.saveSupplierPayment} onDeleteSupplierPayment={this.deleteSupplierPayment} {...operationsProps}/>:null}
          {this.state.screen==='reports'?<ReportsPage key={'report-period-'+this.state.reportsPeriodVersion} initialPeriod={this.state.reportsPeriod||undefined} company={vault.company} customers={vault.customers} documents={vault.documents} payments={vault.payments} suppliers={vault.suppliers} purchases={vault.purchases} items={vault.savedItems}/>:null}
          {this.state.screen==='items'?<ProductsInventoryWorkspace currency={defaultCurrency} onSaveItem={this.saveSavedItem} onSaveItems={this.saveSavedItemsBatch} onDeleteItem={this.deleteSavedItem} {...operationsProps}/>:null}
          {this.state.screen==='operations'?<OperationsPage mode="purchasing" {...operationsProps}/>:null}
          {this.state.screen==='editor'&&this.state.editorDoc?<EditorPage document={this.state.editorDoc} requiresStockProof={this.state.editorDoc.kind==='invoice'&&this.state.editorDoc.role==='standard'&&vault.inventoryMovements.some(m=>m.sourceId===this.state.editorDoc!.id&&isIssuedInvoiceStockIssue(m))} documents={vault.documents} customers={vault.customers} suppliers={vault.suppliers} company={vault.company} savedItems={vault.savedItems} payments={vault.payments} documentEvents={vault.documentEvents} documentRevisions={vault.documentRevisions} smartDefaults={vault.appSettings.smartDefaults} onEditActivity={this.deferQueuedCloudSaveForDocumentEdit} onClose={this.closeEditor} onSave={this.saveDocument} onSaveCustomer={this.saveCustomer} onSaveSavedItem={this.saveSavedItem} onSaveDocumentItem={this.saveDocumentItem} onUseSavedItems={this.useSavedItems} onDeleteSavedItem={this.deleteSavedItem} onSaveSmartDefaults={this.saveSmartDefaults} onSavePayment={this.savePayment} onDeletePayment={this.deletePayment} onBeginRevision={this.beginRevision} onDiscardRevision={this.discardRevision} onVoidDocument={this.voidDocument} onCreateCreditNote={this.createCreditNote} onConvert={this.convert} onPrint={this.requestPrint}/>:null}
        </main>
      </AppShell>
      <RecurringWorkflowsManager open={this.state.recurringOpen} filter={this.state.recurringFilter} workflows={vault.recurringWorkflows} sourceDocument={vault.documents.find(item=>item.id===this.state.recurringSourceDocumentId)??null} sourcePurchase={vault.purchases.find(item=>item.id===this.state.recurringSourcePurchaseId)??null} onClose={this.closeRecurringManager} onSave={this.saveRecurringWorkflow} onDelete={this.deleteRecurringWorkflow} onGenerate={this.generateRecurringWorkflow} onOpenGenerated={this.openRecurringGenerated}/>
      <GlobalSearch documents={vault.documents} payments={vault.payments} customers={vault.customers} items={vault.savedItems} suppliers={vault.suppliers} purchases={vault.purchases} language={activeLanguage} onNavigate={navigate} onOpenDocument={(doc)=>void this.openDocument(doc)} onNewDocument={(kind)=>void this.newDocument(kind)}/>
      <SettingsModal open={this.state.settingsOpen} company={vault.company} appSettings={vault.appSettings} documentEvents={vault.documentEvents} teamMembers={vault.teamMembers} approvalPolicies={vault.approvalPolicies} approvalRequests={vault.approvalRequests} workspaces={vault.workspaces} branches={vault.branches} onCreateWorkspace={this.createCompanyWorkspace} onSwitchWorkspace={this.switchCompanyWorkspace} onCreateBranch={this.createWorkspaceBranch} onSwitchBranch={this.switchWorkspaceBranch} onSaveTeamMember={this.saveTeamMember} onToggleTeamMember={this.toggleTeamMember} onSetActiveTeamMember={this.setActiveTeamMember} onToggleApprovalPolicy={this.toggleApprovalPolicy} onDecideApproval={this.decideApproval} cloudUser={this.state.cloudUser} onCloudRestore={this.cloudRestore} onCloudSignOut={this.cloudSignOut} onClose={()=>this.setState({settingsOpen:false})} onSaveCompany={this.saveCompany} onSaveAppSettings={this.saveAppSettings} onBackup={this.backup} onRestore={this.restore}/>
      {this.cloudModal()}
      {this.catalogLauncherModal(vault)}
      <ConfirmDialog open={Boolean(this.state.deletingDoc)} title={t(`Delete ${this.state.deletingDoc?.number ?? 'document'}?`,`حذف ${this.state.deletingDoc?.number ?? 'المستند'}؟`)} message={t('This action cannot be undone.','لا يمكن التراجع عن هذا الإجراء.')} onCancel={()=>this.setState({deletingDoc:null})} onConfirm={()=>void this.deleteDocument()}/><Toast text={this.state.toast} tone={this.state.toastTone}/></div>
      <div className="print-portal">{this.state.printDoc?(isLetterDocument(this.state.printDoc)?<DraftDocumentRenderer document={this.state.printDoc} scale={1}/>:<TemplateRenderer document={this.state.printDoc} scale={1}/>):null}</div></div>;
  }
}
