import type {InventoryMovementRecord,WarehouseRecord} from '../types.js';
import {isArabic,t} from '../lib/i18n.js';
import {activeAccountStorageUid} from '../storage/db.js';
import {defaultWarehouseId} from '../lib/warehouses.js';
import {Button} from './UI.js';

interface Props {
  movements:InventoryMovementRecord[];warehouses:WarehouseRecord[];
  workspaceId:string;branchId:string;filters:string;
  typeLabel:(type:InventoryMovementRecord['type'])=>string;
}
/** Read-only output of the same saved records selected in the movement history. */
export function InventoryMovementReport(props:Props):any {
  const storageUid=activeAccountStorageUid();
  const cleanup=()=>document.body.classList.remove('printing-inventory-report');
  React.useEffect(()=>{window.addEventListener('afterprint',cleanup);return()=>{window.removeEventListener('afterprint',cleanup);cleanup();};},[]);
  const print=()=>{
    if(storageUid!==activeAccountStorageUid())return;
    document.body.classList.add('printing-inventory-report');
    try{window.print();}catch{cleanup();}
  };
  const warehouse=(id:string|undefined)=>{
    if(!id)return '—';
    const saved=props.warehouses.find(w=>w.id===id);
    return saved?`${saved.name} (${id})`:id;
  };
  return <><Button onClick={print}>{t('Print / Save PDF','طباعة / حفظ PDF')}</Button>{ReactDOM.createPortal(
    <article className="lx-inventory-movement-report" dir={isArabic()?'rtl':'ltr'}>
      <header><h1>{t('Inventory movement report','تقرير حركة المخزون')}</h1>
        <p>{t('Company / branch','الشركة / الفرع')}: {props.workspaceId} / {props.branchId}</p>
        <p>{props.filters}</p><p>{t('Matching movements','الحركات المطابقة')}: {props.movements.length}</p>
      </header>
      <p>{t('Saved movement quantities are shown individually; units and totals are not inferred from current products. Transfers retain both warehouse endpoints.','تُعرض كميات الحركات المحفوظة منفردة ولا تُستنتج الوحدات أو المجاميع من الأصناف الحالية. تحتفظ التحويلات بطرفي المستودع.')}</p>
      <table><thead><tr>{[t('Date / movement','التاريخ / الحركة'),t('Item / reference','الصنف / المرجع'),t('Quantity','الكمية'),t('Warehouses / notes','المستودعات / الملاحظات')].map(label=><th key={label}>{label}</th>)}</tr></thead>
        <tbody>{props.movements.map(m=>{
          const fallback=defaultWarehouseId(m.branchId||props.branchId);
          const from=m.fromWarehouseId||(m.type==='transfer'||m.quantity.startsWith('-')?fallback:undefined);
          const to=m.toWarehouseId||(m.type==='transfer'||!m.quantity.startsWith('-')?fallback:undefined);
          return <tr key={m.id} data-movement={m.id}><td><div>{m.date}</div><div>{props.typeLabel(m.type)}</div><small>{m.id}</small></td>
            <td><strong>{isArabic()?(m.itemNameAr||m.itemNameEn):(m.itemNameEn||m.itemNameAr)}</strong><div>{m.sku}</div><div>{m.sourceNumber||'—'}</div><small>{m.sourceId}</small></td>
            <td className="lx-inventory-report-quantity" dir="ltr">{m.quantity}</td>
            <td><div>{t('From','من')}: {warehouse(from)}</div><div>{t('To','إلى')}: {warehouse(to)}</div><div>{m.reasonCategory}</div><p>{m.note}</p>{m.evidence?<small>{t('Saved proof','الإثبات المحفوظ')}: {m.evidence.name}</small>:null}</td></tr>;
        })}</tbody>
      </table>
      {!props.movements.length?<p>{t('No movements match these filters.','لا توجد حركات تطابق هذه الفلاتر.')}</p>:null}
      <footer>LOUREX · {t('Inventory movement report','تقرير حركة المخزون')}</footer>
    </article>,document.body)}</>;
}
