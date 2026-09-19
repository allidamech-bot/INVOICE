import type { SavedItem } from '../types.js';
import { importableProducts, planProductImport, productImportTemplateCsv, type ProductImportField, type ProductImportPlan } from '../lib/product-import.js';
import { analyzeProductImport, applyProductImportMapping, suggestedProductImportMap, type ProductImportAnalysis, type ProductImportColumnMap, type ProductImportConfidence, type ProductImportMappingReason } from '../lib/product-import-intelligence.js';
import { ambiguousProductImportColumns, mergeProductImportAiMapping, requestProductImportAiMapping } from '../lib/product-import-ai.js';
import { readSpreadsheetFile, type SpreadsheetSheet } from '../lib/spreadsheet-reader.js';
import { t } from '../lib/i18n.js';
import { Button, Icon, Modal, Toggle } from './UI.js';

type Matrix=unknown[][];
type ImportStage='pick'|'reading'|'mapping'|'preview'|'importing'|'done';

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
  sheets:SpreadsheetSheet[];
  sheetIndex:number;
  matrix:Matrix;
  analysis:ProductImportAnalysis|null;
  mapping:ProductImportColumnMap;
  plan:ProductImportPlan|null;
  updateExisting:boolean;
  error:string;
  total:number;
  imported:number;
  aiLoading:boolean;
  aiModel:string;
  aiIndexes:number[];
}

const FIELD_OPTIONS:Array<{value:ProductImportField;en:string;ar:string}>=[
  {value:'sku',en:'SKU / Product code',ar:'SKU / كود الصنف'},
  {value:'descriptionEn',en:'Product name — English',ar:'اسم الصنف — إنجليزي'},
  {value:'descriptionAr',en:'Product name — Arabic',ar:'اسم الصنف — عربي'},
  {value:'lastUnitPrice',en:'Sale price',ar:'سعر البيع'},
  {value:'lastCurrency',en:'Sale currency',ar:'عملة البيع'},
  {value:'lastUnitCost',en:'Purchase cost',ar:'تكلفة الشراء'},
  {value:'lastCostCurrency',en:'Cost currency',ar:'عملة التكلفة'},
  {value:'unit',en:'Unit',ar:'الوحدة'},
  {value:'packing',en:'Packing',ar:'التعبئة'},
  {value:'origin',en:'Country of origin',ar:'بلد المنشأ'},
  {value:'hsCode',en:'HS code',ar:'HS Code'},
  {value:'category',en:'Category',ar:'التصنيف'},
  {value:'tags',en:'Tags',ar:'الوسوم'},
  {value:'favorite',en:'Favorite',ar:'مفضلة'}
];

const MAX_SPREADSHEET_BYTES=12*1024*1024;

function fieldLabel(field:ProductImportField|null):string{
  if(!field)return t('Not imported — choose a field','لن يُستورد — اختر حقلًا');
  const option=FIELD_OPTIONS.find(entry=>entry.value===field);
  return option?t(option.en,option.ar):field;
}

function confidenceLabel(confidence:ProductImportConfidence,selected:ProductImportField|null,fromAi:boolean):string{
  if(fromAi)return t('AI suggestion','اقتراح AI');
  if(selected&&(confidence==='low'||confidence==='unmapped'))return t('Manual mapping','ربط يدوي');
  if(confidence==='high')return t('Matched','مطابق');
  if(confidence==='medium')return t('Suggested','مقترح');
  if(confidence==='low')return t('Review','يحتاج مراجعة');
  return t('Unresolved','غير محسوم');
}

function mappingReason(reason:ProductImportMappingReason):string{
  if(reason==='exact')return t('Known commercial heading','عنوان تجاري معروف');
  if(reason==='header')return t('Matched from the heading','مطابقة من عنوان العمود');
  if(reason==='samples')return t('Suggested from sample values','اقتراح من القيم النموذجية');
  if(reason==='conflict')return t('A stronger source column already uses this field','عمود أقوى يستخدم هذا الحقل');
  return t('Choose a field only if this data should be imported','اختر حقلًا فقط إذا كانت هذه البيانات مطلوبة');
}

function unsupportedColumnNote(header:string):string{
  const normalized=header.normalize('NFKC').toLowerCase().replace(/[_\-]+/g,' ').replace(/\s+/g,' ').trim();
  if(/(?:stock|inventory|availability|available|on hand|quantity|qty|المخزون|التوفر|الكمية)/.test(normalized)){
    return t('Stock belongs to Inventory and is never changed by a catalog import.','المخزون يُدار من شاشة المخزون ولا يغيّره استيراد الكتالوج.');
  }
  if(/(?:image|photo|picture|thumbnail|صورة|صور)/.test(normalized)){
    return t('Product images are not stored by this catalog import.','صور الأصناف لا يتم حفظها بواسطة استيراد الكتالوج.');
  }
  return '';
}

function downloadText(filename:string,text:string,type:string):void{
  const blob=new Blob([text],{type});
  const url=URL.createObjectURL(blob);
  const anchor=document.createElement('a');
  anchor.href=url;anchor.download=filename;anchor.style.display='none';
  document.body.appendChild(anchor);anchor.click();anchor.remove();
  window.setTimeout(()=>URL.revokeObjectURL(url),500);
}

function bestSheet(sheets:SpreadsheetSheet[]):number{
  let winner=0;let best=-1;
  sheets.forEach((sheet,index)=>{
    const analysis=analyzeProductImport(sheet.matrix);
    const confident=analysis.columns.filter(column=>column.confidence==='high'||column.confidence==='medium').length;
    const score=(analysis.headerIndex>=0?100:0)+analysis.recognizedFields.length*20+confident*5+Math.min(sheet.nonEmptyRows,20);
    if(score>best){best=score;winner=index;}
  });
  return winner;
}

function productName(item:SavedItem|null):string{
  if(!item)return '—';
  return item.descriptionEn||item.descriptionAr||t('Unnamed product','صنف بلا اسم');
}

function productDetails(item:SavedItem|null):string{
  if(!item)return '—';
  return [item.unit,item.packing,item.origin,item.hsCode?`HS ${item.hsCode}`:''].filter(Boolean).join(' · ')||'—';
}

function actionLabel(action:string):string{
  if(action==='create')return t('New','جديد');
  if(action==='update')return t('Update','تحديث');
  if(action==='skip')return t('Skip','تخطي');
  return t('Error','خطأ');
}

export class ProductImportModal extends React.Component<Props,State>{
  private fileInput:HTMLInputElement|null=null;
  private fileReadGeneration=0;
  private applyInFlight=false;
  private aiAbort:AbortController|null=null;

  state:State={stage:'pick',fileName:'',sheets:[],sheetIndex:0,matrix:[],analysis:null,mapping:[],plan:null,updateExisting:true,error:'',total:0,imported:0,aiLoading:false,aiModel:'',aiIndexes:[]};

  componentDidUpdate(prev:Props):void{
    if(this.props.open&&!prev.open)this.reset();
    if(!this.props.open&&prev.open)this.cancelPending();
  }

  componentWillUnmount():void{this.cancelPending();}

  private cancelPending=()=>{
    this.fileReadGeneration+=1;
    this.aiAbort?.abort();
    this.aiAbort=null;
  };

  private reset=()=>{
    this.cancelPending();
    this.applyInFlight=false;
    this.setState({stage:'pick',fileName:'',sheets:[],sheetIndex:0,matrix:[],analysis:null,mapping:[],plan:null,updateExisting:true,error:'',total:0,imported:0,aiLoading:false,aiModel:'',aiIndexes:[]});
  };

  private close=()=>{
    if(this.applyInFlight||this.state.stage==='importing')return;
    this.cancelPending();
    this.props.onClose();
  };

  private analyzeSheet=(sheets:SpreadsheetSheet[],sheetIndex:number)=>{
    const sheet=sheets[sheetIndex];
    if(!sheet)throw new Error(t('The selected worksheet is unavailable.','ورقة العمل المحددة غير متاحة.'));
    const analysis=analyzeProductImport(sheet.matrix);
    if(analysis.headerIndex<0||!analysis.columns.length)throw new Error(t('No usable product columns were found in this worksheet. Choose another sheet or check the header row.','لم يتم العثور على أعمدة أصناف قابلة للاستخدام في هذه الورقة. اختر ورقة أخرى أو تحقق من صف العناوين.'));
    return {matrix:sheet.matrix,analysis,mapping:suggestedProductImportMap(analysis)};
  };

  private chooseSheet=(sheetIndex:number)=>{
    try{
      const next=this.analyzeSheet(this.state.sheets,sheetIndex);
      this.aiAbort?.abort();
      this.setState({...next,sheetIndex,plan:null,stage:'mapping',error:'',aiLoading:false,aiModel:'',aiIndexes:[]});
    }catch(error){this.setState({sheetIndex,error:error instanceof Error?error.message:String(error)});}
  };

  private buildPlan=(matrix:Matrix,analysis:ProductImportAnalysis,mapping:ProductImportColumnMap,updateExisting:boolean):ProductImportPlan=>
    planProductImport(applyProductImportMapping(matrix,analysis,mapping),this.props.items,this.props.currency,updateExisting);

  private enterPreview=()=>{
    const {matrix,analysis,mapping,updateExisting}=this.state;
    if(!analysis)return;
    try{this.setState({plan:this.buildPlan(matrix,analysis,mapping,updateExisting),stage:'preview',error:''});}
    catch(error){this.setState({error:error instanceof Error?error.message:String(error)});}
  };

  private chooseFile=async(file:File|null)=>{
    if(!file||this.applyInFlight)return;
    if(file.size>MAX_SPREADSHEET_BYTES){
      this.setState({stage:'pick',error:t('This spreadsheet is larger than 12 MB. Split it into smaller files so it can be reviewed safely on this device.','حجم الجدول أكبر من 12 ميجابايت. قسّمه إلى ملفات أصغر لتتم مراجعته بأمان على هذا الجهاز.')});
      if(this.fileInput)this.fileInput.value='';
      return;
    }
    const generation=++this.fileReadGeneration;
    this.aiAbort?.abort();
    this.setState({stage:'reading',error:'',fileName:file.name,sheets:[],matrix:[],analysis:null,mapping:[],plan:null,aiLoading:false,aiModel:'',aiIndexes:[]});
    try{
      const sheets=await readSpreadsheetFile(file);
      if(generation!==this.fileReadGeneration||!this.props.open)return;
      const sheetIndex=bestSheet(sheets);
      const next=this.analyzeSheet(sheets,sheetIndex);
      this.setState({...next,sheets,sheetIndex,plan:null,stage:'mapping',error:''});
    }catch(error){
      if(generation!==this.fileReadGeneration||!this.props.open)return;
      this.setState({stage:'pick',sheets:[],matrix:[],analysis:null,mapping:[],plan:null,error:error instanceof Error?error.message:t('Unable to read this file.','تعذر قراءة الملف.')});
    }finally{
      if(generation===this.fileReadGeneration&&this.fileInput)this.fileInput.value='';
    }
  };

  private changeMapping=(columnIndex:number,value:string)=>{
    const field=(value||null) as ProductImportField|null;
    const mapping=[...this.state.mapping];
    if(field){for(let index=0;index<mapping.length;index+=1){if(index!==columnIndex&&mapping[index]===field)mapping[index]=null;}}
    mapping[columnIndex]=field;
    this.setState({mapping,plan:null,error:'',aiIndexes:this.state.aiIndexes.filter(index=>index!==columnIndex)});
  };

  private restoreSmartMapping=()=>{
    const analysis=this.state.analysis;if(!analysis)return;
    this.setState({mapping:suggestedProductImportMap(analysis),plan:null,error:'',aiModel:'',aiIndexes:[]});
  };

  private useAi=async()=>{
    const {analysis,mapping}=this.state;
    if(!analysis||this.state.aiLoading)return;
    const ambiguous=ambiguousProductImportColumns(analysis,mapping);
    if(!ambiguous.length){this.setState({error:t('LOUREX already mapped every ambiguous column locally.','قام LOUREX بالفعل بربط كل الأعمدة الغامضة محليًا.')});return;}
    this.aiAbort?.abort();
    const controller=new AbortController();this.aiAbort=controller;
    this.setState({aiLoading:true,error:''});
    try{
      const result=await requestProductImportAiMapping(analysis,mapping,controller.signal);
      if(controller.signal.aborted||!this.props.open)return;
      const accepted=result.mappings.filter(entry=>entry.field&&entry.confidence!=='low').map(entry=>entry.index);
      const merged=mergeProductImportAiMapping(analysis,mapping,result.mappings);
      this.setState({mapping:merged,plan:null,aiModel:result.model,aiIndexes:accepted,error:''});
    }catch(error){
      if(!controller.signal.aborted)this.setState({error:t(`AI assistance is unavailable. ${error instanceof Error?error.message:''}`,`مساعدة الذكاء الاصطناعي غير متاحة حاليًا. ${error instanceof Error?error.message:''}`)});
    }finally{
      if(this.aiAbort===controller){this.aiAbort=null;this.setState({aiLoading:false});}
    }
  };

  private toggleUpdates=(updateExisting:boolean)=>{
    const {matrix,analysis,mapping}=this.state;
    if(!matrix.length||!analysis||this.state.stage!=='preview'){this.setState({updateExisting});return;}
    try{this.setState({plan:this.buildPlan(matrix,analysis,mapping,updateExisting),updateExisting,error:''});}
    catch(error){this.setState({updateExisting,error:error instanceof Error?error.message:String(error)});}
  };

  private downloadTemplate=()=>downloadText('LOUREX-Product-Import-Template.csv',productImportTemplateCsv(),'text/csv;charset=utf-8');

  private apply=async()=>{
    const plan=this.state.plan;
    if(this.applyInFlight||!plan||plan.counts.error>0)return;
    const products=importableProducts(plan);
    if(!products.length){this.setState({stage:'done',total:0,imported:0});return;}
    this.applyInFlight=true;
    this.setState({stage:'importing',error:'',total:products.length,imported:0});
    try{await this.props.onSaveMany(products);this.setState({stage:'done',imported:products.length});}
    catch(error){this.setState({stage:'preview',imported:0,error:t(`Import failed before the catalog was changed. ${error instanceof Error?error.message:'Try again.'}`,`فشل الاستيراد قبل تغيير الكتالوج. ${error instanceof Error?error.message:'حاول مرة أخرى.'}`)});}
    finally{this.applyInFlight=false;}
  };

  render():any{
    const {plan,stage,analysis,mapping,sheets,sheetIndex}=this.state;
    const previewRows=plan?.rows.slice(0,20)??[];
    const mappedCount=mapping.filter(Boolean).length;
    const ambiguousCount=analysis?ambiguousProductImportColumns(analysis,mapping).length:0;
    const selectedSheet=sheets[sheetIndex];
    const footer=stage==='mapping'&&analysis?
      <div className="product-import-footer"><Button onClick={()=>this.setState({stage:'pick',sheets:[],matrix:[],analysis:null,mapping:[],plan:null,error:'',aiModel:'',aiIndexes:[]})}>{t('Back','رجوع')}</Button><Button variant="primary" icon="eye" disabled={mappedCount===0||this.state.aiLoading} onClick={this.enterPreview}>{t('Review import','مراجعة الاستيراد')}</Button></div>:
      stage==='preview'&&plan?
        <div className="product-import-footer"><Button onClick={()=>this.setState({stage:'mapping',plan:null,error:''})}>{t('Column mapping','تعيين الأعمدة')}</Button><Button variant="primary" icon="upload" disabled={plan.counts.error>0||plan.counts.create+plan.counts.update===0} onClick={()=>void this.apply()}>{plan.counts.error>0?t('Fix file errors first','أصلح أخطاء الملف أولًا'):t(`Confirm import of ${plan.counts.create+plan.counts.update}`,`تأكيد استيراد ${plan.counts.create+plan.counts.update}`)}</Button></div>:
        stage==='done'?<div className="product-import-footer"><span/><Button variant="primary" icon="check" onClick={this.close}>{t('Done','تم')}</Button></div>:undefined;

    return <Modal open={this.props.open} title={t('Import Products','استيراد الأصناف')} size="xl" onClose={this.close} footer={footer}>
      <div className={`product-import-shell stage-${stage}`} data-import-stage={stage} aria-busy={stage==='reading'||stage==='importing'||this.state.aiLoading}>
        {stage==='pick'?<>
          <div className="product-import-hero"><div className="product-import-icon"><Icon name="upload" size={28}/></div><div><p className="eyebrow">{t('Smart catalog import','استيراد ذكي للكتالوج')}</p><h3>{t('Bring your product list in one clean step','أدخل قائمة أصنافك بخطوة مرتبة')}</h3><p>{t('LOUREX reads the spreadsheet locally first. Gemini is optional and sees only ambiguous headings before you review and confirm.','يقرأ LOUREX الجدول محليًا أولًا. Gemini اختياري ولا يرى إلا العناوين الغامضة قبل المراجعة والتأكيد.')}</p></div></div>
          <button type="button" className="product-import-dropzone" onClick={()=>this.fileInput?.click()}><Icon name="upload" size={23}/><strong>{t('Choose Excel or CSV file','اختر ملف Excel أو CSV')}</strong><span>.xlsx · .xls · .csv</span></button>
          <input ref={(node:any)=>{this.fileInput=node;}} className="product-import-file-input" type="file" accept=".xlsx,.xls,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" onChange={(event:any)=>void this.chooseFile(event.target.files?.[0]??null)}/>
          <div className="product-import-template-bar"><div><strong>{t('Need the correct columns?','تحتاج الأعمدة الصحيحة؟')}</strong><span>{t('Download the LOUREX CSV template with separate sale-price and purchase-cost fields.','حمّل قالب LOUREX الذي يفصل سعر البيع عن تكلفة الشراء.')}</span></div><Button icon="download" onClick={this.downloadTemplate}>{t('Download template','تحميل القالب')}</Button></div>
        </>:null}

        {stage==='reading'?<div className="product-import-progress" role="status"><span className="product-import-progress-icon"><Icon name="file"/></span><div><p className="eyebrow">{t('Reading spreadsheet','قراءة الجدول')}</p><h3>{this.state.fileName}</h3><small>{t('Detecting worksheets, headers and values locally on this device…','يتم اكتشاف الأوراق والعناوين والقيم محليًا على هذا الجهاز…')}</small></div></div>:null}

        {stage==='mapping'&&analysis?<>
          <div className="product-import-mapping-head"><div className="product-import-file-summary"><span className="product-import-file-icon"><Icon name="file"/></span><div><strong><bdi dir="auto">{this.state.fileName}</bdi></strong><small>{t(`Header row ${analysis.headerIndex+1} · ${analysis.columns.length} columns · ${selectedSheet?.nonEmptyRows??0} non-empty rows`,`صف العناوين ${analysis.headerIndex+1} · ${analysis.columns.length} أعمدة · ${selectedSheet?.nonEmptyRows??0} صفوف غير فارغة`)}</small></div></div><div className="product-import-mapping-actions"><Button icon="refresh" onClick={this.restoreSmartMapping}>{t('Local mapping','الربط المحلي')}</Button><Button variant="primary" icon="items" disabled={this.state.aiLoading||ambiguousCount===0} onClick={()=>void this.useAi()}>{this.state.aiLoading?t('Analyzing…','جارٍ التحليل…'):t(`AI assist (${ambiguousCount})`,`مساعدة AI (${ambiguousCount})`)}</Button></div></div>
          {sheets.length>1?<label className="product-import-sheet-picker"><span>{t('Worksheet','ورقة العمل')}</span><select className="input" value={sheetIndex} onChange={(event:any)=>this.chooseSheet(Number(event.target.value))}>{sheets.map((sheet,index)=><option key={`${sheet.name}-${index}`} value={index}>{sheet.name} · {sheet.nonEmptyRows} {t('rows','صفوف')}</option>)}</select></label>:null}
          <div className="product-import-intelligence-banner"><span className="product-import-intelligence-icon"><Icon name={ambiguousCount?'items':'check'}/></span><div><p className="eyebrow">{t('Local mapping first · AI optional','ربط محلي أولًا · AI اختياري')}</p><strong>{this.state.aiModel?t(`AI suggestions applied · ${this.state.aiModel}`,`تم تطبيق اقتراحات AI · ${this.state.aiModel}`):t(`${mappedCount} mapped · ${ambiguousCount} need attention`,`${mappedCount} مربوط · ${ambiguousCount} يحتاج انتباه`)}</strong><small>{t('Local high-confidence mappings stay protected. Prices, costs and quantities are never invented; unmapped columns stay out.','تبقى التعيينات المحلية عالية الثقة محمية. لا يتم اختراع الأسعار أو التكاليف أو الكميات، وتبقى الأعمدة غير المربوطة خارج الاستيراد.')}</small></div></div>
          <div className="product-import-mapping-list">{analysis.columns.map(column=>{const selected=mapping[column.index]??null;const fromAi=this.state.aiIndexes.includes(column.index);const resolved=Boolean(selected);const unsupportedNote=!resolved?unsupportedColumnNote(column.header):'';return <div className={`product-import-mapping-row confidence-${column.confidence} ${resolved?'is-resolved':'is-unresolved'}`} key={column.index}><div className="product-import-source-column"><span className="product-import-column-number">{column.index+1}</span><div><strong><bdi dir="auto">{column.header}</bdi>{fromAi?<span className="product-import-ai-mark">AI</span>:null}</strong><small><bdi dir="auto">{column.samples.length?column.samples.slice(0,2).join(' · '):t('No sample values','لا توجد قيم نموذجية')}</bdi></small></div></div><div className="product-import-map-arrow">→</div><div className="product-import-map-control"><select className="input product-import-map-select" value={selected??''} onChange={(event:any)=>this.changeMapping(column.index,event.target.value)} aria-label={t(`Map ${column.header}`,`ربط ${column.header}`)}><option value="">{fieldLabel(null)}</option>{FIELD_OPTIONS.map(option=><option key={option.value} value={option.value} disabled={mapping.some((mapped,index)=>index!==column.index&&mapped===option.value)}>{t(option.en,option.ar)}</option>)}</select><div className="product-import-confidence-line"><span className={`product-import-confidence ${fromAi?'medium':resolved?column.confidence:'unmapped'}`}>{confidenceLabel(column.confidence,selected,fromAi)}</span><small>{fromAi?t('AI suggestion — review before import','اقتراح AI — راجعه قبل الاستيراد'):unsupportedNote||mappingReason(column.reason)}</small></div></div></div>;})}</div>
          <div className="product-import-mapping-note"><Icon name="lock"/><span>{t('Nothing has been saved. Sale price and purchase cost remain separate; stock and accounting are never changed by this catalog import.','لم يتم حفظ أي شيء بعد. يبقى سعر البيع منفصلًا عن تكلفة الشراء، ولا يغيّر استيراد الكتالوج المخزون أو المحاسبة.')}</span></div>
        </>:null}

        {stage==='preview'&&plan?<>
          <div className="product-import-preview-head"><div className="product-import-file-summary"><span className="product-import-file-icon"><Icon name="file"/></span><div><strong><bdi dir="auto">{this.state.fileName}</bdi></strong><small>{t(`${plan.rows.length} data rows · ${plan.recognizedFields.length} mapped fields`,`${plan.rows.length} صف بيانات · ${plan.recognizedFields.length} حقول مربوطة`)}</small></div></div><Toggle checked={this.state.updateExisting} onChange={this.toggleUpdates} label={t('Update matching products','تحديث الأصناف المطابقة')}/></div>
          <div className="product-import-counts"><div className="is-create"><strong>{plan.counts.create}</strong><span>{t('New','جديد')}</span></div><div className="is-update"><strong>{plan.counts.update}</strong><span>{t('Updates','تحديث')}</span></div><div className="is-skip"><strong>{plan.counts.skip}</strong><span>{t('Skipped','متخطى')}</span></div><div className={`is-error ${plan.counts.error?'has-value':''}`}><strong>{plan.counts.error}</strong><span>{t('Errors','أخطاء')}</span></div></div>
          {plan.counts.error?<div className="product-import-alert" role="alert"><Icon name="lock"/><div><strong>{t('Import is locked until file errors are fixed','الاستيراد متوقف حتى يتم إصلاح أخطاء الملف')}</strong></div></div>:null}
          <div className="product-import-preview-note">{t(`Previewing ${previewRows.length} of ${plan.rows.length} parsed rows. Nothing is saved until confirmation.`,`معاينة ${previewRows.length} من أصل ${plan.rows.length} صفًا محللًا. لن يُحفظ شيء قبل التأكيد.`)}</div>
          <div className="product-import-table-wrap"><table className="product-import-table"><thead><tr><th>#</th><th>{t('Status','الحالة')}</th><th>SKU</th><th>{t('Product','الصنف')}</th><th>{t('Sale price','سعر البيع')}</th><th>{t('Purchase cost','تكلفة الشراء')}</th><th>{t('Imported details','التفاصيل المستوردة')}</th><th>{t('Why','السبب')}</th></tr></thead><tbody>{previewRows.map(row=><tr key={`${row.rowNumber}-${row.action}`} className={`row-${row.action}`}><td>{row.rowNumber}</td><td><span className={`import-action-badge ${row.action}`}>{actionLabel(row.action)}</span></td><td><code><bdi dir="ltr">{row.item?.sku||'—'}</bdi></code></td><td><strong><bdi dir="auto">{productName(row.item)}</bdi></strong></td><td>{row.item?.lastUnitPrice?<span><bdi dir="ltr">{row.item.lastUnitPrice} {row.item.lastCurrency}</bdi></span>:'—'}</td><td>{row.item?.lastUnitCost?<span><bdi dir="ltr">{row.item.lastUnitCost} {row.item.lastCostCurrency||row.item.lastCurrency}</bdi></span>:'—'}</td><td><small><bdi dir="auto">{productDetails(row.item)}</bdi></small></td><td><span>{row.reason}</span></td></tr>)}</tbody></table></div>
        </>:null}

        {stage==='importing'?<div className="product-import-progress" role="status"><span className="product-import-progress-icon"><Icon name="upload"/></span><div><p className="eyebrow">{t('Confirmed import','استيراد مؤكد')}</p><h3>{t('Saving one secure catalog update…','حفظ تحديث آمن واحد للكتالوج…')}</h3><small>{t('Please keep this window open until the save finishes.','أبقِ هذه النافذة مفتوحة حتى يكتمل الحفظ.')}</small></div></div>:null}
        {stage==='done'?<div className="product-import-complete"><div><Icon name="check" size={30}/></div><h3>{this.state.imported?t(`${this.state.imported} products are ready to use`,`أصبح ${this.state.imported} صنف جاهزًا للاستخدام`):t('No changes were needed','لم تكن هناك تغييرات مطلوبة')}</h3></div>:null}
        {this.state.error?<div className="inline-error product-import-error" role="alert">{this.state.error}</div>:null}
      </div>
    </Modal>;
  }
}
