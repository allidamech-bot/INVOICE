import type { CompanySettings, LetterBlock, LetterDocumentData, LourexDocument } from '../types.js';
import { t } from '../lib/i18n.js';
import { defaultLetterBlock, defaultLetterData, defaultWatermark, letterPreset, normalizeLetterData, normalizeWatermark } from '../lib/document-extras.js';
import { Button, Field, Icon, IconButton, Input, Select, Textarea, Toggle } from './UI.js';
import { DraftDocumentRenderer } from './DraftDocumentRenderer.js';

interface Props{
  document:LourexDocument;
  company:CompanySettings;
  onClose:()=>void;
  onSave:(doc:LourexDocument,auto?:boolean)=>Promise<void>;
  onPrint:(doc:LourexDocument,mode:'print'|'pdf'|'share')=>Promise<void>;
  onEditActivity?:()=>void;
}
interface State{
  doc:LourexDocument;
  saving:boolean;
  saveState:'saved'|'saving'|'unsaved';
  mobilePreview:boolean;
  outputBusy:boolean;
  activeBlockId:string;
  error:string;
}

const FONT_OPTIONS:Array<[LetterBlock['font'],string]>=[['system','System'],['inter','Inter'],['source-sans','Source Sans'],['montserrat','Montserrat'],['playfair','Playfair'],['cairo','Cairo'],['tajawal','Tajawal'],['noto-kufi','Noto Kufi Arabic'],['noto-naskh','Noto Naskh Arabic']];
const SIZE_OPTIONS=[10,11,12,13,14,15,16,18,20,22,24,28,32,36,42,48];

export class DraftDocumentEditor extends React.Component<Props,State>{
  private autosaveTimer:number|undefined;
  private revision=0;
  constructor(props:Props){
    super(props);
    const doc=structuredClone(props.document);
    doc.letter=normalizeLetterData(doc.letter??defaultLetterData(doc.language),doc.language);
    doc.appearance={...doc.appearance,watermark:normalizeWatermark(doc.appearance.watermark??defaultWatermark())};
    this.state={doc,saving:false,saveState:'saved',mobilePreview:false,outputBusy:false,activeBlockId:doc.letter.blocks[0]?.id||'',error:''};
  }
  componentWillUnmount():void{if(this.autosaveTimer)window.clearTimeout(this.autosaveTimer);if(this.state.saveState!=='saved'&&!this.state.saving)void this.props.onSave(structuredClone(this.state.doc),true).catch(()=>undefined);}

  private letter=():LetterDocumentData=>normalizeLetterData(this.state.doc.letter,this.state.doc.language);
  private mutate=(fn:(doc:LourexDocument)=>LourexDocument)=>{
    this.props.onEditActivity?.();
    this.revision+=1;
    const doc={...fn(this.state.doc),updatedAt:new Date().toISOString()};
    this.setState({doc,saveState:'unsaved',error:''},this.schedule);
  };
  private schedule=()=>{if(this.autosaveTimer)window.clearTimeout(this.autosaveTimer);this.autosaveTimer=window.setTimeout(()=>void this.save(true),550);};
  private save=async(auto=false)=>{
    if(this.state.saving)return;
    if(this.autosaveTimer)window.clearTimeout(this.autosaveTimer);
    const doc=structuredClone(this.state.doc);
    if(!doc.number.trim()){this.setState({error:t('Document number is required.','رقم المستند مطلوب.')});return;}
    if(!doc.issueDate){this.setState({error:t('Document date is required.','تاريخ المستند مطلوب.')});return;}
    const start=this.revision;
    this.setState({saving:true,saveState:'saving'});
    try{await this.props.onSave(doc,auto);const newer=start!==this.revision;this.setState({saving:false,saveState:newer?'unsaved':'saved'},()=>{if(newer)this.schedule();});}
    catch(e){this.setState({saving:false,saveState:'unsaved',error:e instanceof Error?e.message:t('Unable to save document.','تعذر حفظ المستند.')});}
  };
  private saveAndClose=async()=>{if(this.state.saveState==='saved'){this.props.onClose();return;}await this.save(true);if(!this.state.error)this.props.onClose();};
  private output=async(mode:'print'|'pdf'|'share')=>{
    if(this.state.outputBusy)return;
    if(this.state.saveState!=='saved')await this.save(true);
    const doc=structuredClone(this.state.doc);
    if(!doc.number.trim()||!doc.issueDate)return;
    try{(window as any).__LOUREX_PREPARE_PDF__?.(mode);}catch{}
    this.setState({outputBusy:true,error:'',mobilePreview:false});
    try{await this.props.onPrint(doc,mode);}catch(e){this.setState({error:e instanceof Error?e.message:t('Unable to prepare document.','تعذر تجهيز المستند.')});}
    finally{this.setState({outputBusy:false});}
  };

  private patchLetter=(patch:Partial<LetterDocumentData>)=>this.mutate(doc=>({...doc,letter:{...normalizeLetterData(doc.letter,doc.language),...patch}}));
  private patchBlock=(id:string,patch:Partial<LetterBlock>)=>this.mutate(doc=>({...doc,letter:{...normalizeLetterData(doc.letter,doc.language),blocks:normalizeLetterData(doc.letter,doc.language).blocks.map(block=>block.id===id?{...block,...patch}:block)}}));
  private addBlock=(type:LetterBlock['type']='paragraph')=>{
    const block=defaultLetterBlock(type);
    if(this.state.doc.language==='ar'){block.direction='rtl';block.font='cairo';}
    this.mutate(doc=>{const letter=normalizeLetterData(doc.letter,doc.language);return{...doc,letter:{...letter,blocks:[...letter.blocks,block]}};});
    this.setState({activeBlockId:block.id});
  };
  private duplicateBlock=(id:string)=>this.mutate(doc=>{const letter=normalizeLetterData(doc.letter,doc.language);const at=letter.blocks.findIndex(block=>block.id===id);if(at<0)return doc;const source=letter.blocks[at]!;const copy:LetterBlock={...source,id:defaultLetterBlock().id};const blocks=[...letter.blocks];blocks.splice(at+1,0,copy);return{...doc,letter:{...letter,blocks}};});
  private removeBlock=(id:string)=>this.mutate(doc=>{const letter=normalizeLetterData(doc.letter,doc.language);const blocks=letter.blocks.filter(block=>block.id!==id);return{...doc,letter:{...letter,blocks:blocks.length?blocks:[defaultLetterBlock()]}};});
  private moveBlock=(id:string,delta:number)=>this.mutate(doc=>{const letter=normalizeLetterData(doc.letter,doc.language);const blocks=[...letter.blocks];const at=blocks.findIndex(block=>block.id===id),to=at+delta;if(at<0||to<0||to>=blocks.length)return doc;const current=blocks[at]!,target=blocks[to]!;blocks[at]=target;blocks[to]=current;return{...doc,letter:{...letter,blocks}};});
  private applyPreset=(preset:LetterDocumentData['preset'])=>this.mutate(doc=>{const old=normalizeLetterData(doc.letter,doc.language),next=letterPreset(preset,doc.language);return{...doc,letter:{...next,recipient:old.recipient,attention:old.attention,reference:old.reference,subject:old.subject||next.subject,accentColor:old.accentColor,showLogo:old.showLogo,showCompanyDetails:old.showCompanyDetails,showSignature:old.showSignature,showStamp:old.showStamp}};});
  private setWatermark=(patch:Partial<ReturnType<typeof defaultWatermark>>)=>this.mutate(doc=>({...doc,appearance:{...doc.appearance,watermark:{...normalizeWatermark(doc.appearance.watermark),...patch}}}));

  private blockToolbar=(block:LetterBlock,index:number,total:number):any=><div className="letter-block-toolbar">
    <Select aria-label={t('Block type','نوع الفقرة')} value={block.type} onChange={(e:any)=>this.patchBlock(block.id,{type:e.target.value})}><option value="paragraph">{t('Paragraph','فقرة')}</option><option value="heading">{t('Heading','عنوان رئيسي')}</option><option value="subheading">{t('Subheading','عنوان فرعي')}</option><option value="bullet">{t('Bullet','نقطة')}</option><option value="quote">{t('Quote','اقتباس')}</option><option value="spacer">{t('Spacer','مسافة')}</option></Select>
    <Select aria-label={t('Direction','الاتجاه')} value={block.direction} onChange={(e:any)=>this.patchBlock(block.id,{direction:e.target.value})}><option value="auto">Auto</option><option value="ltr">LTR</option><option value="rtl">RTL</option></Select>
    <Select aria-label={t('Font','الخط')} value={block.font} onChange={(e:any)=>this.patchBlock(block.id,{font:e.target.value})}>{FONT_OPTIONS.map(([id,label])=><option key={id} value={id}>{label}</option>)}</Select>
    <Select aria-label={t('Size','الحجم')} value={String(block.size)} onChange={(e:any)=>this.patchBlock(block.id,{size:Number(e.target.value)})}>{SIZE_OPTIONS.map(size=><option key={size} value={size}>{size}</option>)}</Select>
    <div className="letter-format-buttons" role="group" aria-label={t('Text formatting','تنسيق النص')}><button type="button" className={block.bold?'active':''} aria-pressed={block.bold} onClick={()=>this.patchBlock(block.id,{bold:!block.bold})}><b>B</b></button><button type="button" className={block.italic?'active':''} aria-pressed={block.italic} onClick={()=>this.patchBlock(block.id,{italic:!block.italic})}><i>I</i></button><button type="button" className={block.underline?'active':''} aria-pressed={block.underline} onClick={()=>this.patchBlock(block.id,{underline:!block.underline})}><u>U</u></button></div>
    <Select aria-label={t('Alignment','المحاذاة')} value={block.align} onChange={(e:any)=>this.patchBlock(block.id,{align:e.target.value})}><option value="start">{t('Start','بداية')}</option><option value="center">{t('Center','وسط')}</option><option value="end">{t('End','نهاية')}</option><option value="justify">{t('Justify','ضبط')}</option></Select>
    <label className="letter-color-control" title={t('Text color','لون النص')}><span>{t('Color','لون')}</span><input type="color" value={block.color} onChange={(e:any)=>this.patchBlock(block.id,{color:e.target.value})}/></label>
    <div className="letter-block-order"><IconButton icon="chevronUp" label={t('Move up','تحريك لأعلى')} disabled={index===0} onClick={()=>this.moveBlock(block.id,-1)}/><IconButton icon="chevronDown" label={t('Move down','تحريك لأسفل')} disabled={index===total-1} onClick={()=>this.moveBlock(block.id,1)}/><IconButton icon="copy" label={t('Duplicate block','نسخ الفقرة')} onClick={()=>this.duplicateBlock(block.id)}/><IconButton icon="trash" label={t('Delete block','حذف الفقرة')} disabled={total===1} onClick={()=>this.removeBlock(block.id)}/></div>
  </div>;

  render():any{
    const d=this.state.doc,letter=this.letter(),watermark=normalizeWatermark(d.appearance.watermark),blocks=letter.blocks;
    return <div className={`draft-studio editor-screen ${this.state.mobilePreview?'mobile-preview-open':''}`} data-document-kind="draft">
      <header className="draft-studio-topbar"><div className="draft-studio-identity"><IconButton icon="arrowLeft" label={t('Back','رجوع')} onClick={()=>void this.saveAndClose()}/><div><small>{t('Company Document Studio','استديو مستندات الشركة')}</small><strong>{d.number}</strong></div><span>{t('Draft','مسودة')}</span></div><div className={`draft-save-state state-${this.state.saveState}`}>{this.state.saveState==='saving'?t('Saving…','جارٍ الحفظ…'):this.state.saveState==='saved'?t('Saved','تم الحفظ'):t('Unsaved changes','تغييرات غير محفوظة')}</div><div className="draft-studio-actions"><Button icon="eye" onClick={()=>this.setState({mobilePreview:true})}>{t('Preview','معاينة')}</Button><Button icon="download" disabled={this.state.outputBusy} onClick={()=>void this.output('pdf')}>PDF</Button><Button icon="share" disabled={this.state.outputBusy} onClick={()=>void this.output('share')}>{t('Share','مشاركة')}</Button><Button icon="save" variant="primary" disabled={this.state.saving} onClick={()=>void this.save(false)}>{t('Save','حفظ')}</Button></div></header>
      {this.state.error?<div className="editor-global-error">{this.state.error}</div>:null}
      <div className="draft-studio-layout"><aside className="draft-studio-controls"><div className="draft-studio-scroll">
        <section className="draft-control-section"><div className="draft-section-heading"><span>01</span><div><h2>{t('Document identity','هوية المستند')}</h2><p>{t('Reference details for letters, notices and company communication.','بيانات مرجعية للخطابات والإشعارات ومراسلات الشركة.')}</p></div></div><div className="form-grid two"><Field label={t('Document No.','رقم المستند')}><Input value={d.number} onChange={(e:any)=>this.mutate(doc=>({...doc,number:e.target.value}))}/></Field><Field label={t('Date','التاريخ')}><Input type="date" value={d.issueDate} onChange={(e:any)=>this.mutate(doc=>({...doc,issueDate:e.target.value}))}/></Field><Field label={t('Language','اللغة')}><Select value={d.language} onChange={(e:any)=>this.mutate(doc=>({...doc,language:e.target.value,letter:normalizeLetterData(doc.letter,e.target.value)}))}><option value="en">English</option><option value="ar">العربية</option><option value="bilingual">{t('Arabic + English','العربية + الإنجليزية')}</option></Select></Field><Field label={t('Reference','المرجع')}><Input value={letter.reference} onChange={(e:any)=>this.patchLetter({reference:e.target.value})}/></Field><Field className="span-2" label={t('To / Recipient','إلى / المستلم')}><Input dir="auto" value={letter.recipient} onChange={(e:any)=>this.patchLetter({recipient:e.target.value})}/></Field><Field className="span-2" label={t('Attention','عناية')}><Input dir="auto" value={letter.attention} onChange={(e:any)=>this.patchLetter({attention:e.target.value})}/></Field><Field className="span-2" label={t('Subject','الموضوع')}><Input dir="auto" value={letter.subject} onChange={(e:any)=>this.patchLetter({subject:e.target.value})}/></Field></div></section>

        <section className="draft-control-section"><div className="draft-section-heading"><span>02</span><div><h2>{t('Page & branding','الصفحة والهوية')}</h2><p>{t('Build a controlled company letterhead instead of formatting every letter manually.','أنشئ ورق شركة مضبوطًا بدل تنسيق كل خطاب يدويًا.')}</p></div></div><div className="draft-preset-grid">{(['blank','formal-letter','memo','notice'] as LetterDocumentData['preset'][]).map(preset=><button type="button" key={preset} className={letter.preset===preset?'active':''} onClick={()=>this.applyPreset(preset)}><strong>{preset==='blank'?t('Blank','فارغ'):preset==='formal-letter'?t('Formal letter','خطاب رسمي'):preset==='memo'?t('Memo','مذكرة'):t('Notice','إشعار')}</strong><span>{preset==='blank'?t('Start from a clean page','ابدأ من صفحة نظيفة'):preset==='formal-letter'?t('Recipient + subject + closing','مستلم وموضوع وخاتمة'):preset==='memo'?t('Clean internal memo','مذكرة داخلية مرتبة'):t('Bold official announcement','إشعار رسمي واضح')}</span></button>)}</div><div className="form-grid two"><Field label={t('Paper style','نمط الورق')}><Select value={letter.pageStyle} onChange={(e:any)=>this.patchLetter({pageStyle:e.target.value})}><option value="plain">{t('Plain','بدون خطوط')}</option><option value="ruled">{t('Ruled lines','خطوط كتابة')}</option><option value="grid">{t('Subtle grid','شبكة خفيفة')}</option></Select></Field><Field label={t('Header style','نمط الهيدر')}><Select value={letter.headerStyle} onChange={(e:any)=>this.patchLetter({headerStyle:e.target.value})}><option value="accent">{t('Signature accent','هوية مميزة')}</option><option value="classic">{t('Classic','كلاسيكي')}</option><option value="minimal">{t('Minimal','بسيط')}</option></Select></Field><Field label={t('Footer style','نمط الفوتر')}><Select value={letter.footerStyle} onChange={(e:any)=>this.patchLetter({footerStyle:e.target.value})}><option value="company">{t('Company details','بيانات الشركة')}</option><option value="minimal">{t('Minimal','بسيط')}</option><option value="none">{t('None','بدون')}</option></Select></Field><Field label={t('Body width','عرض الكتابة')}><Select value={letter.bodyWidth} onChange={(e:any)=>this.patchLetter({bodyWidth:e.target.value})}><option value="narrow">{t('Narrow','ضيق')}</option><option value="comfortable">{t('Comfortable','مريح')}</option><option value="wide">{t('Wide','عريض')}</option></Select></Field><Field label={t('Accent color','لون الهوية')}><input className="input draft-color-input" type="color" value={letter.accentColor} onChange={(e:any)=>this.patchLetter({accentColor:e.target.value})}/></Field></div><div className="draft-toggle-grid"><Toggle checked={letter.showLogo} onChange={value=>this.patchLetter({showLogo:value})} label={t('Company logo','شعار الشركة')}/><Toggle checked={letter.showCompanyDetails} onChange={value=>this.patchLetter({showCompanyDetails:value})} label={t('Company details','بيانات الشركة')}/><Toggle checked={letter.showDate} onChange={value=>this.patchLetter({showDate:value})} label={t('Show date','إظهار التاريخ')}/><Toggle checked={letter.showReference} onChange={value=>this.patchLetter({showReference:value})} label={t('Show reference','إظهار المرجع')}/><Toggle checked={letter.showSignature} onChange={value=>this.patchLetter({showSignature:value})} label={t('Signature','التوقيع')}/><Toggle checked={letter.showStamp} onChange={value=>this.patchLetter({showStamp:value})} label={t('Stamp','الختم')}/></div>
          <div className={`draft-watermark-card ${watermark.enabled?'is-enabled':''}`}><div className="draft-watermark-head"><Toggle checked={watermark.enabled} onChange={enabled=>this.setWatermark({enabled})} label={t('Watermark','العلامة المائية')}/><span>{t('Optional on every page','اختيارية على كل صفحة')}</span></div>{watermark.enabled?<div className="draft-watermark-settings"><div className="watermark-presets">{['DRAFT','CONFIDENTIAL','COPY','INTERNAL'].map(text=><button type="button" key={text} onClick={()=>this.setWatermark({type:'text',text})}>{text}</button>)}</div><div className="form-grid two"><Field label={t('Type','النوع')}><Select value={watermark.type} onChange={(e:any)=>this.setWatermark({type:e.target.value})}><option value="text">{t('Text','نص')}</option><option value="logo">{t('Company logo','شعار الشركة')}</option></Select></Field><Field label={t('Pattern','النمط')}><Select value={watermark.pattern} onChange={(e:any)=>this.setWatermark({pattern:e.target.value})}><option value="single">{t('Single','واحدة')}</option><option value="repeat">{t('Repeated','متكررة')}</option></Select></Field>{watermark.type==='text'?<Field className="span-2" label={t('Watermark text','نص العلامة')}><Input value={watermark.text} onChange={(e:any)=>this.setWatermark({text:e.target.value})}/></Field>:null}<Field label={t('Opacity','الشفافية')}><input type="range" min="0.02" max="0.30" step="0.01" value={watermark.opacity} onChange={(e:any)=>this.setWatermark({opacity:Number(e.target.value)})}/><small>{Math.round(watermark.opacity*100)}%</small></Field><Field label={t('Angle','الزاوية')}><input type="range" min="-75" max="75" step="1" value={watermark.angle} onChange={(e:any)=>this.setWatermark({angle:Number(e.target.value)})}/><small>{watermark.angle}°</small></Field><Field label={t('Color','اللون')}><input className="input draft-color-input" type="color" value={watermark.color} onChange={(e:any)=>this.setWatermark({color:e.target.value})}/></Field><Field label={t('Size','الحجم')}><input type="range" min="28" max="150" step="2" value={watermark.size} onChange={(e:any)=>this.setWatermark({size:Number(e.target.value)})}/><small>{watermark.size}px</small></Field></div></div>:null}</div>
        </section>

        <section className="draft-control-section draft-content-section"><div className="draft-section-heading with-action"><span>03</span><div><h2>{t('Content studio','استديو الكتابة')}</h2><p>{t('Compose structured content with independent RTL/LTR and typography per block.','اكتب المحتوى مع تحكم مستقل بالاتجاه والخط لكل فقرة.')}</p></div><Button icon="plus" variant="primary" onClick={()=>this.addBlock('paragraph')}>{t('Add block','إضافة فقرة')}</Button></div><div className="draft-quick-add"><button type="button" onClick={()=>this.addBlock('heading')}>{t('Heading','عنوان')}</button><button type="button" onClick={()=>this.addBlock('paragraph')}>{t('Paragraph','فقرة')}</button><button type="button" onClick={()=>this.addBlock('bullet')}>{t('Bullet','نقطة')}</button><button type="button" onClick={()=>this.addBlock('quote')}>{t('Quote','اقتباس')}</button><button type="button" onClick={()=>this.addBlock('spacer')}>{t('Space','مسافة')}</button></div><div className="draft-block-list">{blocks.map((block,index)=><article key={block.id} className={`draft-block-card ${this.state.activeBlockId===block.id?'active':''}`} onFocus={()=>this.setState({activeBlockId:block.id})}>{this.blockToolbar(block,index,blocks.length)}{block.type!=='spacer'?<Textarea dir={block.direction} rows={block.type==='heading'?2:5} value={block.text} placeholder={block.type==='heading'?t('Write a heading…','اكتب عنوانًا…'):t('Write freely here…','اكتب هنا بحرية…')} onChange={(e:any)=>this.patchBlock(block.id,{text:e.target.value})}/>:<div className="draft-spacer-preview">{t('Flexible vertical space','مسافة عمودية مرنة')}</div>}<div className="draft-block-spacing"><label>{t('Line height','تباعد السطور')}<input type="range" min="1" max="2.6" step="0.05" value={block.lineHeight} onChange={(e:any)=>this.patchBlock(block.id,{lineHeight:Number(e.target.value)})}/><span>{block.lineHeight.toFixed(2)}</span></label><label>{t('Space after','مسافة بعد')}<input type="range" min="0" max="48" step="2" value={block.spacingAfter} onChange={(e:any)=>this.patchBlock(block.id,{spacingAfter:Number(e.target.value)})}/><span>{block.spacingAfter}px</span></label></div></article>)}</div></section>
      </div></aside><section className="draft-studio-preview"><header><div><small>{t('Live A4 preview','معاينة A4 مباشرة')}</small><strong>{letter.subject||t('Untitled company document','مستند شركة بدون عنوان')}</strong></div><span>{t('Print-ready','جاهز للطباعة')}</span></header><div className="draft-preview-stage"><DraftDocumentRenderer document={d} scale={0.78}/></div></section></div>
      <div className={`draft-mobile-actionbar state-${this.state.saveState}`}><Button icon="eye" onClick={()=>this.setState({mobilePreview:true})}>{t('Preview','معاينة')}</Button><Button icon="download" disabled={this.state.outputBusy} onClick={()=>void this.output('pdf')}>PDF</Button><Button icon="share" disabled={this.state.outputBusy} onClick={()=>void this.output('share')}>{t('Share','مشاركة')}</Button><Button icon="save" variant="primary" disabled={this.state.saving} onClick={()=>void this.save(false)}>{t('Save','حفظ')}</Button></div>
      {this.state.mobilePreview?<div className="mobile-preview-overlay draft-mobile-preview"><header><strong>{t('Draft Preview','معاينة المسودة')}</strong><IconButton icon="x" label={t('Close','إغلاق')} onClick={()=>this.setState({mobilePreview:false})}/></header><div className="mobile-preview-stage"><DraftDocumentRenderer document={d} scale={0.48}/></div></div>:null}
    </div>;
  }
}
