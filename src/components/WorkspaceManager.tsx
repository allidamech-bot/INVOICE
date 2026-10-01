import type { BranchRecord, WorkspaceRecord } from '../types.js';
import { t } from '../lib/i18n.js';
import { Button, Input, Modal } from './UI.js';

interface Props{
  open:boolean;
  workspaces:WorkspaceRecord[];
  branches:BranchRecord[];
  activeWorkspaceId:string;
  activeBranchId:string;
  onClose:()=>void;
  onSwitchWorkspace:(workspaceId:string,branchId?:string)=>Promise<void>;
  onSwitchBranch:(branchId:string)=>Promise<void>;
  onCreateWorkspace:(name:string)=>Promise<void>;
  onCreateBranch:(name:string,code:string)=>Promise<void>;
}

export function WorkspaceManager(props:Props):any{
  const [workspaceName,setWorkspaceName]=React.useState('');
  const [branchName,setBranchName]=React.useState('');
  const [branchCode,setBranchCode]=React.useState('');
  const [busy,setBusy]=React.useState(false);
  const [error,setError]=React.useState('');
  React.useEffect(()=>{if(!props.open){setWorkspaceName('');setBranchName('');setBranchCode('');setError('');setBusy(false);}},[props.open]);
  const activeWorkspace=props.workspaces.find(item=>item.id===props.activeWorkspaceId)??props.workspaces[0]??null;
  const activeBranches=activeWorkspace?props.branches.filter(item=>item.workspaceId===activeWorkspace.id):[];
  const act=async(task:()=>Promise<void>)=>{if(busy)return;setBusy(true);setError('');try{await task();}catch(e){setError(e instanceof Error?e.message:t('Unable to update workspace.','تعذر تحديث مساحة العمل.'));}finally{setBusy(false);}};
  const createWorkspace=()=>void act(async()=>{await props.onCreateWorkspace(workspaceName);setWorkspaceName('');});
  const createBranch=()=>void act(async()=>{await props.onCreateBranch(branchName,branchCode);setBranchName('');setBranchCode('');});
  return <Modal open={props.open} title={t('Workspaces & Branches','مساحات العمل والفروع')} size="lg" onClose={()=>{if(!busy)props.onClose();}} footer={<div className="modal-footer-actions"><Button disabled={busy} onClick={props.onClose}>{t('Close','إغلاق')}</Button></div>}>
    <div className="lx-workspace-manager">
      <section className="lx-workspace-section">
        <header><div><small>{t('Companies','الشركات')}</small><h3>{t('Workspaces','مساحات العمل')}</h3></div><span className="lx-workspace-count">{props.workspaces.length}</span></header>
        <p>{t('Each workspace keeps its own company identity, numbering, customers, products and operational records inside the encrypted vault.','تحتفظ كل مساحة عمل بهوية الشركة والترقيم والعملاء والمنتجات والسجلات التشغيلية الخاصة بها داخل الخزنة المشفرة.')}</p>
        <div className="lx-workspace-list">{props.workspaces.map(workspace=>{const active=workspace.id===props.activeWorkspaceId;const firstBranch=props.branches.find(branch=>branch.workspaceId===workspace.id&&branch.active);return <article key={workspace.id} className={`lx-workspace-row ${active?'is-active':''}`}><div><strong>{workspace.name}</strong><small>{workspace.company.nameEn||workspace.company.nameAr||t('Company profile not completed','ملف الشركة غير مكتمل')}</small></div>{active?<span className="lx-workspace-active">{t('Active','نشطة')}</span>:<Button disabled={busy||!firstBranch} onClick={()=>void act(()=>props.onSwitchWorkspace(workspace.id,firstBranch?.id))}>{t('Switch','تبديل')}</Button>}</article>;})}</div>
        <div className="lx-workspace-create"><Input value={workspaceName} onChange={(e:any)=>setWorkspaceName(e.target.value)} placeholder={t('New company workspace name','اسم مساحة عمل الشركة الجديدة')} maxLength={80}/><Button variant="primary" disabled={busy||!workspaceName.trim()} onClick={createWorkspace}>{t('Create Workspace','إنشاء مساحة')}</Button></div>
      </section>

      <section className="lx-workspace-section">
        <header><div><small>{t('Active company','الشركة النشطة')}</small><h3>{t('Branches','الفروع')}</h3></div><span className="lx-workspace-count">{activeBranches.length}</span></header>
        <p>{t('Branches isolate documents, purchases, finance and inventory while sharing the workspace company profile, customers, suppliers and product catalog.','تعزل الفروع المستندات والمشتريات والمالية والمخزون مع مشاركة ملف الشركة والعملاء والموردين ودليل المنتجات ضمن مساحة العمل.')}</p>
        <div className="lx-workspace-list">{activeBranches.map(branch=>{const active=branch.id===props.activeBranchId;return <article key={branch.id} className={`lx-workspace-row ${active?'is-active':''}`}><div><strong>{branch.name}</strong><small><bdi>{branch.code}</bdi>{branch.city?` · ${branch.city}`:''}</small></div>{active?<span className="lx-workspace-active">{t('Active','نشط')}</span>:<Button disabled={busy||!branch.active} onClick={()=>void act(()=>props.onSwitchBranch(branch.id))}>{t('Open','فتح')}</Button>}</article>;})}</div>
        <div className="lx-branch-create"><Input value={branchName} onChange={(e:any)=>setBranchName(e.target.value)} placeholder={t('Branch name','اسم الفرع')} maxLength={80}/><Input value={branchCode} onChange={(e:any)=>setBranchCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g,'').slice(0,12))} placeholder={t('Code','الرمز')} maxLength={12}/><Button variant="primary" disabled={busy||!branchName.trim()||!branchCode.trim()} onClick={createBranch}>{t('Add Branch','إضافة فرع')}</Button></div>
      </section>
      {error?<p className="lx-workspace-error" role="alert">{error}</p>:null}
      <p className="lx-workspace-security">{t('Switching never merges companies or currencies. LOUREX changes only the active encrypted namespace.','لا يؤدي التبديل إلى دمج الشركات أو العملات. يغيّر LOUREX فقط نطاق البيانات المشفر النشط.')}</p>
    </div>
  </Modal>;
}
