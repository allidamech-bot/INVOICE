/**
 * LOUREX AI Living Workspace — conversation-mode contract.
 *
 * Mode is a restrictive presentation/orchestration boundary, never a grant of
 * account permission. All operations must ALSO pass existing actor, company,
 * branch, approval and capability checks. Runtime wiring is a later batch.
 *
 * Existing 'personal' / 'business' / 'temporary' storage scopes are different
 * from these two UI modes and must not be silently migrated or merged.
 */
export const AI_CONVERSATION_MODES = ['controller', 'advisor'] as const;
export type AiConversationMode = (typeof AI_CONVERSATION_MODES)[number];

export type AiConversationInterfaceLanguage = 'inherit' | 'ar' | 'en';
export type AiConversationReplyLanguage = 'auto' | 'ar' | 'en' | 'bilingual';
export type AiConversationDetail = 'balanced' | 'brief' | 'detailed';
export type AiConversationMotion = 'system' | 'reduced';

export interface AiConversationExperiencePreferences {
  interfaceLanguage: AiConversationInterfaceLanguage;
  replyLanguage: AiConversationReplyLanguage;
  detail: AiConversationDetail;
  motion: AiConversationMotion;
  reviewVoiceTranscriptBeforeSend: boolean;
}

export const DEFAULT_AI_CONVERSATION_PREFERENCES: Readonly<AiConversationExperiencePreferences> = Object.freeze({
  interfaceLanguage: 'inherit',
  replyLanguage: 'auto',
  detail: 'balanced',
  motion: 'system',
  reviewVoiceTranscriptBeforeSend: true,
});

/**
 * Deliberately closed allowlist: Advisor may read and explain, but must never
 * navigate, create drafts, edit records, call generic tools, run tool plans, or
 * approve pending actions. Every read remains subject to current account scope.
 */
export const ADVISOR_READ_CAPABILITIES: readonly string[] = Object.freeze([
  'workspace.help',
  'finance.explain',
  'business.explain',
  'pricing.explain',
  'document.review',
]);

export function isAiConversationMode(value: unknown): value is AiConversationMode {
  return value === 'controller' || value === 'advisor';
}

/** Invalid or stale mode values fail closed to Advisor, not Controller. */
export function normalizeAiConversationMode(value: unknown): AiConversationMode {
  return value === 'controller' ? 'controller' : 'advisor';
}

/** Mode is the sole endpoint authority; an attachment never grants execution.
 * Unknown modes fail closed to read-only Advisor. Capability classification,
 * file content, and language must not override the selected mode.
 */
export function resolveAiConversationEndpoint(
  mode: unknown,
  hasCurrentSources: boolean,
): '/api/ai-core' | '/api/ai-advisor-v2' | '/api/ai-conversation-v3' {
  if (normalizeAiConversationMode(mode) === 'controller') return '/api/ai-core';
  return hasCurrentSources ? '/api/ai-conversation-v3' : '/api/ai-advisor-v2';
}

/**
 * An additional deny-only check. Returning true NEVER authorizes an action:
 * the existing role, company/branch scope and approval guard remain required.
 */
export function conversationModePermitsCapability(mode: AiConversationMode, capability: string): boolean {
  return normalizeAiConversationMode(mode) === 'advisor' ? ADVISOR_READ_CAPABILITIES.includes(capability) : true;
}

/** Typed read/calculate operations may inform an Advisor response only. */
export function conversationModePermitsToolClass(
  mode: AiConversationMode,
  toolClass: 'read' | 'calculate' | 'prepare' | 'execute' | 'high-impact',
): boolean {
  return normalizeAiConversationMode(mode) === 'controller' || toolClass === 'read' || toolClass === 'calculate';
}

/**
 * The reply-language preference applies only to the AI response. The main
 * LOUREX site locale and the language of generated documents are untouched.
 * When set to automatic, prefer an explicit Arabic/Latin user instruction;
 * number-only or mixed neutral messages inherit the site locale.
 */
export function resolveAiConversationReplyLanguage(
  preference: AiConversationReplyLanguage,
  message: string,
  siteLanguage: 'ar' | 'en',
): 'ar' | 'en' {
  if(preference==='ar'||preference==='en')return preference;
  const source=String(message||'').slice(0,1000);
  const arabic=(source.match(/[\u0621-\u064A\u0671-\u06D3]/g)||[]).length;
  const latin=(source.match(/[A-Za-z]/g)||[]).length;
  if(arabic>=3&&arabic>=latin/2)return 'ar';
  if(latin>=3&&latin>arabic*2)return 'en';
  return siteLanguage;
}

/**
 * Readable tab description; a single centered line in RTL/LTR, no extra card.
 * Language is passed explicitly so the text is independent of site locale.
 */
export function conversationModeDescription(mode: AiConversationMode, language: 'ar' | 'en'): string {
  if (language === 'ar') {
    return mode === 'controller'
      ? 'تحكّم بموقعك، أنشئ المستندات، عدّل ونفّذ المهام'
      : 'اسأل وناقش وحلّل أمورك المالية والمحاسبية والتجارية';
  }
  return mode === 'controller'
    ? 'Manage LOUREX, create documents, edit records and execute tasks'
    : 'Ask, discuss and analyze your financial and business questions';
}

/** No persistence is performed here: only well-formed preferences are accepted. */
export function normalizeAiConversationPreferences(value: unknown): AiConversationExperiencePreferences {
  const raw = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Partial<AiConversationExperiencePreferences>
    : {};
  const allowed = <T extends string>(candidate: unknown, values: readonly T[], fallback: T): T =>
    typeof candidate === 'string' && (values as readonly string[]).includes(candidate)
      ? candidate as T
      : fallback;
  return {
    interfaceLanguage: allowed(raw.interfaceLanguage, ['inherit', 'ar', 'en'], 'inherit'),
    replyLanguage: allowed(raw.replyLanguage, ['auto', 'ar', 'en', 'bilingual'], 'auto'),
    detail: allowed(raw.detail, ['balanced', 'brief', 'detailed'], 'balanced'),
    motion: allowed(raw.motion, ['system', 'reduced'], 'system'),
    reviewVoiceTranscriptBeforeSend: raw.reviewVoiceTranscriptBeforeSend !== false,
  };
}
