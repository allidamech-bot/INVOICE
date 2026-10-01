import type { ApprovalPolicyRecord, ApprovalRequestRecord, TeamMemberRecord, TeamRole } from '../types.js';
import { approvalActionLabel, teamRoleLabel } from '../lib/governance.js';
import { makeId } from '../lib/id.js';
import { isArabic, t } from '../lib/i18n.js';
import { Button, Input, Select } from './UI.js';

interface Props{
  teamMembers:TeamMemberRecord[];
  approvalPolicies:ApprovalPolicyRecord[];
  approvalRequests:ApprovalRequestRecord[];
  activeTeamMemberId:string;
  onSaveMember:(member:TeamMemberRecord)=>Promise<void>;
  onToggleMember:(id:string)=>Promise<void>;
  onSetActiveMember:(id:string)=>Promise<void>;
  onTogglePolicy:(id:string,enabled:boolean)=>Promise<void>;
  onDecideApproval:(id:string,decision:'approved'|'rejected')=>Promise<void>;
}

const ROLES:TeamRole[]=['owner','admin','finance','sales','purchasing','viewer'];

export function AccessGovernanceSettings(props:Props):any{
  const [name,setName]=React.useState('');
  const [email,setEmail]=React.useState('');
  const [role,setRole]=React.useState<TeamRole>('viewer');
  const [busy,setBusy]=React.useState('');
  const [error,setError]=React.useState('');
  const arabic=isArabic();
  const activeMembers=props.teamMembers.filter(member=>member.status==='active');
  const pending=props.approvalRequests.filter(request=>request.status==='pending').sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
  const recent=props.approvalRequests.filter(request=>request.status!=='pending').sort((a,b)=>b.decidedAt.localeCompare(a.decidedAt)).slice(0,8);
  const memberName=(id:string)=>props.teamMembers.find(member=>member.id===id)?.displayName||t('Unknown operator','مشغل غير معروف');
  const run=async(key:string,fn:()=>Promise<void>)=>{if(busy)return;setBusy(key);setError('');try{await fn();}catch(e){setError(e instanceof Error?e.message:t('Unable to save access settings.','تعذر حفظ إعدادات الوصول.'));}finally{setBusy('');}};
  const addMember=()=>void run('add',async()=>{
    const cleanName=name.trim();if(!cleanName)throw new Error(t('Enter the team member name.','أدخل اسم عضو الفريق.'));
    const cleanEmail=email.trim();if(cleanEmail&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail))throw new Error(t('Enter a valid email address.','أدخل بريدًا إلكترونيًا صحيحًا.'));
    const now=new Date().toISOString();
    await props.onSaveMember({id:makeId('member'),displayName:cleanName,email:cleanEmail,role,status:'active',createdAt:now,updatedAt:now});
    setName('');setEmail('');setRole('viewer');
  });
  return <div className="lx-governance">
    <section className="lx-governance-hero">
      <div><small>{t('Operator context','سياق المشغل')}</small><h3>{t('Teams, roles & approvals','الفريق والأدوار والموافقات')}</h3><p>{t('Choose the active operator, define operational roles, and require approval before sensitive actions.','اختر المشغل الحالي وحدد الأدوار التشغيلية واطلب موافقة قبل الإجراءات الحساسة.')}</p></div>
      <label><span>{t('Active operator','المشغل الحالي')}</span><Select value={props.activeTeamMemberId} disabled={Boolean(busy)} onChange={(e:any)=>void run('operator',()=>props.onSetActiveMember(e.target.value))}>{activeMembers.map(member=><option key={member.id} value={member.id}>{member.displayName} · {teamRoleLabel(member.role,arabic)}</option>)}</Select></label>
    </section>

    <section className="lx-governance-card"><header><div><small>{t('Team','الفريق')}</small><h4>{t('Members & roles','الأعضاء والأدوار')}</h4></div><span>{activeMembers.length}</span></header>
      <div className="lx-governance-add"><Input value={name} placeholder={t('Member name','اسم العضو')} onChange={(e:any)=>setName(e.target.value)}/><Input dir="ltr" type="email" value={email} placeholder={t('Email (optional)','البريد الإلكتروني (اختياري)')} onChange={(e:any)=>setEmail(e.target.value)}/><Select value={role} onChange={(e:any)=>setRole(e.target.value as TeamRole)}>{ROLES.filter(item=>item!=='owner').map(item=><option key={item} value={item}>{teamRoleLabel(item,arabic)}</option>)}</Select><Button icon="plus" variant="primary" disabled={Boolean(busy)} onClick={addMember}>{t('Add member','إضافة عضو')}</Button></div>
      <div className="lx-governance-members">{props.teamMembers.map(member=><article key={member.id} className={member.status==='suspended'?'is-muted':''}><div><strong>{member.displayName}</strong><small dir="ltr">{member.email||'—'}</small></div><span>{teamRoleLabel(member.role,arabic)}</span><button type="button" disabled={Boolean(busy)||member.id==='owner'} onClick={()=>void run(`member-${member.id}`,()=>props.onToggleMember(member.id))}>{member.status==='active'?t('Suspend','تعليق'):t('Activate','تفعيل')}</button></article>)}</div>
    </section>

    <section className="lx-governance-card"><header><div><small>{t('Approval rules','قواعد الموافقة')}</small><h4>{t('Sensitive action gates','بوابات الإجراءات الحساسة')}</h4></div></header>
      <div className="lx-governance-policies">{props.approvalPolicies.map(policy=><label key={policy.id}><div><strong>{approvalActionLabel(policy.action,arabic)}</strong><small>{t('When enabled, the action waits for an approved request.','عند التفعيل ينتظر الإجراء طلب موافقة معتمدًا.')}</small></div><input type="checkbox" checked={policy.enabled} disabled={Boolean(busy)} onChange={(e:any)=>void run(`policy-${policy.id}`,()=>props.onTogglePolicy(policy.id,e.target.checked))}/></label>)}</div>
    </section>

    <section className="lx-governance-card"><header><div><small>{t('Approval Center','مركز الموافقات')}</small><h4>{t('Pending decisions','القرارات المعلقة')}</h4></div><span>{pending.length}</span></header>
      {pending.length?<div className="lx-approval-list">{pending.map(request=><article key={request.id}><div><strong>{approvalActionLabel(request.action,arabic)} · {request.entityLabel}</strong><small>{t('Requested by','طلبها')} {memberName(request.requestedByMemberId)}</small></div><div><Button disabled={Boolean(busy)} onClick={()=>void run(`reject-${request.id}`,()=>props.onDecideApproval(request.id,'rejected'))}>{t('Reject','رفض')}</Button><Button variant="primary" disabled={Boolean(busy)} onClick={()=>void run(`approve-${request.id}`,()=>props.onDecideApproval(request.id,'approved'))}>{t('Approve','موافقة')}</Button></div></article>)}</div>:<p className="lx-governance-empty">{t('No approval requests are waiting.','لا توجد طلبات موافقة معلقة.')}</p>}
      {recent.length?<div className="lx-governance-recent"><small>{t('Recent decisions','القرارات الأخيرة')}</small>{recent.map(request=><span key={request.id} className={`is-${request.status}`}>{approvalActionLabel(request.action,arabic)} · {request.entityLabel} · {request.status==='approved'?t('Approved','تمت الموافقة'):t('Rejected','مرفوض')}</span>)}</div>:null}
    </section>
    {error?<p className="form-error" role="alert">{error}</p>:null}
  </div>;
}
