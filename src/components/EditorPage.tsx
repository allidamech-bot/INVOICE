import type { AppSettings, CompanySettings, Customer, DocumentItem, LourexDocument, SavedItem } from '../types.js';
import { t } from '../lib/i18n.js';
import { Button, Icon } from './UI.js';
import { EditorPage as EditorPageCore } from './EditorPageCore.js';

interface Props {
  document:LourexDocument; documents:LourexDocument[]; customers:Customer[]; company:CompanySettings; savedItems:SavedItem[]; smartDefaults:AppSettings['smartDefaults'];
  onClose:()=>void; onSave:(doc:LourexDocument,auto?:boolean)=>Promise<void>; onSaveCustomer:(customer:Customer)=>Promise<void>;
  onSaveSavedItem:(item:SavedItem)=>Promise<void>; onSaveDocumentItem:(item:DocumentItem,currency:string)=>Promise<void>; onUseSavedItems:(items:SavedItem[])=>Promise<void>; onDeleteSavedItem:(item:SavedItem)=>Promise<void>;
  onSaveSmartDefaults:(defaults:AppSettings['smartDefaults'])=>Promise<void>; onConvert:(doc:LourexDocument)=>Promise<void>; onPrint:(doc:LourexDocument,mode:'print'|'pdf'|'share')=>void;
}

// Keep the editor's internal draft state scoped to one document identity.
// A new invoice created from a proforma must mount a fresh editor instead of
// retaining the source document's local state.
export class EditorPage extends React.Component<Props>{
  private resetFrame:number|undefined;
  private resetTimer:number|undefined;

  componentDidMount():void{this.resetScroll();}
  componentDidUpdate(prevProps:Props):void{if(prevProps.document.id!==this.props.document.id)this.resetScroll();}
  componentWillUnmount():void{
    if(this.resetFrame!==undefined)window.cancelAnimationFrame(this.resetFrame);
    if(this.resetTimer!==undefined)window.clearTimeout(this.resetTimer);
  }

  private resetScroll=()=>{
    const reset=()=>{
      window.scrollTo(0,0);
      document.documentElement.scrollTop=0;
      document.body.scrollTop=0;
      document.querySelectorAll<HTMLElement>('.editor-main,.editor-screen,.editor-layout,.editor-pane,.editor-scroll,.app-main,.workspace').forEach(node=>{node.scrollTop=0;node.scrollLeft=0;});
    };
    reset();
    if(this.resetFrame!==undefined)window.cancelAnimationFrame(this.resetFrame);
    if(this.resetTimer!==undefined)window.clearTimeout(this.resetTimer);
    this.resetFrame=window.requestAnimationFrame(reset);
    this.resetTimer=window.setTimeout(reset,80);
  };

  private saveWithProtectedRetry=async(doc:LourexDocument,auto?:boolean):Promise<void>=>{
    const deadline=Date.now()+12_000;
    for(;;){
      try{await this.props.onSave(doc,auto);return;}
      catch(e){
        const message=e instanceof Error?e.message:String(e??'');
        const protectedOperation=/protected data operation/i.test(message)||message.includes('عملية محمية');
        if(!protectedOperation||Date.now()>=deadline)throw e;
        await new Promise<void>(resolve=>window.setTimeout(resolve,150));
      }
    }
  };

  render():any{
    const props=this.props;
    const canConvertFinalQuote=props.document.kind==='proforma'&&props.document.status==='final';
    return <>
      <EditorPageCore key={props.document.id} {...props} onSave={this.saveWithProtectedRetry}/>
      {canConvertFinalQuote?<div className="final-quote-convert-bar" role="region" aria-label={t('Final quote actions','إجراءات عرض السعر النهائي')}>
        <div><Icon name="invoice" size={18}/><span><strong>{t('Deal confirmed? Create the invoice.','تم تأكيد الصفقة؟ أنشئ الفاتورة.')}</strong><small>{t('The quote stays Final and unchanged. A new invoice is created with its own number.','يبقى عرض السعر نهائيًا دون تغيير، ويتم إنشاء فاتورة جديدة برقم مستقل.')}</small></span></div>
        <Button icon="invoice" variant="primary" onClick={()=>void props.onConvert(props.document)}>{t('Create Invoice from Quote','إنشاء فاتورة من عرض السعر')}</Button>
      </div>:null}
    </>;
  }
}
