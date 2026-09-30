import type { Supplier } from '../types.js';
import type { Supplier360Snapshot } from '../lib/relationship-360.js';
import { buildSupplier360 } from '../lib/relationship-360.js';
import { resumeVaultSession } from '../storage/vault.js';
import { t } from '../lib/i18n.js';
import { Supplier360Panel } from './Relationship360Panels.js';

export function Supplier360LivePanel({supplier}:{supplier:Supplier}):any{
  const [snapshot,setSnapshot]=React.useState<Supplier360Snapshot|null>(null);
  const [error,setError]=React.useState('');
  React.useEffect(()=>{
    let active=true;
    setSnapshot(null);setError('');
    void resumeVaultSession().then(session=>{
      if(!active)return;
      if(!session){setError(t('Supplier 360 is unavailable while the encrypted vault is locked.','ملف المورد 360 غير متاح أثناء قفل الخزنة المشفرة.'));return;}
      setSnapshot(buildSupplier360(supplier,session.vault.purchases,session.vault.expenses,session.vault.savedItems));
    }).catch(()=>{if(active)setError(t('Unable to load Supplier 360 safely.','تعذر تحميل ملف المورد 360 بأمان.'));});
    return()=>{active=false;};
  },[supplier.id,supplier.updatedAt]);
  if(error)return <section className="lx-360-load-state is-error" role="status">{error}</section>;
  if(!snapshot)return <section className="lx-360-load-state" role="status">{t('Preparing Supplier 360…','جارٍ تجهيز ملف المورد 360…')}</section>;
  return <Supplier360Panel snapshot={snapshot}/>;
}
