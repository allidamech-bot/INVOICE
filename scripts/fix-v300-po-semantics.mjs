import { readFile, writeFile } from 'node:fs/promises';
const read=p=>readFile(p,'utf8');
const write=(p,s)=>writeFile(p,s,'utf8');
function rep(s,a,b,label){if(!s.includes(a))throw new Error(`Missing ${label}`);return s.replace(a,b);}

{
  let s=await read('src/components/EditorPageCore.tsx');
  s=rep(s,
`    if(d.kind==='proforma'){
      if(!isIsoDate(value))return next;
      const validityDays=daysBetweenIso(d.issueDate,d.dueDate)??normalizeValidityDays(this.props.company.defaultValidityDays);
      return {...next,dueDate:addDaysIso(value,validityDays)};
    }
    const preset=paymentTermPresetById(this.props.company,d.paymentTermPresetId);`,
`    if(d.kind==='proforma'){
      if(!isIsoDate(value))return next;
      const validityDays=daysBetweenIso(d.issueDate,d.dueDate)??normalizeValidityDays(this.props.company.defaultValidityDays);
      return {...next,dueDate:addDaysIso(value,validityDays)};
    }
    // A purchase order owns an explicit requested-delivery date. Changing the
    // order date must never apply customer invoice terms or overwrite delivery.
    if(d.kind==='purchase-order')return next;
    const preset=paymentTermPresetById(this.props.company,d.paymentTermPresetId);`,
'PO issue-date isolation');
  await write('src/components/EditorPageCore.tsx',s);
}

{
  let s=await read('src/templates/TemplateRenderer.tsx');
  s=rep(s,
`{doc.lifecycleStatus==='voided'?<div className="document-void-watermark">{doc.kind==='proforma'?localized(doc,'CANCELLED','ملغى'):localized(doc,'VOID','ملغى')}</div>:null}`,
`{doc.lifecycleStatus==='voided'?<div className="document-void-watermark">{(doc.kind==='proforma'||doc.kind==='purchase-order')?localized(doc,'CANCELLED','ملغى'):localized(doc,'VOID','ملغى')}</div>:null}`,
'PO cancelled watermark');
  await write('src/templates/TemplateRenderer.tsx',s);
}

{
  let s=await read('tests/v300-purchase-order-attachments-pin.test.mjs');
  s += `\ntest('v300 purchase-order dates and cancellation stay purchase-order specific',async()=>{const [core,template]=await Promise.all([read('src/components/EditorPageCore.tsx'),read('src/templates/TemplateRenderer.tsx')]);assert.match(core,/if\(d\.kind==='purchase-order'\)return next;/);assert.match(template,/doc\.kind==='proforma'\|\|doc\.kind==='purchase-order'/);});\n`;
  await write('tests/v300-purchase-order-attachments-pin.test.mjs',s);
}
console.log('v300 PO semantic fixes applied');
