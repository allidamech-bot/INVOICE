import { activeAccountStorageUid } from '../storage/db.js';
import type { TeamRole, VaultPayload } from '../types.js';
import type { KernelScope } from './ai-conversation-kernel.js';
import type { AssistantMemoryRecord } from '../storage/assistant-memory-store.js';
import { scopeVault } from './workspaces.js';
import { strictAiActor } from './ai-foundation-approval.js';
export type BusinessNodeKind='customer'|'supplier'|'product'|'document'|'purchase'|'payment'|'memory';
export interface BusinessNode {id:string;recordId:string;kind:BusinessNodeKind;label:string;status:string;date:string;source:string;certainty:'recorded'|'user-declared';}
export interface BusinessEdge {id:string;from:string;to:string;relation:'customer-document'|'supplier-purchase'|'purchase-product'|'document-payment';sourceId:string;date:string;}
export interface BusinessMemoryGraph {scope:KernelScope;builtAt:string;nodes:BusinessNode[];edges:BusinessEdge[];unresolvedLinks:number;}
const KINDS:Record<TeamRole,BusinessNodeKind[]>={owner:['customer','supplier','product','document','purchase','payment','memory'],admin:['customer','supplier','product','document','purchase','payment','memory'],finance:['customer','supplier','product','document','purchase','payment'],sales:['customer','product','document'],purchasing:['supplier','product','purchase'],viewer:['customer','product','document']};
export function graphScope(vault:VaultPayload,scope:KernelScope):VaultPayload {const v=scopeVault(vault);if((scope.accountId!==undefined&&scope.accountId!==(activeAccountStorageUid()||''))||scope.scope==='personal'||scope.workspaceId!==v.appSettings.activeWorkspaceId||scope.branchId!==v.appSettings.activeBranchId)throw new Error('Business graph scope changed. / تغيّر نطاق الذاكرة التجارية.');strictAiActor(vault);return v;}
export function graphKindAllowed(role:TeamRole,kind:string):boolean{return KINDS[role]?.some(allowed=>allowed===kind)||false;}
/** Derived from exact scoped record IDs. No fuzzy product links or duplicate-name merges. */
export function buildBusinessMemoryGraph(vault:VaultPayload,scope:KernelScope,memories:AssistantMemoryRecord[]=[],at=new Date().toISOString()):BusinessMemoryGraph {
 const v=graphScope(vault,scope),role=strictAiActor(vault).role,nodes:BusinessNode[]=[],edges:BusinessEdge[]=[],ids=new Set<string>();let unresolvedLinks=0;const edgeIds=new Set<string>();
 const node=(kind:BusinessNodeKind,row:any,label:string,status='',date='',certainty:BusinessNode['certainty']='recorded')=>{if(!graphKindAllowed(role,kind))return;const id=kind+':'+row.id;if(ids.has(id))throw new Error('Duplicate record identity in business graph.');ids.add(id);nodes.push({id,recordId:row.id,kind,label,status,date,source:kind==='memory'?'assistant-memory (approved declaration)':'LOUREX '+kind,certainty});};
 for(const c of v.customers)node('customer',c,c.companyNameAr||c.companyNameEn||c.contactPerson||c.id,'',c.updatedAt||'');
 for(const s of v.suppliers)node('supplier',s,s.nameAr||s.nameEn||s.id,'',s.updatedAt||'');
 for(const p of v.savedItems)node('product',p,[p.sku,p.descriptionAr||p.descriptionEn].filter(Boolean).join(' · '),p.archived?'archived':'',p.updatedAt||'');
 for(const d of v.documents)node('document',d,d.number,d.status,d.issueDate);
 for(const p of v.purchases)node('purchase',p,p.number,p.status,p.date);
 for(const p of v.payments)node('payment',p,p.reference||p.invoiceNumber||p.id,'recorded',p.date);
 for(const m of memories)if(m.scope==='business'&&m.workspaceId===scope.workspaceId&&m.branchId===scope.branchId&&m.active&&(!m.expiresAt||Date.parse(m.expiresAt)>Date.parse(at)))node('memory',m,m.content,m.kind,m.lastConfirmedAt,'user-declared');
 const edge=(from:string,to:string,relation:BusinessEdge['relation'],sourceId:string,date:string)=>{if(!ids.has(from))return;if(!ids.has(to)){if(graphKindAllowed(role,to.split(':')[0] as BusinessNodeKind))unresolvedLinks++;return;}const id=relation+':'+sourceId+':'+from+':'+to;if(!edgeIds.has(id)){edgeIds.add(id);edges.push({id,from,to,relation,sourceId,date});}};
 for(const d of v.documents)if(d.customerSnapshot?.sourceCustomerId)edge('document:'+d.id,'customer:'+d.customerSnapshot.sourceCustomerId,'customer-document',d.id,d.issueDate);
 for(const p of v.purchases){if(p.supplierSnapshot?.sourceSupplierId)edge('purchase:'+p.id,'supplier:'+p.supplierSnapshot.sourceSupplierId,'supplier-purchase',p.id,p.date);for(const i of p.items)if(i.savedItemId)edge('purchase:'+p.id,'product:'+i.savedItemId,'purchase-product',p.id,p.date);}
 for(const p of v.payments)if(p.invoiceId)edge('payment:'+p.id,'document:'+p.invoiceId,'document-payment',p.id,p.date);
 return{scope:structuredClone(scope),builtAt:at,nodes,edges,unresolvedLinks};
}
export function searchBusinessGraph(graph:BusinessMemoryGraph,query:string):BusinessNode[]{const text=query.normalize('NFKC').trim().toLowerCase();return graph.nodes.filter(n=>(n.label+' '+n.recordId+' '+n.kind).normalize('NFKC').toLowerCase().includes(text));}
export interface HandoffPreview {id:string;scope:KernelScope;actorId:string;actorRole:TeamRole;recipientId:string;recipientRole:TeamRole;selectedNodeId:string;preparedAt:string;nodes:BusinessNode[];edges:BusinessEdge[];status:'local-preview-not-sent';}
export function prepareBusinessHandoff(vault:VaultPayload,graph:BusinessMemoryGraph,selectedNodeId:string,recipientId:string):HandoffPreview {
 graphScope(vault,graph.scope);const actor=strictAiActor(vault),recipients=vault.teamMembers.filter(m=>m.id===recipientId),recipient=recipients.length===1&&recipients[0]?.status==='active'?recipients[0]:undefined;if(!recipient)throw new Error('Choose an active team member.');
 graph=buildBusinessMemoryGraph(vault,graph.scope);
 const selected=graph.nodes.find(n=>n.id===selectedNodeId);if(!selected||!graphKindAllowed(actor.role,selected.kind)||!graphKindAllowed(recipient.role,selected.kind))throw new Error('Recipient role cannot receive this record.');
 const related=new Set([selected.id,...graph.edges.filter(e=>e.from===selected.id||e.to===selected.id).flatMap(e=>[e.from,e.to])]);
 const nodes=graph.nodes.filter(n=>related.has(n.id)&&graphKindAllowed(actor.role,n.kind)&&graphKindAllowed(recipient.role,n.kind)).map(n=>({...n}));
 const allowed=new Set(nodes.map(n=>n.id));return{id:crypto.randomUUID(),scope:structuredClone(graph.scope),actorId:actor.id,actorRole:actor.role,recipientId:recipient.id,recipientRole:recipient.role,selectedNodeId:selected.id,preparedAt:new Date().toISOString(),nodes,edges:graph.edges.filter(e=>allowed.has(e.from)&&allowed.has(e.to)),status:'local-preview-not-sent'};
}
