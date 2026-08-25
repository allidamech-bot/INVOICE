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

export function TemplateThumbnails({ document: doc, onSelect }: { document: LourexDocument; onSelect: (id: TemplateId) => void }): any {
  return <div className="template-selector">{templates.map(template => {
    const preview = { ...doc, appearance: { ...doc.appearance, templateId: template.id } };
    return <button type="button" className={`template-card ${doc.appearance.templateId === template.id ? 'selected' : ''}`} onClick={() => onSelect(template.id)} key={template.id}>
      <div className="template-mini"><TemplateRenderer document={preview} scale={0.16} compact={true}/></div>
      <span><b>{t(template.nameEn,template.nameAr)}</b><small>{t(template.subEn,template.subAr)}</small></span>
    </button>;
  })}</div>;
}
