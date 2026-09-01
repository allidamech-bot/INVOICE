import type { SavedItem } from '../types.js';
import { importableProducts, parseCsvMatrix, planProductImport, productImportTemplateCsv, type ProductImportPlan } from '../lib/product-import.js';
import { t } from '../lib/i18n.js';
import { Button, Icon, IconButton, Modal, Toggle } from './UI.js';

const XLSX_CDN='https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';

type Matrix=unknown[][];
type ImportStage='pick'|'preview'|'importing'|'done';

interface Props {
  open:boolean;
  items:SavedItem[];
  currency:string;
  onClose:()=>void;
  onSaveMany:(items:SavedItem[])=>Promise<void>;
}

interface State {
  stage:ImportStage;
  fileName:string;
  matrix:Matrix;
  plan:ProductImportPlan|null;
  updateExisting:boolean;
  error:string;
  total:number;
  imported:number;
}

function downloadText(filename:string,text:string,type:string):void{
  const blob=new Blob([text],{type});
  const url=URL.createObjectURL(blob);
  const anchor=document.createElement('a');
  anchor.href=url;anchor.download=filename;anchor.style.display='none';
  document.body.appendChild(anchor);anchor.click();anchor.remove();
  window.setTimeout(()=>URL.revokeObjectURL(url),500);
}

function ensureXlsx():Promise<any>{
  const existing=(window as any).XLSX;
  if(existing)return Promise.resolve(existing);
  return new Promise((resolve,reject)=>{
    const found=document.querySelector(`script[src="${XLSX_CDN}"]`) as HTMLScriptElement|null;
    if(found){
      found.addEventListener('load',()=>resolve((window as any).XLSX),{once:true});
      found.addEventListener('error',()=>reject(new Error('Unable to load the Excel reader. Check your connection and try again.')),{once:true});
      return;
    }
    const script=document.createElement('script');
    script.src=XLSX_CDN;script.async=true;script.crossOrigin='anonymous';
    script.onload=()=>resolve((window as any).XLSX);
    script.onerror=()=>reject(new Error('Unable to load the Excel reader. Check your connection and try again.'));
    document.head.appendChild(script);
  });
}

async function matrixFromFile(file:File):Promise<Matrix>{
  const name=file.name.toLocaleLowerCase();
  if(name.endsWith('.csv')||name.endsWith('.txt'))return parseCsvMatrix(await file.text());
  if(name.endsWith('.xlsx')||name.endsWith('.xls')){
    const XLSX=await ensureXlsx();
    if(!XLSX?.read||!XLSX?.utils?.sheet_to_json)throw new Error('The Excel reader did not initialize correctly.');
    const workbook=XLSX.read(await file.arrayBuffer(),{type:'array',cellDates:false});
    const firstName=workbook.SheetNames?.[0];
    if(!firstName)throw new Error('The Excel workbook does not contain a worksheet.');
    return XLSX.utils.sheet_to_json(workbook.Sheets[firstName],{header:1,raw:false,defval:''}) as Matrix;
  }
  throw new Error('Use an Excel (.xlsx/.xls) or CSV file.');
}

function productName(item:SavedItem|null):string{
  if(!item)return '—';
  return item.descriptionEn||item.descriptionAr||t('Unnamed product','صنف بلا اسم');
}

function actionLabel(action:string):string{
  if(action==='create')return t('New','جديد');
  if(action==='update')return t('Update','تحديث');
  if(action==='skip')return t('Skip','تخطي');
  return t('Error','خطأ');
}

export class ProductImportModal extends React.Component<Props,State>{
  private fileInput:HTMLInputElement|null=null;
  state:State={stage:'pick',fileName:'',matrix:[],plan:null,updateExisting:true,error:'',total:0,imported:0};

  componentDidUpdate(prev:Props):void{
    if(this.props.open&&!prev.open)this.reset();
  }

  private reset=()=>this.setState({stage:'pick',fileName:'',matrix:[],plan:null,updateExisting:true,error:'',total:0,imported:0});

  private close=()=>{
    if(this.state.stage==='importing')return;
    this.props.onClose();
  };

  private recalculate=(matrix:Matrix,updateExisting:boolean)=>{
    const plan=planProductImport(matrix,this.props.items,this.props.currency,updateExisting);
    this.setState({matrix,plan,updateExisting,stage:'preview',error:''});
  };

  private chooseFile=async(file:File|null)=>{
    if(!file)return;
    this.setState({error:'',fileName:file.name});
    try{
      const matrix=await matrixFromFile(file);
      this.recalculate(matrix,this.state.updateExisting);
    }catch(e){
      this.setState({stage:'pick',matrix:[],plan:null,error:e instanceof Error?e.message:t('Unable to read this file.','تعذر قراءة الملف.')});
    }finally{
      if(this.fileInput)this.fileInput.value='';
    }
  };

  private toggleUpdates=(updateExisting:boolean)=>{
    if(!this.state.matrix.length){this.setState({updateExisting});return;}
    try{this.recalculate(this.state.matrix,updateExisting);}catch(e){this.setState({error:e instanceof Error?e.message:String(e)});}
  };

  private downloadTemplate=()=>downloadText('LOUREX-Product-Import-Template.csv',productImportTemplateCsv(),'text/csv;charset=utf-8');

  private apply=async()=>{
    const plan=this.state.plan;
    if(!plan||plan.counts.error>0)return;
    const products=importableProducts(plan);
    if(!products.length){this.setState({stage:'done',total:0,imported:0});return;}
    this.setState({stage:'importing',error:'',total:products.length,imported:0});
    try{
      await this.props.onSaveMany(products);
      this.setState({stage:'done',imported:products.length});
    }catch(e){
      this.setState({stage:'preview',imported:0,error:t(`Import failed before the catalog was changed. ${e instanceof Error?e.message:'Try again.'}`,`فشل الاستيراد قبل تغيير الكتالوج. ${e instanceof Error?e.message:'حاول مرة أخرى.'}`)});
    }
  };

  render():any{
    const {plan,stage}=this.state;
    const previewRows=plan?.rows.slice(0,120)??[];
    const footer=stage==='preview'&&plan
      ? <div className="product-import-footer">
          <Button onClick={this.close}>{t('Cancel','إلغاء')}</Button>
          <Button variant="primary" icon="upload" disabled={plan.counts.error>0||plan.counts.create+plan.counts.update===0} onClick={()=>void this.apply()}>
            {plan.counts.error>0?t('Fix file errors first','أصلح أخطاء الملف أولًا'):t(`Import ${plan.counts.create+plan.counts.update} products`,`استيراد ${plan.counts.create+plan.counts.update} صنف`)}
          </Button>
        </div>
      : stage==='done'
        ? <div className="product-import-footer"><span/><Button variant="primary" icon="check" onClick={this.close}>{t('Done','تم')}</Button></div>
        : undefined;

    return <Modal open={this.props.open} title={t('Import Products','استيراد الأصناف')} size="xl" onClose={this.close} footer={footer}>
      <div className={`product-import-shell stage-${stage}`}>
        {stage==='pick'?<>
          <div className="product-import-hero">
            <div className="product-import-icon"><Icon name="upload" size={28}/></div>
            <div><p className="eyebrow">{t('Fast catalog setup','إعداد سريع للكتالوج')}</p><h3>{t('Bring your product list in one clean step','أدخل قائمة أصنافك بخطوة مرتبة')}</h3><p>{t('Excel and CSV are checked before anything is saved. Existing products are matched by SKU first, then exact product name.','يتم فحص Excel وCSV قبل حفظ أي شيء. تتم مطابقة الأصناف الموجودة بالـSKU أولًا، ثم باسم الصنف المطابق تمامًا.')}</p></div>
          </div>
          <button type="button" className="product-import-dropzone" onClick={()=>this.fileInput?.click()}>
            <Icon name="upload" size={23}/><strong>{t('Choose Excel or CSV file','اختر ملف Excel أو CSV')}</strong><span>.xlsx · .xls · .csv</span>
          </button>
          <input ref={(node:any)=>{this.fileInput=node;}} className="product-import-file-input" type="file" accept=".xlsx,.xls,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" onChange={(e:any)=>void this.chooseFile(e.target.files?.[0]??null)}/>
          <div className="product-import-safety-grid">
            <div><Icon name="eye"/><span><strong>{t('Preview first','معاينة أولًا')}</strong><small>{t('Nothing is saved until you approve the preview.','لا يتم حفظ شيء قبل موافقتك على المعاينة.')}</small></span></div>
            <div><Icon name="refresh"/><span><strong>{t('One secure write','حفظ آمن بعملية واحدة')}</strong><small>{t('The approved batch is committed together, avoiding hundreds of repeated vault writes.','يتم حفظ الدفعة المعتمدة معًا لتجنب مئات عمليات كتابة الخزنة المتكررة.')}</small></span></div>
            <div><Icon name="check"/><span><strong>{t('Duplicate protection','حماية من التكرار')}</strong><small>{t('Repeated SKU and conflicting names are flagged before import.','يتم كشف SKU المكرر وتعارض الأسماء قبل الاستيراد.')}</small></span></div>
          </div>
          <div className="product-import-template-bar"><div><strong>{t('Need the correct columns?','تحتاج الأعمدة الصحيحة؟')}</strong><span>{t('Download the LOUREX CSV template and fill it in Excel.','حمّل قالب LOUREX بصيغة CSV وافتحه وعبّئه في Excel.')}</span></div><Button icon="download" onClick={this.downloadTemplate}>{t('Download template','تحميل القالب')}</Button></div>
        </>:null}

        {stage==='preview'&&plan?<>
          <div className="product-import-preview-head">
            <div className="product-import-file-summary"><span className="product-import-file-icon"><Icon name="file"/></span><div><strong>{this.state.fileName}</strong><small>{t(`${plan.rows.length} data rows · ${plan.recognizedFields.length} recognized columns`,`${plan.rows.length} صف بيانات · ${plan.recognizedFields.length} أعمدة معروفة`)}</small></div><IconButton icon="refresh" label={t('Choose another file','اختيار ملف آخر')} onClick={()=>this.setState({stage:'pick',plan:null,matrix:[],error:''})}/></div>
            <Toggle checked={this.state.updateExisting} onChange={this.toggleUpdates} label={t('Update products that already exist','تحديث الأصناف الموجودة بالفعل')}/>
          </div>
          <div className="product-import-counts" aria-label={t('Import summary','ملخص الاستيراد')}>
            <div className="is-create"><strong>{plan.counts.create}</strong><span>{t('New','جديد')}</span></div>
            <div className="is-update"><strong>{plan.counts.update}</strong><span>{t('Updates','تحديث')}</span></div>
            <div className="is-skip"><strong>{plan.counts.skip}</strong><span>{t('Skipped','متخطى')}</span></div>
            <div className={`is-error ${plan.counts.error?'has-value':''}`}><strong>{plan.counts.error}</strong><span>{t('Errors','أخطاء')}</span></div>
          </div>
          {plan.counts.error?<div className="product-import-alert" role="alert"><Icon name="lock"/><div><strong>{t('Import is locked until file errors are fixed','الاستيراد متوقف حتى يتم إصلاح أخطاء الملف')}</strong><span>{t('This prevents partial or ambiguous catalog changes. Correct the highlighted rows in the source file, then choose it again.','هذا يمنع تغييرات جزئية أو ملتبسة في الكتالوج. صحح الصفوف المحددة في الملف ثم اختره من جديد.')}</span></div></div>:null}
          <div className="product-import-table-wrap">
            <table className="product-import-table"><thead><tr><th>#</th><th>{t('Status','الحالة')}</th><th>SKU</th><th>{t('Product','الصنف')}</th><th>{t('Price','السعر')}</th><th>{t('Why','السبب')}</th></tr></thead><tbody>
              {previewRows.map(row=><tr key={`${row.rowNumber}-${row.action}`} className={`row-${row.action}`}><td>{row.rowNumber}</td><td><span className={`import-action-badge ${row.action}`}>{actionLabel(row.action)}</span></td><td><code>{row.item?.sku||'—'}</code></td><td><strong>{productName(row.item)}</strong>{row.item?.descriptionEn&&row.item.descriptionAr?<small>{row.item.descriptionAr}</small>:null}</td><td>{row.item?.lastUnitPrice?<span>{row.item.lastUnitPrice} <small>{row.item.lastCurrency}</small></span>:'—'}</td><td><span>{row.reason}</span></td></tr>)}
            </tbody></table>
          </div>
          {plan.rows.length>previewRows.length?<div className="product-import-table-note">{t(`Showing the first ${previewRows.length} of ${plan.rows.length} rows. All rows are still validated and will be processed.`,`يتم عرض أول ${previewRows.length} من ${plan.rows.length} صف. جميع الصفوف ما زالت مفحوصة وسيتم معالجتها.`)}</div>:null}
        </>:null}

        {stage==='importing'?<div className="product-import-progress"><div className="product-import-progress-ring"><strong>…</strong></div><h3>{t('Updating product library…','جارٍ تحديث مكتبة الأصناف…')}</h3><p>{t(`Saving ${this.state.total} products in one encrypted catalog update`, `جارٍ حفظ ${this.state.total} صنف ضمن تحديث مشفّر واحد للكتالوج`)}</p><small>{t('Keep this window open until the secure write is complete.','أبقِ هذه النافذة مفتوحة حتى تكتمل عملية الحفظ الآمنة.')}</small></div>:null}

        {stage==='done'?<div className="product-import-complete"><div><Icon name="check" size={30}/></div><p className="eyebrow">{t('Import complete','اكتمل الاستيراد')}</p><h3>{this.state.imported?t(`${this.state.imported} products are ready to use`,`أصبح ${this.state.imported} صنف جاهزًا للاستخدام`):t('No changes were needed','لم تكن هناك تغييرات مطلوبة')}</h3><p>{t('Your saved-item catalog is updated and immediately available in new quotes and invoices.','تم تحديث كتالوج الأصناف وأصبح متاحًا مباشرة في عروض الأسعار والفواتير الجديدة.')}</p></div>:null}

        {this.state.error?<div className="inline-error product-import-error" role="alert">{this.state.error}</div>:null}
      </div>
    </Modal>;
  }
}
