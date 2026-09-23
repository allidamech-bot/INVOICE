import type { DocumentAttachment, LourexDocument } from '../types.js';
import { t } from '../lib/i18n.js';
import { Button, Icon, IconButton } from './UI.js';
interface Props { document:LourexDocument; onChange:(document:LourexDocument)=>void; }
interface State { busy:boolean; error:string; preview:DocumentAttachment|null; }
const MAX_FILE_BYTES=5*1024*1024,MAX_TOTAL_BYTES=20*1024*1024,MAX_FILES=8;
function asAttachment(file:File):Promise<DocumentAttachment>{return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onerror=()=>reject(new Error('Unable to read attachment.'));reader.onload=()=>{if(typeof reader.result!=='string'){reject(new Error('Unable to read attachment.'));return;}resolve({id:'att-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,9),name:file.name,mimeType:file.type||(/\.pdf$/i.test(file.name)?'application/pdf':'image/*'),size:file.size,dataUrl:reader.result,createdAt:new Date().toISOString()});};reader.readAsDataURL(file);});}
function bytes(value:number):string{return value<1024*1024?Math.max(1,Math.round(value/1024))+' KB':(value/(1024*1024)).toFixed(1)+' MB';}
function isPdfAttachment(attachment:DocumentAttachment):boolean{return attachment.mimeType==='application/pdf'||/\.pdf$/i.test(attachment.name);}
function isImageAttachment(attachment:DocumentAttachment):boolean{return attachment.mimeType.startsWith('image/')||/\.(png|jpe?g|webp|heic|heif)$/i.test(attachment.name);}
export class DocumentAttachmentsSection extends React.Component<Props,State>{
  state:State={busy:false,error:'',preview:null};private input:HTMLInputElement|null=null;
  private add=async(event:any)=>{const input=event.target as HTMLInputElement,files=Array.from(input.files??[]),current=this.props.document.attachments??[];if(!files.length)return;
    if(current.length+files.length>MAX_FILES){this.setState({error:t('A document can contain up to 8 attachments.','يمكن أن يحتوي المستند على 8 مرفقات كحد أقصى.')});input.value='';return;}
    for(const file of files){const allowed=file.type==='application/pdf'||file.type.startsWith('image/')||/\.(pdf|png|jpe?g|webp|heic|heif)$/i.test(file.name);if(!allowed){this.setState({error:t('Only PDF and image attachments are supported.','المرفقات المدعومة هي PDF والصور فقط.')});input.value='';return;}if(file.size>MAX_FILE_BYTES){this.setState({error:t('Each attachment must be 5 MB or smaller.','يجب ألا يتجاوز حجم كل مرفق 5 ميغابايت.')});input.value='';return;}}
    if(current.reduce((n,a)=>n+(a.size||0),0)+files.reduce((n,f)=>n+f.size,0)>MAX_TOTAL_BYTES){this.setState({error:t('Attachments are limited to 20 MB per document.','إجمالي مرفقات المستند محدود بـ 20 ميغابايت.')});input.value='';return;}
    this.setState({busy:true,error:''});try{const added=await Promise.all(files.map(asAttachment));this.props.onChange({...this.props.document,attachments:[...current,...added]});}catch(e){this.setState({error:e instanceof Error?e.message:t('Unable to add attachment.','تعذر إضافة المرفق.')});}finally{this.setState({busy:false});input.value='';}}
  private remove=(id:string)=>this.props.onChange({...this.props.document,attachments:(this.props.document.attachments??[]).filter(a=>a.id!==id)});
  private openPreview=(preview:DocumentAttachment)=>this.setState({preview});
  private closePreview=()=>this.setState({preview:null});
  render():any{
    const list=this.props.document.attachments??[],preview=this.state.preview;
    return <>
      <section id="document-attachments" data-attachment-count={list.length} className="editor-section document-attachments-section" aria-label={t('Document attachments','مرفقات المستند')}>
        <div className="section-heading with-action"><div><span>07</span><h2>{t('Attachments','المرفقات')}</h2></div><Button icon="plus" disabled={this.state.busy||list.length>=MAX_FILES} onClick={()=>this.input?.click()}>{this.state.busy?t('Adding…','جارٍ الإضافة…'):t('Add attachment','إضافة مرفق')}</Button></div>
        <input ref={(n:HTMLInputElement|null)=>{this.input=n;}} className="document-attachment-input" type="file" accept="image/*,application/pdf,.pdf" multiple onChange={this.add}/>
        <p className="attachment-help">{t('Attach supplier files, purchase documents, scans, product images, or any supporting PDF directly to this document. Files stay inside the encrypted LOUREX workspace.','أرفق ملفات المورد أو مستندات الشراء أو الصور الممسوحة أو صور المنتجات أو أي PDF داعم مباشرة بهذا المستند. تبقى الملفات داخل مساحة LOUREX المشفّرة.')}</p>
        {this.state.error?<div className="inline-error">{this.state.error}</div>:null}
        {list.length?<div className="document-attachment-list">{list.map(attachment=>{
          const pdf=isPdfAttachment(attachment),image=isImageAttachment(attachment);
          return <article key={attachment.id} className={`attachment-card ${image?'is-image':pdf?'is-pdf':'is-file'}`}>
            <button type="button" className="attachment-visual" aria-label={t(`Preview ${attachment.name}`,`معاينة ${attachment.name}`)} onClick={()=>this.openPreview(attachment)}>
              {image?<img src={attachment.dataUrl} alt="" loading="lazy"/>:<span className="attachment-pdf-mark"><Icon name="file"/><b>{pdf?'PDF':'FILE'}</b></span>}
            </button>
            <div className="attachment-copy"><strong title={attachment.name}>{attachment.name}</strong><small>{pdf?'PDF':image?t('Image','صورة'):t('File','ملف')} · {bytes(attachment.size)}</small></div>
            <div className="attachment-card-actions"><button type="button" className="attachment-open-button" onClick={()=>this.openPreview(attachment)}>{t('Preview','معاينة')}</button><IconButton icon="trash" label={t('Remove attachment','حذف المرفق')} onClick={()=>this.remove(attachment.id)}/></div>
          </article>;
        })}</div>:<div className="attachments-empty"><Icon name="file"/><span>{t('No attachments yet. Add an image or PDF when this document has supporting files.','لا توجد مرفقات بعد. أضف صورة أو PDF عندما يكون لهذا المستند ملفات داعمة.')}</span></div>}
      </section>
      {preview?<div className="attachment-preview-overlay" role="dialog" aria-modal="true" aria-label={preview.name} onClick={this.closePreview}><div className="attachment-preview-dialog" onClick={(event:any)=>event.stopPropagation()}><header><div><strong>{preview.name}</strong><small>{isPdfAttachment(preview)?'PDF':t('Image preview','معاينة الصورة')}</small></div><IconButton icon="x" label={t('Close preview','إغلاق المعاينة')} onClick={this.closePreview}/></header><div className="attachment-preview-body">{isPdfAttachment(preview)?<iframe title={preview.name} src={preview.dataUrl}/>:<img src={preview.dataUrl} alt={preview.name}/>}</div>{isPdfAttachment(preview)?<a className="attachment-preview-fallback" href={preview.dataUrl} target="_blank" rel="noreferrer">{t('Open PDF in browser','فتح PDF في المتصفح')}</a>:null}</div></div>:null}
    </>;
  }
}
