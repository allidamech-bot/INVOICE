import type { Customer, VaultPayload } from '../types.js';
import { buildQuoteAiReview, type QuoteAiSourceDraft, type QuoteAiReview } from './quote-ai-review.js';
import { scopeVault } from './workspaces.js';

/**
 * AI Inbox may propose an existing party, but that match is not authority.
 * Resolve it against the FRESH vault during the guarded save transaction.
 *
 * A missing customer is intentionally an unlinked quotation DRAFT, not an
 * instruction to create a company master record from unverified PDF text.
 */
export function resolveAiInboxQuoteCustomer(vault: VaultPayload, customerId: string): Customer | null {
  const id=String(customerId||'').trim();
  if(!id)return null;
  const workspace=vault.appSettings.activeWorkspaceId||'default';
  const matches=vault.customers.filter(row=>row.id===id&&(row.workspaceId||'default')===workspace);
  if(matches.length!==1)throw new Error('Customer match changed or is outside the active company. Review the quotation again.');
  return matches[0]!;
}

/** A stale/mismatched catalog match must not silently become a new manual line. */
export function assertAiInboxQuoteProductScope(vault: VaultPayload, itemId: string): void {
  const id=String(itemId||'').trim();
  if(!id)return;
  const workspace=vault.appSettings.activeWorkspaceId||'default';
  const matches=vault.savedItems.filter(row=>row.id===id&&(row.workspaceId||'default')===workspace);
  if(matches.length!==1||matches[0]?.archived===true)
    throw new Error('Product match changed or is outside the active company. Review the quotation again.');
}

export function aiInboxUnlinkedCustomerNote(name: string): string {
  const safe=String(name||'').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,160);
  return safe?'Customer identified in AI source (NOT linked to a customer record; verify before issuing): '+safe:'';
}

/**
 * An AI preview is not permission to reuse stale customer links, costs or
 * automatically suggested prices. Check the complete reviewed pricing against
 * the latest scoped vault BEFORE reserving a document number or writing rows.
 * AI instructions may provide data, but cannot bypass this confirmation.
 */
export function assertAiInboxQuoteReviewFresh(vault:VaultPayload,draft:QuoteAiSourceDraft,review:QuoteAiReview):void {
  const latest=buildQuoteAiReview(scopeVault(vault),draft);
  const row=(value:QuoteAiReview['items'][number])=>({
    matchedItemId:value.matchedItemId,
    matchBasis:value.matchBasis,
    effectiveUnitPrice:value.effectiveUnitPrice,
    priceSource:value.priceSource,
    cost:value.cost,
    costCurrency:value.costCurrency,
    suggestedPrice:value.suggestedPrice,
    warnings:value.warnings
  });
  const fingerprint=(value:QuoteAiReview)=>JSON.stringify({
    currency:value.currency,customerId:value.customer.customerId,
    customerBasis:value.customer.matchBasis,
    items:value.items.map(row),warningCount:value.warningCount,
    blockingAttentionCount:value.blockingAttentionCount
  });
  if(!review||fingerprint(latest)!==fingerprint(review))
    throw new Error('Quotation source, customer match or pricing changed. Refresh and review every line before saving.');
}
