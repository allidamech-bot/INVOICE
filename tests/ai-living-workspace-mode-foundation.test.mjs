import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AI_CONVERSATION_MODES,
  DEFAULT_AI_CONVERSATION_PREFERENCES,
  ADVISOR_READ_CAPABILITIES,
  isAiConversationMode,
  normalizeAiConversationMode,
  conversationModePermitsCapability,
  conversationModeDescription,
  normalizeAiConversationPreferences,
} from '../dist/src/lib/ai-conversation-mode.js';

test('only the two approved modes are accepted; unknown modes fail closed', () => {
  assert.deepEqual([...AI_CONVERSATION_MODES], ['controller', 'advisor']);
  assert.equal(isAiConversationMode('controller'), true);
  assert.equal(isAiConversationMode('advisor'), true);
  for (const value of ['auto', 'operator', 'financial', 'personal', 'business', '', null, undefined, {}, 1]) {
    assert.equal(isAiConversationMode(value), false);
    assert.equal(normalizeAiConversationMode(value), 'advisor');
  }
  assert.equal(normalizeAiConversationMode('controller'), 'controller');
});

test('advisor is a strictly read-only capability subset', () => {
  assert.deepEqual([...ADVISOR_READ_CAPABILITIES].sort(), [
    'business.explain', 'document.review', 'finance.explain',
    'pricing.explain', 'workspace.help',
  ].sort());
  for (const name of ADVISOR_READ_CAPABILITIES) {
    assert.equal(conversationModePermitsCapability('advisor', name), true, name);
  }
  for (const forbidden of [
    'workspace.navigate', 'document.createDraft', 'document.updateDraft',
    'item.updateMetadata', 'item.archive', 'item.restore', 'tool.execute',
    'tool.plan', 'tool.read', 'customer.update', 'supplier.update',
    'task.create', 'memory.create', 'document.save', 'document.send', '',
    '__proto__', 'finance.explain.extra',
  ]) {
    assert.equal(conversationModePermitsCapability('advisor', forbidden), false, forbidden);
    // Mode alone is not an authorization grant: controller still requires the
    // existing role/scope/approval checks after this restrictive filter.
    assert.equal(conversationModePermitsCapability('controller', forbidden), true, forbidden);
  }
});

test('Arabic and English descriptions are small distinct mode labels', () => {
  assert.match(conversationModeDescription('controller', 'ar'), /^تحكّم/);
  assert.match(conversationModeDescription('advisor', 'ar'), /^اسأل/);
  assert.match(conversationModeDescription('controller', 'en'), /^Manage/);
  assert.match(conversationModeDescription('advisor', 'en'), /^Ask/);
  assert.doesNotMatch(conversationModeDescription('advisor', 'ar'), /تحكّم/);
});

test('preferences default to inheriting locale, automatic replies and quiet motion', () => {
  assert.deepEqual(normalizeAiConversationPreferences(null), DEFAULT_AI_CONVERSATION_PREFERENCES);
  assert.deepEqual(normalizeAiConversationPreferences({}), DEFAULT_AI_CONVERSATION_PREFERENCES);
  assert.deepEqual(normalizeAiConversationPreferences({
    interfaceLanguage:'en', replyLanguage:'ar', detail:'brief', motion:'reduced', reviewVoiceTranscriptBeforeSend:false,
  }), {
    interfaceLanguage:'en', replyLanguage:'ar', detail:'brief', motion:'reduced', reviewVoiceTranscriptBeforeSend:false,
  });
});

test('untrusted preference values never turn off voice review or loosen mode policy', () => {
  const bad=normalizeAiConversationPreferences({
    interfaceLanguage:'xx', replyLanguage:'free-form', detail:'infinite',
    motion:'always-animate', reviewVoiceTranscriptBeforeSend:0,
  });
  assert.deepEqual(bad, DEFAULT_AI_CONVERSATION_PREFERENCES);
  assert.equal(normalizeAiConversationPreferences({reviewVoiceTranscriptBeforeSend:false}).reviewVoiceTranscriptBeforeSend, false);
  assert.equal(normalizeAiConversationMode({role:'controller'}), 'advisor');
});
