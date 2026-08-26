import type { AppSettings, CompanySettings, Customer, DocumentItem, LourexDocument, SavedItem } from '../types.js';
import { EditorPage as EditorPageCore } from './EditorPageCore.js';

interface Props {
  document:LourexDocument; documents:LourexDocument[]; customers:Customer[]; company:CompanySettings; savedItems:SavedItem[]; smartDefaults:AppSettings['smartDefaults'];
  onClose:()=>void; onSave:(doc:LourexDocument,auto?:boolean)=>Promise<void>; onSaveCustomer:(customer:Customer)=>Promise<void>;
  onSaveSavedItem:(item:SavedItem)=>Promise<void>; onSaveDocumentItem:(item:DocumentItem,currency:string)=>Promise<void>; onDeleteSavedItem:(item:SavedItem)=>Promise<void>;
  onSaveSmartDefaults:(defaults:AppSettings['smartDefaults'])=>Promise<void>; onConvert:(doc:LourexDocument)=>Promise<void>; onPrint:(doc:LourexDocument,mode:'print'|'pdf'|'share')=>void;
}

// Keep the editor's internal draft state scoped to one document identity.
// A new invoice created from a proforma must mount a fresh editor instead of
// retaining the source document's local state.
export function EditorPage(props:Props):any {
  return <EditorPageCore key={props.document.id} {...props}/>;
}
