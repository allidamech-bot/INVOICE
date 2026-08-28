import type { LourexDocument, TemplateId } from '../types.js';
import { t } from '../lib/i18n.js';
import { TemplateRenderer } from './TemplateRenderer.js';

const templates: Array<{ id: TemplateId; nameEn: string; nameAr: string; subEn: string; subAr: string }> = [
  { id: 'executive', nameEn: 'Executive', nameAr: 'تنفيذي', subEn: 'Navy / Ivory', subAr: 'كحلي / عاجي' },
  { id: 'minimal', nameEn: 'Minimal', nameAr: 'بسيط', subEn: 'European clean', subAr: 'أوروبي نظيف' },
  { id: 'trade', nameEn: 'International Trade', nameAr: 'تجارة دولية', subEn: 'Trade detail', subAr: 'تفاصيل تجارية' },
  { id: 'signature', nameEn: 'Signature', nameAr: 'مميز', subEn: 'Distinctive premium', subAr: 'فاخر ومميز' },
  { id: 'obsidian', nameEn: 'Obsidian', nameAr: 'أوبسيديان', subEn: 'Deep dark luxury', subAr: 'داكن فاخر' },
  { id: 'cobalt', nameEn: 'Cobalt', nameAr: 'كوبالت', subEn: 'Bold vertical split', subAr: 'تقسيم عمودي جريء' },
  { id: 'editorial', nameEn: 'Editorial', nameAr: 'تحريري', subEn: 'Modern typography', subAr: 'طباعة حديثة' },
  { id: 'split', nameEn: 'Split', nameAr: 'مقسّم', subEn: 'Two-tone composition', subAr: 'تكوين ثنائي اللون' },
  { id: 'prism', nameEn: 'Prism', nameAr: 'بريزم', subEn: 'Geometric accent', subAr: 'هندسي ملوّن' },
  { id: 'slate', nameEn: 'Slate', nameAr: 'سليت', subEn: 'Data rail layout', subAr: 'شريط بيانات جانبي' },
  { id: 'horizon', nameEn: 'Horizon', nameAr: 'هورايزن', subEn: 'Airy layered header', subAr: 'طبقات رحبة' },
  { id: 'mono', nameEn: 'Mono Grid', nameAr: 'مونو', subEn: 'Black & white grid', subAr: 'شبكة أبيض وأسود' },
  { id: 'aurora', nameEn: 'Aurora', nameAr: 'أورورا', subEn: 'Color-forward premium', subAr: 'ألوان فاخرة' },
  { id: 'ledger', nameEn: 'Ledger', nameAr: 'ليدجر', subEn: 'Structured modular', subAr: 'وحدات منظمة' },
  { id: 'noir', nameEn: 'Noir Gold', nameAr: 'نوار ذهبي', subEn: 'Matte black / gold rail', subAr: 'أسود مطفي / شريط ذهبي' },
  { id: 'midnight', nameEn: 'Midnight Navy', nameAr: 'منتصف الليل', subEn: 'Deep navy / gold architecture', subAr: 'كحلي عميق / هندسة ذهبية' },
  { id: 'blackivory', nameEn: 'Black Ivory', nameAr: 'أسود عاجي', subEn: 'Black / ivory contrast', subAr: 'تباين أسود / عاجي' },
  { id: 'carbon', nameEn: 'Carbon Luxe', nameAr: 'كربون فاخر', subEn: 'Charcoal / metallic gold', subAr: 'فحمي / ذهبي معدني' }
];

interface Props {
  document:LourexDocument;
  onSelect:(id:TemplateId)=>void;
  favoriteIds?:TemplateId[];
  defaultId?:TemplateId;
  onToggleFavorite?:(id:TemplateId)=>void;
}

// Template cards are decorative previews, not document previews. Rendering the
// full invoice eighteen times can exhaust memory on mobile Safari/WebViews when
// a saved document contains many rows or large base64 logo/signature/stamp
// images. Keep one representative page and strip heavyweight snapshot media.
function thumbnailDocument(doc:LourexDocument):LourexDocument{
  const customer=doc.customerSnapshot;
  return {
    ...doc,
    items:doc.items.slice(0,2).map(item=>({
      ...item,
      descriptionEn:item.descriptionEn.slice(0,72),
      descriptionAr:item.descriptionAr.slice(0,72),
      hsCode:'',origin:'',packing:''
    })),
    customerSnapshot:customer?{
      ...customer,
      addressEn:'',addressAr:'',city:'',country:'',phone:'',email:'',vatTaxNumber:'',commercialRegistration:''
    }:null,
    companySnapshot:{
      ...doc.companySnapshot,
      logoDataUrl:'',addressEn:'',addressAr:'',city:'',country:'',phone:'',email:'',website:'',vatNumber:'',taxNumber:'',commercialRegistration:'',
      bank:{bankName:'',accountName:'',iban:'',swift:'',currency:''},
      signatureDataUrl:'',stampDataUrl:'',footerText:''
    },
    terms:{incoterm:'',paymentTerms:'',packing:'',deliveryTime:'',portOfLoading:'',finalDestination:'',countryOfOrigin:'',validity:'',remarks:''},
    adjustments:{...doc.adjustments,discountEnabled:false,shippingEnabled:false,otherChargesEnabled:false,taxEnabled:false},
    appearance:{...doc.appearance,showBank:false,showSignature:false,showStamp:false,showHsCode:false,showOrigin:false,showPacking:false},
    notes:''
  };
}

export function TemplateThumbnails({ document:doc,onSelect,favoriteIds=[],defaultId,onToggleFavorite }:Props):any{
  const favorites=new Set(favoriteIds);
  const ordered=[...templates].sort((a,b)=>Number(favorites.has(b.id))-Number(favorites.has(a.id)));
  const lightweightDoc=thumbnailDocument(doc);
  return <div className="template-selector">{ordered.map(template=>{
    const preview={...lightweightDoc,appearance:{...lightweightDoc.appearance,templateId:template.id}};
    const favorite=favorites.has(template.id);
    const isDefault=defaultId===template.id;
    return <div className={`template-card-wrap ${favorite?'is-favorite':''}`} key={template.id}>
      <button type="button" className={`template-card ${doc.appearance.templateId===template.id?'selected':''}`} onClick={()=>onSelect(template.id)}>
        <div className="template-mini"><TemplateRenderer document={preview} scale={0.16} compact={true}/></div>
        <span><b>{t(template.nameEn,template.nameAr)}</b><small>{t(template.subEn,template.subAr)}</small></span>
        {isDefault?<em className="template-default-badge">{t('Default','افتراضي')}</em>:null}
      </button>
      {onToggleFavorite?<button type="button" className={`template-favorite-button ${favorite?'active':''}`} aria-label={favorite?t('Remove from favorites','إزالة من المفضلة'):t('Add to favorites','إضافة للمفضلة')} title={favorite?t('Remove from favorites','إزالة من المفضلة'):t('Add to favorites','إضافة للمفضلة')} onClick={()=>onToggleFavorite(template.id)}>{favorite?'★':'☆'}</button>:null}
    </div>;
  })}</div>;
}
