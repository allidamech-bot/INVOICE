const STYLE_ID='lourex-recurring-workflows-style';

export function ensureRecurringWorkflowStyles():void{
  if(typeof document==='undefined'||document.getElementById(STYLE_ID))return;
  const style=document.createElement('style');
  style.id=STYLE_ID;
  style.textContent=`
.lx-recurring-manager{display:grid;gap:18px}
.lx-recurring-intro{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:16px;border:1px solid var(--border);border-radius:16px;background:var(--surface-2,rgba(127,127,127,.06))}
.lx-recurring-intro h3{margin:0 0 5px;font-size:16px}.lx-recurring-intro p{margin:0;color:var(--muted);font-size:13px;line-height:1.55;max-width:720px}
.lx-recurring-safe{display:inline-flex;align-items:center;gap:7px;white-space:nowrap;font-size:12px;font-weight:750;padding:7px 10px;border-radius:999px;border:1px solid var(--border);background:var(--surface)}
.lx-recurring-builder{display:grid;gap:14px;padding:16px;border:1px solid var(--border);border-radius:16px;background:var(--surface)}
.lx-recurring-builder-head{display:flex;align-items:center;justify-content:space-between;gap:12px}.lx-recurring-builder-head h3{margin:0;font-size:15px}.lx-recurring-targets{display:flex;gap:7px}
.lx-recurring-targets button{min-height:38px;padding:0 12px;border:1px solid var(--border);border-radius:10px;background:transparent;color:inherit;font-weight:700;cursor:pointer}.lx-recurring-targets button.is-active{background:var(--text);color:var(--surface);border-color:var(--text)}
.lx-recurring-form{display:grid;grid-template-columns:minmax(220px,1.4fr) minmax(150px,.8fr) 100px minmax(145px,.8fr) minmax(145px,.8fr);gap:10px}.lx-recurring-field{display:grid;gap:6px;min-width:0}.lx-recurring-field>span{font-size:11px;font-weight:750;color:var(--muted)}.lx-recurring-title{grid-column:1/-1}
.lx-recurring-actions{display:flex;align-items:center;justify-content:flex-end;gap:8px;flex-wrap:wrap}.lx-recurring-error{padding:10px 12px;border-radius:10px;background:rgba(190,38,38,.09);color:var(--danger,#b42318);font-size:13px;font-weight:650}
.lx-recurring-list{display:grid;gap:10px}.lx-recurring-list-head{display:flex;align-items:center;justify-content:space-between;gap:12px}.lx-recurring-list-head h3{margin:0;font-size:15px}.lx-recurring-count{font-size:12px;color:var(--muted);font-weight:700}
.lx-recurring-card{display:grid;grid-template-columns:minmax(0,1.4fr) minmax(150px,.7fr) minmax(170px,.8fr) auto;gap:14px;align-items:center;padding:14px 15px;border:1px solid var(--border);border-radius:15px;background:var(--surface)}.lx-recurring-card.is-paused{opacity:.72}
.lx-recurring-identity{min-width:0}.lx-recurring-identity small{display:flex;align-items:center;gap:7px;color:var(--muted);font-size:11px;font-weight:750;text-transform:uppercase;letter-spacing:.04em}.lx-recurring-identity strong{display:block;margin-top:4px;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.lx-recurring-identity em{display:block;margin-top:3px;color:var(--muted);font-size:12px;font-style:normal}
.lx-recurring-meta{display:grid;gap:4px}.lx-recurring-meta small{color:var(--muted);font-size:11px}.lx-recurring-meta strong{font-size:13px}.lx-recurring-next{display:grid;grid-template-columns:1fr;gap:5px}.lx-recurring-next small{color:var(--muted);font-size:11px}
.lx-recurring-card-actions{display:flex;gap:6px;justify-content:flex-end;flex-wrap:wrap}.lx-recurring-card-actions .btn{min-height:38px;padding-inline:10px}.lx-recurring-status{display:inline-flex;width:max-content;align-items:center;gap:6px;padding:4px 8px;border-radius:999px;font-size:10px;font-weight:800;background:rgba(34,197,94,.10);color:#15803d}.lx-recurring-status.is-paused{background:rgba(148,163,184,.14);color:var(--muted)}
.lx-recurring-empty{padding:24px 16px;text-align:center;border:1px dashed var(--border);border-radius:15px;color:var(--muted)}.lx-recurring-empty strong{display:block;color:var(--text);margin-bottom:4px}
[dir=rtl] .lx-recurring-card-actions{justify-content:flex-start}
@media(max-width:800px){.lx-recurring-intro{display:grid}.lx-recurring-safe{width:max-content}.lx-recurring-builder-head{align-items:flex-start;flex-direction:column}.lx-recurring-targets{width:100%}.lx-recurring-targets button{flex:1}.lx-recurring-form{grid-template-columns:1fr 1fr}.lx-recurring-title,.lx-recurring-field:first-child{grid-column:1/-1}.lx-recurring-card{grid-template-columns:1fr}.lx-recurring-card-actions{justify-content:stretch}.lx-recurring-card-actions .btn{flex:1}.lx-recurring-actions .btn{width:100%}}
@media(max-width:480px){.lx-recurring-form{grid-template-columns:1fr}.lx-recurring-title,.lx-recurring-field:first-child{grid-column:auto}.lx-recurring-targets{display:grid;grid-template-columns:1fr 1fr}}
`;
  document.head.appendChild(style);
}
