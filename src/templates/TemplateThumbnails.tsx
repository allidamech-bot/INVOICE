import type { LourexDocument, TemplateId } from '../types.js';
import { TemplateRenderer } from './TemplateRenderer.js';

const templates: Array<{ id: TemplateId; name: string; sub: string }> = [
  { id: 'executive', name: 'Executive', sub: 'Navy / Ivory' },
  { id: 'minimal', name: 'Minimal', sub: 'European clean' },
  { id: 'trade', name: 'International Trade', sub: 'Trade detail' },
  { id: 'signature', name: 'Signature', sub: 'Distinctive premium' }
];

export function TemplateThumbnails({ document: doc, onSelect }: { document: LourexDocument; onSelect: (id: TemplateId) => void }): any {
  return <div className="template-selector">{templates.map(t => {
    const preview = { ...doc, appearance: { ...doc.appearance, templateId: t.id } };
    return <button type="button" className={`template-card ${doc.appearance.templateId === t.id ? 'selected' : ''}`} onClick={() => onSelect(t.id)} key={t.id}>
      <div className="template-mini"><TemplateRenderer document={preview} scale={0.16} compact={true}/></div>
      <span><b>{t.name}</b><small>{t.sub}</small></span>
    </button>;
  })}</div>;
}
