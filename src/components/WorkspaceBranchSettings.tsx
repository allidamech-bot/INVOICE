import type { BranchRecord, WorkspaceRecord } from '../types.js';
import { t } from '../lib/i18n.js';
import { Button, Input, Select } from './UI.js';

interface Props{
  workspaces:WorkspaceRecord[];
  branches:BranchRecord[];
  activeWorkspaceId:string;
  activeBranchId:string;
  onCreateWorkspace:(name:string)=>Promise<void>;
  onSwitchWorkspace:(id:string)=>Promise<void>;
  onCreateBranch:(name:string,code:string)=>Promise<void>;
  onSwitchBranch:(id:string)=>Promise<void>;
}

export function WorkspaceBranchSettings(props:Props):any{
  const [workspaceName,setWorkspaceName]=React.useState('');
  const [branchName,setBranchName]=React.useState('');
  const [branchCode,setBranchCode]=React.useState('');
  const [busy,setBusy]=React.useState('');
  const [error,setError]=React.useState('');
  const currentWorkspace=props.workspaces.find(item=>item.id===props.activeWorkspaceId)??props.workspaces[0];
  const branches=props.branches.filter(item=>item.workspaceId===currentWorkspace?.id&&item.active);
  const run=async(key:string,fn:()=>Promise<void>)=>{if(busy)return;setBusy(key);setError('');try{await fn();}catch(e){setError(e instanceof Error?e.message:t('Unable to update workspace settings.','تعذر تحديث إعدادات مساحة العمل.'));}finally{setBusy('');}};
  const createWorkspace=()=>void run('workspace-create',async()=>{await props.onCreateWorkspace(workspaceName);setWorkspaceName('');});
  const createBranch=()=>void run('branch-create',async()=>{await props.onCreateBranch(branchName,branchCode);setBranchName('');setBranchCode('');});
  return <div className="lx-workspace-settings">
    <section className="lx-workspace-summary"><div><small>{t('Active company','الشركة الحالية')}</small><strong>{currentWorkspace?.name||t('Workspace','مساحة العمل')}</strong><span>{branches.find(item=>item.id===props.activeBranchId)?.name||branches[0]?.name||t('No branch','لا يوجد فرع')}</span></div><div className="lx-workspace-switchers"><label><span>{t('Company workspace','مساحة الشركة')}</span><Select value={props.activeWorkspaceId} disabled={Boolean(busy)} onChange={(e:any)=>void run('workspace-switch',()=>props.onSwitchWorkspace(e.target.value))}>{props.workspaces.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</Select></label><label><span>{t('Branch','الفرع')}</span><Select value={props.activeBranchId} disabled={Boolean(busy)||!branches.length} onChange={(e:any)=>void run('branch-switch',()=>props.onSwitchBranch(e.target.value))}>{branches.map(item=><option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</Select></label></div></section>
    <section className="lx-workspace-card"><header><div><small>{t('Companies','الشركات')}</small><h4>{t('Add company workspace','إضافة مساحة شركة')}</h4></div><span>{props.workspaces.length}</span></header><p>{t('Each company keeps its own company profile, document numbering, smart defaults and operational data inside the same encrypted vault.','لكل شركة ملفها الخاص وترقيم مستنداتها وإعداداتها الذكية وبياناتها التشغيلية داخل نفس الخزنة المشفرة.')}</p><div className="lx-workspace-create"><Input value={workspaceName} placeholder={t('Company / workspace name','اسم الشركة / مساحة العمل')} onChange={(e:any)=>setWorkspaceName(e.target.value)}/><Button variant="primary" icon="plus" disabled={Boolean(busy)} onClick={createWorkspace}>{t('Add company','إضافة شركة')}</Button></div><div className="lx-workspace-list">{props.workspaces.map(item=><article key={item.id} className={item.id===props.activeWorkspaceId?'is-active':''}><div><strong>{item.name}</strong><small>{item.company.country||item.company.city||t('Company workspace','مساحة شركة')}</small></div><span>{props.branches.filter(branch=>branch.workspaceId===item.id&&branch.active).length} {t('branches','فروع')}</span></article>)}</div></section>
    <section className="lx-workspace-card"><header><div><small>{t('Branches','الفروع')}</small><h4>{t('Operational branches','الفروع التشغيلية')}</h4></div><span>{branches.length}</span></header><p>{t('Transactions, documents, purchases, payments and stock movements are isolated by branch. Customers, suppliers and product master data remain shared inside the company workspace.','تُعزل المعاملات والمستندات والمشتريات والمدفوعات وحركات المخزون حسب الفرع، بينما تبقى بيانات العملاء والموردين والأصناف مشتركة داخل الشركة.')}</p><div className="lx-workspace-create is-branch"><Input value={branchName} placeholder={t('Branch name','اسم الفرع')} onChange={(e:any)=>setBranchName(e.target.value)}/><Input dir="ltr" value={branchCode} placeholder={t('Code','الرمز')} onChange={(e:any)=>setBranchCode(e.target.value.toUpperCase())}/><Button variant="primary" icon="plus" disabled={Boolean(busy)} onClick={createBranch}>{t('Add branch','إضافة فرع')}</Button></div><div className="lx-workspace-list">{branches.map(item=><article key={item.id} className={item.id===props.activeBranchId?'is-active':''}><div><strong>{item.name}</strong><small dir="ltr">{item.code}</small></div><span>{item.city||item.country||'—'}</span></article>)}</div></section>
    {error?<p className="form-error" role="alert">{error}</p>:null}
  </div>;
}
