import type { LourexDocument, TemplateId } from '../types.js';
import { TemplateArtwork, templateArtPalette } from './TemplateArtwork.js';
import { resolvedAccent, resolvedAppearanceTokens } from '../lib/appearance.js';
import { t } from '../lib/i18n.js';

const templates: Array<{ id: TemplateId; nameEn: string; nameAr: string; subEn: string; subAr: string }> = [
  { id: 'executive', nameEn: 'Executive', nameAr: 'تنفيذي', subEn: 'Navy / Amber ribbon', subAr: 'كحلي / شريط عنبري' },
  { id: 'minimal', nameEn: 'Minimal', nameAr: 'بسيط', subEn: 'European clean', subAr: 'أوروبي نظيف' },
  { id: 'trade', nameEn: 'International Trade', nameAr: 'تجارة دولية', subEn: 'Trade detail', subAr: 'تفاصيل تجارية' },
  { id: 'signature', nameEn: 'Signature', nameAr: 'مميز', subEn: 'Distinctive premium', subAr: 'فاخر ومميز' },
  { id: 'obsidian', nameEn: 'Obsidian', nameAr: 'أوبسيديان', subEn: 'Deep dark luxury', subAr: 'داكن فاخر' },
  { id: 'cobalt', nameEn: 'Cobalt', nameAr: 'كوبالت', subEn: 'Blue / Navy waves', subAr: 'موجات زرقاء وكحلية' },
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

function StaticTemplatePreview({ id, appearance }:{ id:TemplateId; appearance:LourexDocument['appearance'] }):any{
  const local={...appearance,templateId:id,paletteMode:'auto' as const};
  const p=templateArtPalette(local),tokens=resolvedAppearanceTokens(local),accent=resolvedAccent(local);
  const swapped=id==='cobalt'||id==='aurora'||id==='slate';
  return <svg className="template-mini template-mini-static" viewBox="0 0 1000 1414" aria-hidden="true" focusable="false">
    <rect width="1000" height="1414" fill={tokens.page}/>
    <TemplateArtwork variant={id} position="rail" accent={accent}/>
    <svg x="0" y="0" width="1000" height="180" viewBox="0 0 1000 320" preserveAspectRatio="none"><TemplateArtwork variant={id} position="header" accent={accent}/></svg>
    <rect x={swapped?740:85} y="57" width="150" height="42" rx="3" fill="#102c40"/>
    <path d={swapped?'M755 70v15h17':'M100 70v15h17'} fill="none" stroke={accent} strokeWidth="6"/>
    <rect x={swapped?85:650} y="68" width="240" height="13" rx="2" fill={p.ink}/>
    <g fill={tokens.secondary} opacity=".65">{[85,315,545,775].map(x=><rect key={x} x={x} y="225" width="140" height="8"/>)}
    {[85,535].map(x=><g key={x}><rect x={x} y="290" width="240" height="12"/><rect x={x} y="320" width="325" height="7"/><rect x={x} y="342" width="275" height="7"/></g>)}</g>
    <rect x="85" y="402" width="805" height="39" fill={p.second}/>
    {[0,1,2,3,4].map(i=><g key={i}><rect x="85" y={449+i*62} width="805" height="53" fill={tokens.primary} opacity={i%2?.06:.025}/><rect x="105" y={469+i*62} width="420" height="7" fill={tokens.primary} opacity=".65"/><rect x="790" y={469+i*62} width="75" height="7" fill={tokens.primary}/></g>)}
    <rect x="600" y="800" width="290" height="43" rx="5" fill={accent}/>
    <g fill={tokens.secondary} opacity=".65"><rect x="85" y="808" width="180" height="9"/><rect x="85" y="840" width="360" height="7"/><rect x="85" y="865" width="290" height="7"/><rect x="85" y="975" width="160" height="9"/><rect x="85" y="1005" width="330" height="7"/></g>
    <path d="M660 1020q30-50 50-10t70-5q25-20 65-15" fill="none" stroke={tokens.primary} strokeWidth="3"/>
    <svg x="0" y="1315" width="1000" height="99" viewBox="0 0 1000 150" preserveAspectRatio="none"><TemplateArtwork variant={id} position="footer" accent={accent}/></svg>
  </svg>;
}

export function TemplateThumbnails({ document:doc,onSelect,favoriteIds=[],defaultId,onToggleFavorite }:Props):any{
  const favorites=new Set(favoriteIds);
  const ordered=[...templates].sort((a,b)=>Number(favorites.has(b.id))-Number(favorites.has(a.id)));
  return <div className="template-selector">{ordered.map(template=>{
    const favorite=favorites.has(template.id);
    const isDefault=defaultId===template.id;
    const selected=doc.appearance.templateId===template.id;
    return <div className={`template-card-wrap ${favorite?'is-favorite':''} ${selected?'is-selected':''}`} key={template.id}>
      <button type="button" className={`template-card ${selected?'selected':''}`} aria-pressed={selected} onClick={()=>onSelect(template.id)}>
        <StaticTemplatePreview id={template.id} appearance={doc.appearance}/>
        <span className="template-card-copy"><b>{t(template.nameEn,template.nameAr)}</b><small>{t(template.subEn,template.subAr)}</small><em>{selected?t('Selected','محدد'):t('Tap to preview','اضغط للمعاينة')}</em></span>
        {isDefault?<em className="template-default-badge">{t('Default','افتراضي')}</em>:null}
      </button>
      {onToggleFavorite?<button type="button" className={`template-favorite-button ${favorite?'active':''}`} aria-label={favorite?t('Remove from favorites','إزالة من المفضلة'):t('Add to favorites','إضافة للمفضلة')} title={favorite?t('Remove from favorites','إزالة من المفضلة'):t('Add to favorites','إضافة للمفضلة')} onClick={()=>onToggleFavorite(template.id)}>{favorite?'★':'☆'}</button>:null}
    </div>;
  })}</div>;
}
