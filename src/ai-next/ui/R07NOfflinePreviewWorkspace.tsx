/**
 * R07N intentionally unmounted R06 preview wiring.
 * No public route, no token handling, no Firebase SDK on client, and NO
 * automatic financial/file/approval capability. The host must provide an
 * authenticated server-backed preview session and own view updates.
 *
 * The FALSE gate prevents mounting even if this component is imported
 * accidentally. It must never be toggled without separate release review.
 */
import type {AuthenticatedScope} from '../domain/contracts.js';
import {NextConversationWorkspace} from './NextConversationWorkspace.js';
import type {R06ConversationView} from './view-model.js';
import {assertR06Scope} from './view-model.js';
import {R07NPreviewSession} from './r07n-preview-session.js';

export const R07N_OFFLINE_WORKSPACE_MOUNTED=false as const;
type Mode='advisor'|'controller';
export interface R07NOfflineWorkspaceProps{
  scope:AuthenticatedScope;
  mode:Mode;
  view:R06ConversationView;
  session:R07NPreviewSession;
  onModeChange:(mode:Mode)=>void;
  onVerifiedView:(view:R06ConversationView)=>void;
}
const unavailable=async():Promise<never>=>{
  throw Error('R07N_UNSUPPORTED_OFFLINE_PREVIEW_OPERATION');
};
/**
 * Only local deterministic messages are supported. Historical navigation is
 * explicit and fully audited; ordinary sends only use the R07L latest-turn
 * projection. No fake uploads or draft mutation/approval actions are exposed.
 */
export function R07NOfflinePreviewWorkspace(props:R07NOfflineWorkspaceProps):any{
  if(!R07N_OFFLINE_WORKSPACE_MOUNTED)return null;
  try{assertR06Scope(props.view,props.scope);}
  catch{return <p role="alert">تعذّر التحقق من نطاق المحادثة.</p>;}
  return <NextConversationWorkspace
    scope={props.scope} view={props.view} mode={props.mode}
    onModeChange={props.onModeChange}
    onSend={async input=>{
      const result=await props.session.send(input);
      if(result.accepted)props.onVerifiedView(props.session.getView());
      return result;
    }}
    onLoadOlder={async()=>{
      const view=await props.session.loadVerifiedHistory();
      props.onVerifiedView(view);
    }}
    onSelectFiles={unavailable}
    onSelectSource={()=>{throw Error('R07N_SOURCES_NOT_SUPPORTED');}}
    onEditDraft={unavailable}
    onUndoDraft={unavailable}
    onRedoDraft={unavailable}
    onDiscardDraft={unavailable}
    onRequestReview={unavailable}
    onCancelTask={unavailable}
    onRetryTask={unavailable}
    onRevokeMemory={unavailable}
  />;
}
