from pathlib import Path


def read(path: str) -> str:
    return Path(path).read_text()


def write(path: str, text: str) -> None:
    Path(path).write_text(text)


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 occurrence, found {count}')
    return text.replace(old, new, 1)

# 1) Preserve all first-class document kinds through encrypted vault migration/reload.
p='src/storage/vault.ts'
s=read(p)
s=replace_once(
    s,
    "import type { EncryptedVaultRecord, SecurityMetadata, VaultPayload } from '../types.js';",
    "import type { DocumentKind, EncryptedVaultRecord, SecurityMetadata, VaultPayload } from '../types.js';",
    'vault type import',
)
s=replace_once(
    s,
    "const INVENTORY_MOVEMENT_TYPES = new Set(['opening','purchase','purchase-reversal','issue','adjustment']);",
    "const INVENTORY_MOVEMENT_TYPES = new Set(['opening','purchase','purchase-reversal','issue','adjustment']);\nconst DOCUMENT_KINDS = new Set<DocumentKind>(['draft','rfq','proforma','proforma-invoice','purchase-order','invoice','delivery-note','payment-receipt','statement-account']);",
    'vault document kind set',
)
s=replace_once(
    s,
    "function templateValue(value: unknown, fallback: any = 'executive'): any { return typeof value === 'string' && TEMPLATE_IDS.has(value) ? value : fallback; }",
    "function templateValue(value: unknown, fallback: any = 'executive'): any { return typeof value === 'string' && TEMPLATE_IDS.has(value) ? value : fallback; }\nfunction documentKindValue(value:unknown,fallback:DocumentKind='proforma'):DocumentKind{return typeof value==='string'&&DOCUMENT_KINDS.has(value as DocumentKind)?value as DocumentKind:fallback;}",
    'vault document kind helper',
)
s=replace_once(
    s,
    "id:stringValue(document?.id), kind:document?.kind === 'invoice' ? 'invoice' : document?.kind === 'purchase-order' ? 'purchase-order' : document?.kind === 'draft' ? 'draft' : 'proforma', role:document?.role==='credit-note'?'credit-note':'standard'",
    "id:stringValue(document?.id), kind:documentKindValue(document?.kind), role:document?.role==='credit-note'?'credit-note':'standard'",
    'vault document kind normalization',
)
s=replace_once(
    s,
    "snapshot.role=snapshot.role==='credit-note'?'credit-note':'standard';snapshot.lifecycleStatus=snapshot.lifecycleStatus==='voided'?'voided':'active';snapshot.revision=Math.max(1,Math.trunc(finiteNumber(snapshot.revision,1)));",
    "snapshot.kind=documentKindValue(snapshot.kind);snapshot.role=snapshot.role==='credit-note'?'credit-note':'standard';snapshot.lifecycleStatus=snapshot.lifecycleStatus==='voided'?'voided':'active';snapshot.revision=Math.max(1,Math.trunc(finiteNumber(snapshot.revision,1)));",
    'vault revision kind normalization',
)
write(p,s)

# 2) RFQ does not invent an invoice-like due date. Proforma Invoice follows quotation validity semantics.
p='src/lib/documents.ts'
s=read(p)
s=replace_once(
    s,
    "dueDate: (kind === 'proforma' || kind === 'proforma-invoice' || kind === 'rfq') ? addDaysIso(issueDate, validityDays) : kind === 'purchase-order' || kind === 'draft' || kind === 'delivery-note' || kind === 'payment-receipt' || kind === 'statement-account' ? '' : paymentPreset ? addDaysIso(issueDate,paymentPreset.days) : '',",
    "dueDate: (kind === 'proforma' || kind === 'proforma-invoice') ? addDaysIso(issueDate, validityDays) : kind === 'purchase-order' || kind === 'draft' || kind === 'rfq' || kind === 'delivery-note' || kind === 'payment-receipt' || kind === 'statement-account' ? '' : paymentPreset ? addDaysIso(issueDate,paymentPreset.days) : '',",
    'rfq due date',
)
s=replace_once(
    s,
    "if(doc.dueDate&&!isIsoDate(doc.dueDate))errors.dueDate=doc.kind==='proforma'?'Valid until date is invalid.':doc.kind==='purchase-order'?'Requested delivery date is invalid.':'Due date is invalid.';",
    "if(doc.dueDate&&!isIsoDate(doc.dueDate))errors.dueDate=(doc.kind==='proforma'||doc.kind==='proforma-invoice')?'Valid until date is invalid.':doc.kind==='purchase-order'?'Requested delivery date is invalid.':'Due date is invalid.';",
    'validity invalid message',
)
s=replace_once(
    s,
    "else if(doc.dueDate&&isIsoDate(doc.issueDate)&&compareIsoDates(doc.dueDate,doc.issueDate)<0)errors.dueDate=doc.kind==='proforma'?'Valid until date cannot be before issue date.':doc.kind==='purchase-order'?'Requested delivery cannot be before order date.':'Due date cannot be before issue date.';",
    "else if(doc.dueDate&&isIsoDate(doc.issueDate)&&compareIsoDates(doc.dueDate,doc.issueDate)<0)errors.dueDate=(doc.kind==='proforma'||doc.kind==='proforma-invoice')?'Valid until date cannot be before issue date.':doc.kind==='purchase-order'?'Requested delivery cannot be before order date.':'Due date cannot be before issue date.';",
    'validity chronological message',
)
write(p,s)

# 3) Keep Proforma Invoice validity interval when issue date changes.
p='src/components/EditorPageCore.tsx'
s=read(p)
s=replace_once(
    s,
    "    if(d.kind==='proforma'){\n      if(!isIsoDate(value))return next;",
    "    if(d.kind==='proforma'||d.kind==='proforma-invoice'){\n      if(!isIsoDate(value))return next;",
    'editor issue date validity',
)
write(p,s)

# 4) Only sales documents expose sales accounting panels.
p='src/components/EditorPage.tsx'
s=read(p)
s=replace_once(
    s,
    "      {props.document.kind!=='purchase-order'?<InvoicePaymentsPanel document={props.document} documents={props.documents} payments={props.payments} onSave={props.onSavePayment} onDelete={props.onDeletePayment}/>:null}\n      {props.document.kind!=='purchase-order'?<ProfitabilityPanel document={props.document} savedItems={props.savedItems} onSave={props.onSave} onSaveSavedItem={props.onSaveSavedItem}/>:null}",
    "      {props.document.kind==='invoice'?<InvoicePaymentsPanel document={props.document} documents={props.documents} payments={props.payments} onSave={props.onSavePayment} onDelete={props.onDeletePayment}/>:null}\n      {(props.document.kind==='proforma'||props.document.kind==='proforma-invoice'||props.document.kind==='invoice')?<ProfitabilityPanel document={props.document} savedItems={props.savedItems} onSave={props.onSave} onSaveSavedItem={props.onSaveSavedItem}/>:null}",
    'editor accounting panels',
)
write(p,s)

# 5) PWA runtime editor identity must recognize every document kind when a document is reopened directly.
p='public/document-entry-v302.js'
s=read(p)
s=replace_once(
    s,
    "    const kind=explicit|| (index===0?'proforma':index===1?'invoice':index===2?'purchase-order':index===3?'draft':'');",
    "    const fallbackKinds=['draft','rfq','proforma','proforma-invoice','purchase-order','invoice','delivery-note','payment-receipt','credit-note','statement-account'];\n    const kind=explicit||fallbackKinds[index]||'';",
    'pwa menu fallback order',
)
old="""      if(text.includes('company document studio')||text.includes('استديو مستندات الشركة')||text.includes('مسودة حرة'))kind='draft';
      else if(text.includes('purchase order')||text.includes('طلب شراء'))kind='purchase-order';
      else if(text.includes('quotation')||text.includes('عرض سعر')||text.includes('proforma'))kind='proforma';
      else if(text.includes('invoice')||text.includes('فاتورة'))kind='invoice';"""
new="""      if(text.includes('company document studio')||text.includes('استديو مستندات الشركة')||text.includes('مسودة حرة'))kind='draft';
      else if(text.includes('request for quotation')||text.includes('طلب عرض سعر')||text.includes('rfq'))kind='rfq';
      else if(text.includes('proforma invoice')||text.includes('فاتورة مبدئية'))kind='proforma-invoice';
      else if(text.includes('purchase order')||text.includes('طلب شراء'))kind='purchase-order';
      else if(text.includes('delivery note')||text.includes('سند تسليم'))kind='delivery-note';
      else if(text.includes('payment receipt')||text.includes('إيصال دفع'))kind='payment-receipt';
      else if(text.includes('statement of account')||text.includes('كشف حساب'))kind='statement-account';
      else if(text.includes('commercial invoice')||text.includes('فاتورة تجارية'))kind='invoice';
      else if(text.includes('quotation')||text.includes('عرض سعر'))kind='proforma';
      else if(text.includes('invoice')||text.includes('فاتورة'))kind='invoice';"""
s=replace_once(s,old,new,'pwa editor kind inference')
write(p,s)

# 6) Temporary helper files must not remain in the final diff.
for temp in ('.github/v312_finalize.py','.github/workflows/v312-finalize.yml','.v312-finalize-trigger'):
    path=Path(temp)
    if path.exists():
        path.unlink()
