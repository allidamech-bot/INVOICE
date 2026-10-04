import type { AiWorkspaceScreen } from './AiCopilot.js';
import type { AssistantEntityType } from '../lib/ai-assistant-foundation.js';
import { Button } from './UI.js';

export const CONTEXTUAL_ADVISOR_EVENT='lourex-advisor-context';
export interface ContextualAdvisorEntity{type:AssistantEntityType;id:string;label:string;}
export function ContextualAdvisorAction(props:{screen:AiWorkspaceScreen;label:string;question:string;disabled?:boolean;entity?:ContextualAdvisorEntity|null}):any{
  return <Button icon="bot" disabled={props.disabled} onClick={()=>window.dispatchEvent(new CustomEvent(CONTEXTUAL_ADVISOR_EVENT,{detail:{screen:props.screen,question:props.question.slice(0,1000),entity:props.entity??null}}))}>{props.label}</Button>;
}
