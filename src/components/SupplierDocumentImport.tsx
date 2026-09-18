import type { PurchaseRecord, SavedItem, Supplier, UiLanguage } from '../types.js';
import { t } from '../lib/i18n.js';
import { createPurchase, createPurchaseItem, supplierSnapshotFrom } from '../lib/operations.js';
import { normalizeSavedItemIdentity, normalizeSavedItemSku } from '../lib/saved-items.js';
import { resumeVaultSession, saveVault } from '../storage/vault.js';
import { Button, Modal } from './UI.js';

const XLSX_CDN='https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
const MAX_BINARY_BYTES=2_600_000;
const MAX_TEXT_CHARS=120_000;

type ImportDraft={supplierName:string;supplierTaxId:string;documentNumber:string;date:string;currency:string;freight:string;duty:string;otherCosts:string;paymentTerms:string;notes:string;items:Array<{sku:string;descriptionEn:string;descriptionAr:string;quantity:string;unit:string;unitCost:string}>};
interface Props{language:UiLanguage;}
interface State{open:boolean;busy:boolean;error:string;fileName:string;draft:ImportDraft|null;model:string;}

function ensureXlsx():Promise<any>{const existing=(window as any).XLSX;if(existing)return Promise.resolve(existing);return new Promise((resolve,reject)=>{const found=document.querySelector(`script[src="${XLSX_CDN}"]`) as HTMLScriptElement|null;if(found){found.addEventListener('load',()=>resolve((window as any).XLSX),{once:true});found.addEventListener('error',()=>reject(new Error(t('Unable to load the Excel reader.','تعذر تحميل قارئ Excel.'))),{once:true});return;}const script=document.createElement('script');script.src=XLSX_CDN;script.async=true;script.crossOrigin='anonymous';script.onload=()=>resolve((window as any).XLSX);script.onerror=()=>reject(new Error(t('Unable to load the Excel reader.','تعذر تحميل قارئ Excel.')));document.head.appendChild(script);});}
function bytesToBase64(buffer:ArrayBuffer):string{const bytes=new Uint8Array(buffer);let binary='';const chunk=0x8000;for(let offset=0;offset<bytes.length;offset+=chunk)binary+=String.fromCharCode(...bytes.subarray(offset,Math.min(offset+chunk,bytes.length)));return btoa(binary);}
async function filePayload(file:File):Promise<{kind:'text'|'file';mimeType:string;text?:string;data?:string}>{
  const name=file.name.toLocaleLowerCase();
  if(name.endsWith('.csv')||name.endsWith('.txt'))return{kind:'text',mimeType:'text/csv',text:(await file.text()).slice(0,MAX_TEXT_CHARS)};
  if(name.endsWith('.xlsx')||name.endsWith('.xls')){
    const XLSX=await ensureXlsx();if(!XLSX?.read||!XLSX?.utils?.sheet_to_csv)throw new Error(t('The Excel reader did not initialize correctly.','لم يبدأ قارئ Excel بشكل صحيح.'));
    const workbook=XLSX.read(await file.arrayBuffer(),{type:'array',cellDates:false});const chunks:string[]=[];
    for(const sheetName of (workbook.SheetNames??[]).slice(0,6)){const csv=String(XLSX.utils.sheet_to_csv(workbook.Sheets[sheetName],{blankrows:false}));chunks.push(`--- SHEET: ${sheetName} ---\n${csv}`);if(chunks.join('\n').length>=MAX_TEXT_CHARS)break;}
    const text=chunks.join('\n').slice(0,MAX_TEXT_CHARS);if(!text.trim())throw new Error(t('The workbook does not contain readable purchase data.','ملف Excel لا يحتوي بيانات شراء قابلة للقراءة.'));return{kind:'text',mimeType:'text/csv',text};
  }
  const mime=file.type|| (name.endsWith('.pdf')?'application/pdf':'');if(!['application/pdf','image/png','image/jpeg','image/webp'].includes(mime))throw new Error(t('Use PDF, image, Excel or CSV.','استخدم PDF أو صورة أو Excel أو CSV.'));
  if(file.size>MAX_BINARY_BYTES)throw new Error(t('This PDF/image is too large for safe AI import. Reduce it below 2.6 MB.','ملف PDF/الصورة كبير للاستيراد الآمن. خفّضه لأقل من 2.6 MB.'));
  return{kind:'file',mimeType:mime,data:bytesToBase64(await file.arrayBuffer())};
}
function normalize(value:string):string{return value.normalize('NFKC').trim().replace(/\s+/g,' ').toLocaleLowerCase();}
function supplierMatch(suppliers:Supplier[],draft:ImportDraft):Supplier|undefined{const name=normalize(draft.supplierName);const tax=normalize(draft.supplierTaxId);return suppliers.find(supplier=>(tax&&[supplier.vatTaxNumber,supplier.commercialRegistration].some(value=>normalize(value)===tax))||(name&&[supplier.nameEn,supplier.nameAr].some(value=>normalize(value)===name)));}
function itemMatch(items:SavedItem[],row:ImportDraft['items'][number]):SavedItem|undefined{const sku=normalizeSavedItemSku(row.sku);if(sku){const exact=items.find(item=>normalizeSavedItemSku(item.sku??'')===sku);if(exact)return exact;}const en=normalizeSavedItemIdentity(row.descriptionEn),ar=normalizeSavedItemIdentity(row.descriptionAr);return items.find(item=>(en&&normalizeSavedItemIdentity(item.descriptionEn)===en)||(ar&&normalizeSavedItemIdentity(item.descriptionAr)===ar));}
function buildPurchase(draft:ImportDraft,purchases:PurchaseRecord[],suppliers:Supplier[],items:SavedItem[],fallbackCurrency:string):PurchaseRecord{
  const matchedSupplier=supplierMatch(suppliers,draft);let purchase=createPurchase(purchases,matchedSupplier?[matchedSupplier]:[],draft.currency||matchedSupplier?.defaultCurrency||fallbackCurrency||'USD');const now=new Date().toISOString();
  purchase={...purchase,date:draft.date||purchase.date,currency:(draft.currency||purchase.currency).toUpperCase(),supplierSnapshot:matchedSupplier?supplierSnapshotFrom(matchedSupplier):draft.supplierName?{sourceSupplierId:'',nameEn:draft.supplierName,nameAr:'',contactPerson:'',address:'',city:'',country:'',phone:'',email:'',vatTaxNumber:draft.supplierTaxId,commercialRegistration:''}:null,freight:draft.freight||'0.00',duty:draft.duty||'0.00',otherCosts:draft.otherCosts||'0.00',notes:[draft.documentNumber?`Supplier document: ${draft.documentNumber}`:'',draft.paymentTerms?`Payment terms: ${draft.paymentTerms}`:'',draft.notes].filter(Boolean).join('\n'),status:'draft',updatedAt:now};
  purchase.items=draft.items.map(row=>{const saved=itemMatch(items,row);const line=createPurchaseItem(saved);return{...line,savedItemId:saved?.id??'',sku:row.sku||saved?.sku||'',descriptionEn:row.descriptionEn||saved?.descriptionEn||'',descriptionAr:row.descriptionAr||saved?.descriptionAr||'',quantity:row.quantity,unit:row.unit||saved?.unit||'PCS',unitCost:row.unitCost,landedUnitCost:'',previousUnitCost:saved?.lastUnitCost??'',previousCostCurrency:saved?.lastCostCurrency??''};});return purchase;
}

export class SupplierDocumentImport extends React.Component<Props,State>{
  private input:HTMLInputElement|null=null;
  state:State={open:false,busy:false,error:'',fileName:'',draft:null,model:''};
  private openPicker=()=>{this.setState({open:true,error:'',fileName:'',draft:null,model:''},()=>this.input?.click());};
  private close=()=>{if(!this.state.busy)this.setState({open:false,error:'',draft:null,fileName:'',model:''});};
  private choose=async(file:File|null)=>{
    if(!file||this.state.busy)return;this.setState({busy:true,error:'',draft:null,fileName:file.name,model:''});
    try{const payload=await filePayload(file);const response=await fetch('/api/supplier-document-ai',{method:'POST',headers:{'Content-Type':'application/json','X-Requested-With':'LOUREX-Invoice'},body:JSON.stringify({fileName:file.name,...payload})});let body:any={};try{body=await response.json();}catch{}if(!response.ok)throw new Error(String(body?.message||t('Unable to analyze this supplier document.','تعذر تحليل مستند المورد.')));if(!body?.draft?.items?.length)throw new Error(t('No reliable purchase lines were found.','لم يتم العثور على بنود شراء موثوقة.'));this.setState({draft:body.draft as ImportDraft,model:String(body.model||''),busy:false});}
    catch(error){this.setState({busy:false,error:error instanceof Error?error.message:String(error),draft:null});}
    finally{if(this.input)this.input.value='';}
  };
  private saveDraft=async()=>{
    const extracted=this.state.draft;if(!extracted||this.state.busy)return;this.setState({busy:true,error:''});
    try{const resumed=await resumeVaultSession();if(!resumed)throw new Error(t('Unlock LOUREX first.','افتح قفل LOUREX أولًا.'));const purchase=buildPurchase(extracted,resumed.vault.purchases,resumed.vault.suppliers,resumed.vault.savedItems,resumed.vault.appSettings.smartDefaults.currency||resumed.vault.company.defaultCurrency);await saveVault(resumed.key,{...resumed.vault,purchases:[...resumed.vault.purchases,purchase]});window.location.reload();}
    catch(error){this.setState({busy:false,error:error instanceof Error?error.message:String(error)});}
  };
  render():any{const d=this.state.draft;return <>
    <Button icon="upload" onClick={this.openPicker}>{t('Import Supplier Document','استيراد مستند مورد')}</Button>
    <Modal open={this.state.open} title={t('Supplier Document → Purchase Draft','مستند مورد ← مسودة شراء')} size="lg" onClose={this.close} footer={d?<div style={{display:'flex',gap:8,justifyContent:'flex-end'}}><Button disabled={this.state.busy} onClick={this.close}>{t('Cancel','إلغاء')}</Button><Button variant="primary" disabled={this.state.busy} onClick={()=>void this.saveDraft()}>{this.state.busy?t('Saving…','جارٍ الحفظ…'):t('Approve & Save Draft','موافقة وحفظ المسودة')}</Button></div>:undefined}>
      <input ref={(node:any)=>{this.input=node;}} style={{display:'none'}} type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.xlsx,.xls,.csv,application/pdf,image/png,image/jpeg,image/webp,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv" onChange={(event:any)=>void this.choose(event.target.files?.[0]??null)}/>
      {!d?<div style={{display:'grid',gap:14,padding:'8px 0'}}><p style={{margin:0}}>{t('Choose a supplier proforma, invoice, PDF, image, Excel or CSV. LOUREX extracts a purchase draft only; nothing is posted to inventory until you review and post it from Operations.','اختر بروفورما أو فاتورة مورد أو PDF أو صورة أو Excel أو CSV. يستخرج LOUREX مسودة شراء فقط؛ ولا يتم ترحيل أي مخزون حتى تراجعها وترحلها من العمليات.')}</p>{this.state.fileName?<strong>{this.state.fileName}</strong>:null}{this.state.busy?<span>{t('LOUREX AI is extracting the document…','ذكاء LOUREX يستخرج بيانات المستند…')}</span>:<Button icon="upload" onClick={()=>this.input?.click()}>{t('Choose File','اختر ملفًا')}</Button>}{this.state.error?<div className="inline-error" role="alert">{this.state.error}</div>:null}</div>:<div style={{display:'grid',gap:14}}>
        <div><strong>{d.supplierName||t('Supplier not identified','لم يتم تحديد المورد')}</strong><div>{[d.documentNumber,d.date,d.currency].filter(Boolean).join(' · ')}</div></div>
        <div style={{display:'grid',gap:7,maxHeight:'42vh',overflow:'auto'}}>{d.items.map((item,index)=><div key={`${item.sku}-${index}`} style={{display:'grid',gridTemplateColumns:'1fr auto',gap:10,padding:'9px 0',borderBottom:'1px solid rgba(255,255,255,.08)'}}><span><strong>{item.descriptionEn||item.descriptionAr||item.sku}</strong><small style={{display:'block',opacity:.7}}>{[item.sku,item.quantity,item.unit].filter(Boolean).join(' · ')}</small></span><bdi>{item.unitCost} {d.currency}</bdi></div>)}</div>
        <div><strong>{t('Extra costs','التكاليف الإضافية')}</strong><div>{t('Freight','الشحن')}: {d.freight} · {t('Duty','الجمارك')}: {d.duty} · {t('Other','أخرى')}: {d.otherCosts}</div></div>
        <small>{t('Review carefully before approval. Saving here creates a draft purchase only.','راجع البيانات قبل الموافقة. الحفظ هنا ينشئ مسودة شراء فقط.')}</small>{this.state.error?<div className="inline-error" role="alert">{this.state.error}</div>:null}
      </div>}
    </Modal>
  </>;}
}
