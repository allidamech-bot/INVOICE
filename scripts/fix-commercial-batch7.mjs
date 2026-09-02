import { readFileSync, writeFileSync } from 'node:fs';
function patch(path,from,to,label){const source=readFileSync(path,'utf8');const first=source.indexOf(from);if(first<0)throw new Error(`Missing ${label}`);if(source.indexOf(from,first+from.length)>=0)throw new Error(`Ambiguous ${label}`);writeFileSync(path,source.slice(0,first)+to+source.slice(first+from.length));}

patch('src/app/App.tsx',
"import { applyCustomerCommercialDefaults, applyPaymentTermPreset, assertCustomerCreditLimit, paymentTermPresetByLabel } from '../lib/commercial-controls.js';",
"import { applyCustomerCommercialDefaults, applyPaymentTermPreset, assertCustomerCreditLimit, paymentTermPresetById, paymentTermPresetByLabel } from '../lib/commercial-controls.js';",
'commercial import');

patch('src/app/App.tsx',
"const numbered=nextDocumentNumber(withSource,'invoice');const converted=convertToInvoice(savedSource,numbered.number);const convertedDocuments=[...sourceDocuments,converted];",
"const numbered=nextDocumentNumber(withSource,'invoice');let converted=convertToInvoice(savedSource,numbered.number);const convertedPaymentPreset=paymentTermPresetById(current.company,converted.paymentTermPresetId)||paymentTermPresetByLabel(current.company,converted.terms.paymentTerms);if(convertedPaymentPreset)converted=applyPaymentTermPreset(converted,convertedPaymentPreset);const convertedDocuments=[...sourceDocuments,converted];",
'conversion due date');

patch('src/app/App.tsx',
"else{target={...structuredClone(doc),status:'final',updatedAt:new Date().toISOString()};const idx=vault.documents.findIndex(d=>d.id===target.id);const documents=[...vault.documents];if(idx>=0)documents[idx]=target;else documents.push(target);await this.persist({...vault,documents});}",
"else{target={...structuredClone(doc),status:'final',updatedAt:new Date().toISOString()};assertCustomerCreditLimit(target,vault.customers,vault.documents,vault.payments);const idx=vault.documents.findIndex(d=>d.id===target.id);const documents=[...vault.documents];if(idx>=0)documents[idx]=target;else documents.push(target);await this.persist({...vault,documents});}",
'print issuance credit guard');
