import type { InventoryMovementRecord, SavedItem, WarehouseRecord } from '../types.js';
import { canArchiveWarehouse, createWarehouse, createWarehouseTransfer, defaultWarehouseId, warehouseBalances, warehouseItemQuantity } from '../lib/warehouses.js';
import { decimalToScaled } from '../lib/money.js';
import { t } from '../lib/i18n.js';
import { mutateVaultSafely } from '../storage/vault-mutation-bridge.js';
import { Button, Input, Select, Textarea } from './UI.js';

interface Props {items:SavedItem[];inventoryMovements:InventoryMovementRecord[];warehouses:WarehouseRecord[];workspaceId:string;branchId:string;}
function itemLabel(item:SavedItem):string{return item.sku||item.descriptionEn||item.descriptionAr||t('Product','منتج');}
export function WarehouseLocationsPage(props:Props):any{
  const defaultId=defaultWarehouseId(props.branchId),warehouses=props.warehouses.filter(item=>item.branchId===props.branchId),active=warehouses.filter(item=>item.active);
  const [filter,setFilter]=React.useState('ALL'),[name,setName]=React.useState(''),[code,setCode]=React.useState('WH'),[itemId,setItemId]=React.useState(props.items[0]?.id||''),[from,setFrom]=React.useState(active[0]?.id||defaultId),[to,setTo]=React.useState(active[1]?.id||active[0]?.id||defaultId),[quantity,setQuantity]=React.useState(''),[note,setNote]=React.useState(''),[busy,setBusy]=React.useState(false),[error,setError]=React.useState('');
  React.useEffect(()=>{if(!itemId&&props.items[0])setItemId(props.items[0].id);if(!active.some(w=>w.id===from)&&active[0])setFrom(active[0].id);if(!active.some(w=>w.id===to)){const candidate=active.find(w=>w.id!==from)||active[0];if(candidate)setTo(candidate.id);}},[props.items.length,active.map(w=>w.id).join('|')]);
  const balances=warehouseBalances(props.items,props.inventoryMovements,warehouses,defaultId),visible=filter==='ALL'?balances:balances.filter(row=>row.warehouseId===filter);
  const stocked=visible.filter(row=>row.quantityScaled!==0n);
  const addWarehouse=async()=>{if(busy)return;setBusy(true);setError('');try{const warehouse=createWarehouse(props.workspaceId,props.branchId,name,code);await mutateVaultSafely(vault=>({...vault,warehouses:[...vault.warehouses,warehouse]}));setName('');setCode('WH');}catch(e){setError(e instanceof Error?e.message:t('Unable to create stock location.','تعذر إنشاء موقع المخزون.'));}finally{setBusy(false);}};
  const archive=async(warehouse:WarehouseRecord)=>{
    if(busy)return;
    setBusy(true);setError('');
    try{
      await mutateVaultSafely(vault=>{
        if(vault.appSettings.activeWorkspaceId!==props.workspaceId||vault.appSettings.activeBranchId!==props.branchId)throw new Error(t('Workspace changed. Reopen Stock Locations.','تغيرت مساحة العمل. أعد فتح مواقع المخزون.'));
        const current=vault.warehouses.find(row=>row.id===warehouse.id&&row.branchId===props.branchId&&row.workspaceId===props.workspaceId);
        if(!current||!current.active)throw new Error(t('Stock location is no longer active.','موقع المخزون لم يعد نشطًا.'));
        if(!canArchiveWarehouse(current.id,vault.savedItems,vault.inventoryMovements,defaultId))throw new Error(t('Move all stock out of this location before archiving it.','انقل كامل المخزون من هذا الموقع قبل أرشفته.'));
        return {...vault,warehouses:vault.warehouses.map(row=>row.id===current.id?{...row,active:false,updatedAt:new Date().toISOString()}:row)};
      });
    }catch(e){setError(e instanceof Error?e.message:t('Unable to archive location.','تعذر أرشفة الموقع.'));}
    finally{setBusy(false);}
  };
  const transfer=async()=>{
    if(busy)return;
    setBusy(true);setError('');
    try{
      await mutateVaultSafely(vault=>{
        if(vault.appSettings.activeWorkspaceId!==props.workspaceId||vault.appSettings.activeBranchId!==props.branchId)throw new Error(t('Workspace changed. Reopen Stock Locations.','تغيرت مساحة العمل. أعد فتح مواقع المخزون.'));
        const item=vault.savedItems.find(row=>row.id===itemId);
        if(!item)throw new Error(t('Choose a product.','اختر صنفًا.'));
        const activeLocation=(id:string)=>vault.warehouses.some(row=>row.id===id&&row.active&&row.workspaceId===props.workspaceId&&row.branchId===props.branchId);
        if(!activeLocation(from)||!activeLocation(to))throw new Error(t('Stock location changed. Select active locations again.','تغير موقع المخزون. اختر مواقع نشطة من جديد.'));
        const movement=createWarehouseTransfer(item,from,to,quantity,undefined,note);
        const available=warehouseItemQuantity(item.id,from,vault.inventoryMovements,defaultId);
        const required=decimalToScaled(movement.quantity,4);
        if(required>available)throw new Error(t('Transfer quantity exceeds available stock at the source location.','كمية التحويل تتجاوز المخزون المتاح في موقع المصدر.'));
        return {...vault,inventoryMovements:[...vault.inventoryMovements,movement]};
      });
      setQuantity('');setNote('');
    }catch(e){setError(e instanceof Error?e.message:t('Unable to transfer stock.','تعذر تحويل المخزون.'));}
    finally{setBusy(false);}
  };
  return <section className="ta-ops-page lx-warehouse-page"><header className="ta-page-header"><div><span className="ta-page-kicker">{t('Warehouses & stock locations','المستودعات ومواقع المخزون')}</span><h2>{t('Stock Locations','مواقع المخزون')}</h2><p>{t('Track quantity by location. Historical movements migrated to the branch primary location without changing total stock.','تتبع الكمية حسب الموقع. تم إسناد الحركات التاريخية إلى الموقع الرئيسي للفرع دون تغيير إجمالي المخزون.')}</p></div></header>
    <section className="ta-panel"><header className="ta-panel-header"><div><span>{t('Locations','المواقع')}</span><h3>{t('Branch warehouses','مستودعات الفرع')}</h3></div><div className="ta-panel-status">{active.length}</div></header><div className="lx-location-cards">{warehouses.map(w=>{const rows=balances.filter(row=>row.warehouseId===w.id&&row.quantityScaled!==0n);return <article className={`lx-location-card ${w.active?'':'is-archived'}`} key={w.id}><div><strong>{w.name}</strong><small>{w.code}</small></div><span>{rows.length} {t('stocked products','أصناف لها رصيد')}</span>{w.active&&w.id!==defaultId?<Button variant="danger" disabled={busy} onClick={()=>void archive(w)}>{t('Archive','أرشفة')}</Button>:null}{w.id===defaultId?<em>{t('Primary migrated location','الموقع الرئيسي للبيانات التاريخية')}</em>:null}</article>})}</div><div className="lx-form-grid"><label><span>{t('Location name','اسم الموقع')}</span><Input value={name} onChange={(e:any)=>setName(e.target.value)} placeholder={t('Jeddah Warehouse','مستودع جدة')}/></label><label><span>{t('Code','الرمز')}</span><Input value={code} maxLength={12} onChange={(e:any)=>setCode(String(e.target.value).toUpperCase())}/></label></div><Button icon="plus" variant="primary" disabled={busy||!name.trim()} onClick={()=>void addWarehouse()}>{t('Add location','إضافة موقع')}</Button></section>
    <section className="ta-panel"><header className="ta-panel-header"><div><span>{t('Internal transfer','تحويل داخلي')}</span><h3>{t('Move stock between locations','نقل المخزون بين المواقع')}</h3></div></header><div className="lx-form-grid"><label><span>{t('Product','الصنف')}</span><Select value={itemId} onChange={(e:any)=>setItemId(e.target.value)}>{props.items.map(item=><option key={item.id} value={item.id}>{itemLabel(item)}</option>)}</Select></label><label><span>{t('From','من')}</span><Select value={from} onChange={(e:any)=>setFrom(e.target.value)}>{active.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</Select></label><label><span>{t('To','إلى')}</span><Select value={to} onChange={(e:any)=>setTo(e.target.value)}>{active.filter(w=>w.id!==from).map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</Select></label><label><span>{t('Quantity','الكمية')}</span><Input inputMode="decimal" value={quantity} onChange={(e:any)=>setQuantity(e.target.value)}/></label><label className="lx-form-wide"><span>{t('Note','ملاحظة')}</span><Textarea rows={2} value={note} onChange={(e:any)=>setNote(e.target.value)}/></label></div>{error?<p className="lifecycle-error" role="alert">{error}</p>:null}<Button variant="primary" icon="refresh" disabled={busy||active.length<2} onClick={()=>void transfer()}>{t('Transfer stock','تحويل المخزون')}</Button></section>
    <section className="ta-panel"><header className="ta-panel-header"><div><span>{t('Balances by location','الأرصدة حسب الموقع')}</span><h3>{t('Available stock','المخزون المتاح')}</h3></div><Select value={filter} onChange={(e:any)=>setFilter(e.target.value)}><option value="ALL">{t('All locations','كل المواقع')}</option>{warehouses.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</Select></header><div className="ta-table-wrap"><table className="ta-table"><thead><tr><th>{t('Location','الموقع')}</th><th>{t('Product','الصنف')}</th><th>{t('SKU','SKU')}</th><th>{t('On hand','المتوفر')}</th></tr></thead><tbody>{stocked.map(row=><tr key={`${row.warehouseId}:${row.item.id}`}><td>{warehouses.find(w=>w.id===row.warehouseId)?.name||row.warehouseId}</td><td>{row.item.descriptionEn||row.item.descriptionAr}</td><td>{row.item.sku||'—'}</td><td><strong>{row.quantity}</strong></td></tr>)}</tbody></table>{!stocked.length?<div className="ta-empty-card">{t('No stock in this filter.','لا يوجد مخزون ضمن هذا الفلتر.')}</div>:null}</div></section>
  </section>;
}
