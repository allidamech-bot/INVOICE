import type { DocumentAttachment, LourexDocument } from '../types.js';
import { t } from '../lib/i18n.js';
import { Button, Icon, IconButton } from './UI.js';
interface Props { document:LourexDocument; onChange:(document:LourexDocument)=>void; }
interface State { busy:boolean; error:string; preview:DocumentAttachment|null; }

// Attachments live inside the encrypted vault as data URLs. Safari/WebKit has a
// much tighter practical memory budget than desktop browsers: a compressed image
// can expand to tens of megabytes once decoded and base64 itself adds ~33% before
// encryption. Use a smaller iOS budget and never decode every thumbnail at once.
const IOS_WEBKIT=(()=>{try{return /iP(?:hone|ad|od)/i.test(navigator.userAgent||'');}catch{return false;}})();
const MB=1024*1024;
const MAX_FILE_BYTES=(IOS_WEBKIT?3:5)*MB;
const MAX_TOTAL_BYTES=(IOS_WEBKIT?5:8)*MB;
const MAX_FILES=IOS_WEBKIT?6:8;
const IMAGE_EXTENSION=/\.(png|jpe?g|webp|gif|heic|heif)$/i;
const PDF_EXTENSION=/\.pdf$/i;
type AttachmentKind='image'|'pdf';

function attachmentKind(file:File):AttachmentKind|null{
  const mime=(file.type||'').trim().toLowerCase();
  const safeImages=new Set(['image/png','image/jpeg','image/webp','image/gif','image/heic','image/heif']);
  if(mime==='application/pdf')return'pdf';
  if(safeImages.has(mime))return'image';
  if(!mime||mime==='application/octet-stream'){
    if(PDF_EXTENSION.test(file.name))return'pdf';
    if(IMAGE_EXTENSION.test(file.name))return'image';
  }
  return null;
}
function ascii(bytes:Uint8Array,start:number,length:number):string{return String.fromCharCode(...bytes.slice(start,start+length));}
async function genuineAttachment(file:File,kind:AttachmentKind):Promise<boolean>{
  const bytes=new Uint8Array(await file.slice(0,32).arrayBuffer());
  if(kind==='pdf')return bytes.length>=5&&ascii(bytes,0,5)==='%PDF-';
  if(bytes.length>=8&&bytes[0]===0x89&&ascii(bytes,1,3)==='PNG'&&bytes[4]===0x0d&&bytes[5]===0x0a&&bytes[6]===0x1a&&bytes[7]===0x0a)return true;
  if(bytes.length>=3&&bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff)return true;
  if(bytes.length>=12&&ascii(bytes,0,4)==='RIFF'&&ascii(bytes,8,4)==='WEBP')return true;
  if(bytes.length>=6&&(ascii(bytes,0,6)==='GIF87a'||ascii(bytes,0,6)==='GIF89a'))return true;
  if(bytes.length>=12&&ascii(bytes,4,4)==='ftyp'){const brand=ascii(bytes,8,4).toLowerCase();if(['heic','heix','hevc','hevx','heim','heis','mif1','msf1'].includes(brand))return true;}
  return false;
}
function normalizedMime(file:File,kind:AttachmentKind):string{
  if(kind==='pdf')return'application/pdf';
  const mime=(file.type||'').trim().toLowerCase();
  if(mime.startsWith('image/'))return mime;
  const lower=file.name.toLowerCase();
  if(lower.endsWith('.png'))return'image/png';
  if(lower.endsWith('.webp'))return'image/webp';
  if(lower.endsWith('.gif'))return'image/gif';
  if(lower.endsWith('.heic'))return'image/heic';
  if(lower.endsWith('.heif'))return'image/heif';
  return'image/jpeg';
}
function normalizeDataUrl(value:string,mime:string):string{return value.replace(/^data:[^;,]*/i,`data:${mime}`);}
function asAttachment(file:File):Promise<DocumentAttachment>{return new Promise((resolve,reject)=>{const kind=attachmentKind(file);if(!kind){reject(new Error('Unsupported attachment type.'));return;}const mimeType=normalizedMime(file,kind);const reader=new FileReader();reader.onerror=()=>reject(new Error('Unable to read attachment.'));reader.onload=()=>{if(typeof reader.result!=='string'){reject(new Error('Unable to read attachment.'));return;}resolve({id:'att-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,9),name:file.name,mimeType,size:file.size,dataUrl:normalizeDataUrl(reader.result,mimeType),createdAt:new Date().toISOString()});};reader.readAsDataURL(file);});}
function bytes(value:number):string{return value<MB?Math.max(1,Math.round(value/1024))+' KB':(value/MB).toFixed(1)+' MB';}
function isPdfAttachment(attachment:DocumentAttachment):boolean{return attachment.mimeType==='application/pdf'||PDF_EXTENSION.test(attachment.name);}
function isImageAttachment(attachment:DocumentAttachment):boolean{return attachment.mimeType.startsWith('image/')||IMAGE_EXTENSION.test(attachment.name);}
function totalAttachmentBytes(list:DocumentAttachment[]):number{return list.reduce((sum,attachment)=>sum+Math.max(0,Number(attachment.size)||0),0);}

export class DocumentAttachmentsSection extends React.Component<Props,State>{
  state:State={busy:false,error:'',preview:null};private input:HTMLInputElement|null=null;
  componentDidMount():void{document.addEventListener('keydown',this.handleKeyDown);}
  componentWillUnmount():void{document.removeEventListener('keydown',this.handleKeyDown);}
  private handleKeyDown=(event:KeyboardEvent)=>{if(event.key==='Escape'&&this.state.preview){event.preventDefault();this.closePreview();}};
  private add=async(event:any)=>{
    const input=event.target as HTMLInputElement,files=Array.from(input.files??[]),current=this.props.document.attachments??[];
    if(!files.length)return;
    if(current.length+files.length>MAX_FILES){this.setState({error:t(`A document can contain up to ${MAX_FILES} attachments.`,`يمكن أن يحتوي المستند على ${MAX_FILES} مرفقات كحد أقصى.`)});input.value='';return;}
    for(const file of files){
      const kind=attachmentKind(file);
      if(!kind||!await genuineAttachment(file,kind)){this.setState({error:t('Only genuine PDF, PNG, JPEG, WebP, GIF, HEIC and HEIF files are supported.','تُقبل فقط ملفات PDF وPNG وJPEG وWebP وGIF وHEIC وHEIF الأصلية.')});input.value='';return;}
      if(file.size>MAX_FILE_BYTES){this.setState({error:t(`Each attachment must be ${MAX_FILE_BYTES/MB} MB or smaller.`,`يجب ألا يتجاوز حجم كل مرفق ${MAX_FILE_BYTES/MB} ميغابايت.`)});input.value='';return;}
    }
    const currentBytes=totalAttachmentBytes(current),incomingBytes=files.reduce((n,f)=>n+f.size,0);
    if(currentBytes+incomingBytes>MAX_TOTAL_BYTES){this.setState({error:t(`Attachments are limited to ${MAX_TOTAL_BYTES/MB} MB per document to keep encrypted saving fast and reliable.`,`إجمالي مرفقات المستند محدود بـ ${MAX_TOTAL_BYTES/MB} ميغابايت للحفاظ على سرعة وموثوقية الحفظ المشفّر.`)});input.value='';return;}
    this.setState({busy:true,error:''});
    try{
      // FileReader/base64 conversion is deliberately sequential. Promise.all here
      // used to allocate several full file buffers and data URLs simultaneously,
      // which is exactly the kind of transient spike that can terminate Safari.
      const added:DocumentAttachment[]=[];
      for(const file of files)added.push(await asAttachment(file));
      this.props.onChange({...this.props.document,attachments:[...current,...added]});
    }catch(e){this.setState({error:e instanceof Error?e.message:t('Unable to add attachment.','تعذر إضافة المرفق.')});}
    finally{this.setState({busy:false});input.value='';}
  };
  private remove=(id:string)=>this.props.onChange({...this.props.document,attachments:(this.props.document.attachments??[]).filter(a=>a.id!==id)});
  private openPreview=(preview:DocumentAttachment)=>this.setState({preview});
  private closePreview=()=>this.setState({preview:null});
  render():any{
    const list=this.props.document.attachments??[],preview=this.state.preview,totalSize=totalAttachmentBytes(list);
    return <>
      <section id="document-attachments" data-attachment-count={list.length} className="editor-section document-attachments-section" aria-label={t('Document attachments','مرفقات المستند')}>
        <div className="section-heading"><div><span>07</span><h2>{t('Attachments','المرفقات')}</h2></div></div>
        <div className="attachment-add-row">
          <Button className="attachment-add-button" icon="plus" disabled={this.state.busy||list.length>=MAX_FILES||totalSize>=MAX_TOTAL_BYTES} onClick={()=>this.input?.click()}>{this.state.busy?t('Adding…','جارٍ الإضافة…'):t('Add attachment','إضافة مرفق')}</Button>
          <span className="attachment-add-note">{t(`Images or PDF · ${MAX_FILE_BYTES/MB} MB each · ${bytes(totalSize)} of ${MAX_TOTAL_BYTES/MB} MB used`,`صور أو PDF · ${MAX_FILE_BYTES/MB} ميغابايت لكل ملف · مستخدم ${bytes(totalSize)} من ${MAX_TOTAL_BYTES/MB} ميغابايت`)}</span>
        </div>
        <input ref={(n:HTMLInputElement|null)=>{this.input=n;}} className="document-attachment-input" type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/heic,image/heif,application/pdf,.pdf,.png,.jpg,.jpeg,.webp,.gif,.heic,.heif" multiple onChange={this.add}/>
        <p className="attachment-help">{t('Attach supplier files, purchase documents, scans, product images, or any supporting PDF directly to this document. Files stay inside the encrypted LOUREX workspace.','أرفق ملفات المورد أو مستندات الشراء أو الصور الممسوحة أو صور المنتجات أو أي PDF داعم مباشرة بهذا المستند. تبقى الملفات داخل مساحة LOUREX المشفّرة.')}</p>
        {IOS_WEBKIT?<p className="attachment-help">{t('iPhone stability mode uses a smaller attachment budget and opens image previews only on demand.','وضع استقرار iPhone يستخدم حد مرفقات أصغر ولا يفك ترميز الصور إلا عند فتح المعاينة.')}</p>:null}
        {this.state.error?<div className="inline-error">{this.state.error}</div>:null}
        {list.length?<div className="document-attachment-list">{list.map(attachment=>{
          const pdf=isPdfAttachment(attachment),image=isImageAttachment(attachment),decodeThumbnail=image&&!IOS_WEBKIT;
          return <article key={attachment.id} className={`attachment-card ${image?'is-image':pdf?'is-pdf':'is-file'}`}>
            <button type="button" className="attachment-visual" aria-label={t(`Preview ${attachment.name}`,`معاينة ${attachment.name}`)} onClick={()=>this.openPreview(attachment)}>
              {decodeThumbnail?<img src={attachment.dataUrl} alt="" loading="lazy" decoding="async"/>:<span className="attachment-pdf-mark"><Icon name="file"/><b>{pdf?'PDF':image?'IMG':'FILE'}</b></span>}
            </button>
            <div className="attachment-copy"><strong title={attachment.name}>{attachment.name}</strong><small>{pdf?'PDF':image?t('Image','صورة'):t('File','ملف')} · {bytes(attachment.size)}</small></div>
            <div className="attachment-card-actions"><button type="button" className="attachment-open-button" onClick={()=>this.openPreview(attachment)}>{pdf?t('Details','التفاصيل'):t('Preview','معاينة')}</button><IconButton icon="trash" label={t('Remove attachment','حذف المرفق')} onClick={()=>this.remove(attachment.id)}/></div>
          </article>;
        })}</div>:<div className="attachments-empty"><Icon name="file"/><span>{t('No attachments yet. Add an image or PDF when this document has supporting files.','لا توجد مرفقات بعد. أضف صورة أو PDF عندما يكون لهذا المستند ملفات داعمة.')}</span></div>}
      </section>
      {preview?<div className="attachment-preview-overlay" role="dialog" aria-modal="true" aria-label={preview.name} onClick={this.closePreview}><div className="attachment-preview-dialog" onClick={(event:any)=>event.stopPropagation()}><header><div><strong>{preview.name}</strong><small>{isPdfAttachment(preview)?'PDF':t('Image preview','معاينة الصورة')}</small></div><IconButton icon="x" label={t('Close preview','إغلاق المعاينة')} onClick={this.closePreview}/></header><div className="attachment-preview-body">{isPdfAttachment(preview)?<div className="attachment-pdf-preview"><span className="attachment-pdf-preview-icon"><Icon name="file"/></span><strong>{t('PDF attached to this document','ملف PDF مرفق بهذا المستند')}</strong><small>{preview.name} · {bytes(preview.size)}</small><a className="attachment-preview-fallback" href={preview.dataUrl} download={preview.name}>{t('Download PDF','تنزيل PDF')}</a></div>:<img src={preview.dataUrl} alt={preview.name}/>}</div></div></div>:null}
    </>;
  }
}
