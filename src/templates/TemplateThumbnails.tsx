import type { LourexDocument, TemplateId } from '../types.js';
import { t } from '../lib/i18n.js';
import { TemplateRenderer } from './TemplateRenderer.js';

const templates: Array<{ id: TemplateId; nameEn: string; nameAr: string; subEn: string; subAr: string }> = [
  { id: 'executive', nameEn: 'Executive', nameAr: 'تنفيذي', subEn: 'Navy / Ivory', subAr: 'كحلي / عاجي' },
  { id: 'minimal', nameEn: 'Minimal', nameAr: 'بسيط', subEn: 'European clean', subAr: 'أوروبي نظيف' },
  { id: 'trade', nameEn: 'International Trade', nameAr: 'تجارة دولية', subEn: 'Trade detail', subAr: 'تفاصيل تجارية' },
  { id: 'signature', nameEn: 'Signature', nameAr: 'مميز', subEn: 'Distinctive premium', subAr: 'فاخر ومميز' }
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
