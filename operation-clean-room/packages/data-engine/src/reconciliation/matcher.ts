import type { MatchResult, MatchConfidence } from './types.js';
import type { SalesforceAccount, ChargebeeSubscription, StripePayment } from '../ingestion/types.js';
import { normalizeCompanyName } from '../utils/normalization.js';

/**
 * Fuzzy matching engine for cross-system entity resolution.
 *
 * Must handle variant company names, different ID schemes, and partial
 * matches.  The matcher should use a combination of:
 *
 * - **Exact ID matching**: When external IDs (stripe_customer_id,
 *   chargebee_customer_id) are present and valid, these are the strongest
 *   signals.
 *
 * - **Domain matching**: If both entities have a website/domain field,
 *   matching domains are a very strong signal.
 *
 * - **Fuzzy name matching**: Company names vary across systems
 *   ("Acme Corp" vs "ACME Corporation Ltd." vs "acme").  Use normalized
 *   string comparison with techniques such as:
 *   - Case folding
 *   - Stripping common suffixes (Corp, Inc, Ltd, LLC, GmbH, etc.)
 *   - Token-based similarity (Jaccard, Sørensen-Dice)
 *   - Edit distance (Levenshtein)
 *
 * - **Composite scoring**: Combine signals from multiple fields into
 *   a single confidence score using configurable weights.
 *
 * @module reconciliation/matcher
 */

/** Options for controlling the entity matching process. */
export interface MatchOptions {
  /** Minimum confidence score (0-1) to consider a match. Defaults to 0.6. */
  threshold?: number;
  /** Weight for exact ID matches. Defaults to 1.0. */
  idWeight?: number;
  /** Weight for domain matches. Defaults to 0.9. */
  domainWeight?: number;
  /** Weight for name similarity. Defaults to 0.7. */
  nameWeight?: number;
  /** Whether to allow many-to-one matches. Defaults to false. */
  allowMultipleMatches?: boolean;
}

const DEFAULT_OPTIONS: Required<Pick<MatchOptions, 'threshold' | 'idWeight' | 'domainWeight' | 'nameWeight'>> = {
  threshold: 0.36,    
  idWeight: 1.0,
  domainWeight: 0.9,
  nameWeight: 0.8,  
};

/**
 * Extract domain from website or email.
 */
function extractDomain(input: string): string | null {
  if (!input) return null;
  
  // email
  if (input.includes('@')) {
    return input.split('@')[1]?.toLowerCase() || null;
  }
  
  // website
  const match = input.match(/(?:https?:\/\/)?(?:www\.)?([^\/\s]+)/);
  return match?.[1]?.toLowerCase() || null;
}

/**
 * Calculate Levenshtein distance between two strings.
 */
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = Array(b.length + 1)
    .fill(0)
    .map(() => Array(a.length + 1).fill(0));

  for (let i = 0; i <= a.length; i++) {
    matrix[0]![i] = i;
  }
  for (let j = 0; j <= b.length; j++) {
    matrix[j]![0] = j;
  }

  for (let j = 1; j <= b.length; j++) {
    for (let i = 1; i <= a.length; i++) {
      const indicator = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[j]![i] = Math.min(
        matrix[j]![i - 1]! + 1, // deletion
        matrix[j - 1]![i]! + 1, // insertion
        matrix[j - 1]![i - 1]! + indicator, // substitution
      );
    }
  }

  return matrix[b.length]![a.length]!;
}

/**
 * Calculate string similarity (0-1, where 1 is perfect match).
 */
function stringSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (!a || !b) return 0;

  const maxLength = Math.max(a.length, b.length);
  const distance = levenshteinDistance(a, b);
  return 1 - (distance / maxLength);
}

/**
 * Calculate match confidence between Salesforce account and Chargebee subscription.
 */
export function matchSalesforceToChargebee(
  account: SalesforceAccount,
  subscription: ChargebeeSubscription,
  options: MatchOptions = {},
): MatchConfidence {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const matchedFields: string[] = [];
  const unmatchedFields: string[] = [];
  let totalScore = 0;
  let totalWeight = 0;

  // Exact ID match (highest confidence)
  if (account.chargebee_customer_id && account.chargebee_customer_id === subscription.customer.customer_id) {
    matchedFields.push('chargebee_customer_id');
    totalScore += opts.idWeight;
    totalWeight += opts.idWeight;
  } else if (account.chargebee_customer_id) {
    unmatchedFields.push('chargebee_customer_id');
  }

  const accountDomain = extractDomain(account.website);
  const subscriptionDomain = extractDomain(subscription.customer.email);

  if (accountDomain && subscriptionDomain) {
    totalWeight += opts.domainWeight;   
    const domainMatch =
      accountDomain === subscriptionDomain ||
      accountDomain.includes(subscriptionDomain) ||
      subscriptionDomain.includes(accountDomain);
    if (domainMatch) {
      matchedFields.push('domain');
      totalScore += opts.domainWeight;
    } else {
      unmatchedFields.push('domain');
    }
  }

  // Company name similarity
  const normalizedAccountName = normalizeCompanyName(account.account_name);
  const normalizedCompanyName = normalizeCompanyName(subscription.customer.company);

  // whether domain was present or not — an exact name match is definitive.
  if (normalizedAccountName === normalizedCompanyName) {
    matchedFields.push('company_name_exact');
    return {
      score: 1.0,
      matchedFields,
      unmatchedFields,
    };
  }

  const nameSimilarity = stringSimilarity(normalizedAccountName, normalizedCompanyName);

  // Boost: high similarity (>= 0.9) should not score below 0.85 — Levenshtein
  // can undervalue near-identical strings (e.g. one extra word).
  const effectiveSimilarity = nameSimilarity >= 0.9 ? Math.max(nameSimilarity, 0.85) : nameSimilarity;

  if (nameSimilarity > 0.7) {
    matchedFields.push('company_name');
  } else {
    unmatchedFields.push('company_name');
  }
  totalScore += effectiveSimilarity * opts.nameWeight;
  totalWeight += opts.nameWeight;

  const confidence = totalWeight > 0 ? totalScore / totalWeight : 0;

  return {
    score: Math.max(0, Math.min(1, confidence)), // safely clamped
    matchedFields,
    unmatchedFields,
  };
}

/**
 * Find best matches between Salesforce accounts and Chargebee subscriptions.
 */
export function findAccountMatches(
  accounts: SalesforceAccount[],
  subscriptions: ChargebeeSubscription[],
  options: MatchOptions = {},
): MatchResult[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const matches: MatchResult[] = [];

  for (const account of accounts) {
    // Score this account against every subscription, keep all above threshold
    const candidates: MatchResult[] = [];

    for (const subscription of subscriptions) {
      const confidence = matchSalesforceToChargebee(account, subscription, options);
      if (confidence.score >= opts.threshold) {
        candidates.push({
          entityA: { id: account.account_id, source: 'salesforce', data: account },
          entityB: { id: subscription.subscription_id, source: 'chargebee', data: subscription },
          confidence,
        });
      }
    }

    if (candidates.length === 0) continue;

    if (opts.allowMultipleMatches) {
      // Caller explicitly asked for all matches above threshold
      matches.push(...candidates);
    } else {
      // Default: keep only the single best match per Salesforce account
      candidates.sort((a, b) => b.confidence.score - a.confidence.score);
      matches.push(candidates[0]!);
    }
  }

  // Sort final list by confidence score (highest first)
  return matches.sort((a, b) => b.confidence.score - a.confidence.score);
}

/**
 * Match entities across two data sources using fuzzy matching.
 *
 * @param sourceA - Array of entities from the first data source
 * @param sourceB - Array of entities from the second data source
 * @param options - Matching options
 * @returns Array of match results with confidence scores
 */
export async function matchEntities(
  sourceA: Record<string, unknown>[],
  sourceB: Record<string, unknown>[],
  options?: MatchOptions,
): Promise<MatchResult[]> {
  // TODO: Implement cross-system entity matching
  throw new Error('Not implemented');
}

/**
 * Calculate the confidence score for a potential match between two entities.
 *
 * @param entityA - First entity (must have at minimum: id, name)
 * @param entityB - Second entity (must have at minimum: id, name)
 * @returns Confidence assessment with score, matched fields, and unmatched fields
 */
export async function calculateConfidence(
  entityA: Record<string, unknown>,
  entityB: Record<string, unknown>,
): Promise<MatchConfidence> {
  const matchedFields: string[] = [];
  const unmatchedFields: string[] = [];
  let score = 0;

  // Extract fields from entities
  const nameA = String(entityA.name || entityA.account_name || '');
  const nameB = String(entityB.name || entityB.account_name || (entityB as any).customer?.company || '');
  const domainA = extractDomain(String(entityA.domain || entityA.website || ''));
  const domainB = extractDomain(String(entityB.domain || entityB.website || ''));

  // Domain matching (60% weight)
  if (domainA && domainB) {
    if (domainA.toLowerCase() === domainB.toLowerCase()) {
      score += 0.6;
      matchedFields.push('domain');
    } else {
      unmatchedFields.push('domain');
    }
  }

  // Company name matching (40% weight)
  if (nameA && nameB) {
    const normalizedA = normalizeCompanyName(nameA);
    const normalizedB = normalizeCompanyName(nameB);
    
    // Calculate similarity using Levenshtein distance
    const maxLen = Math.max(normalizedA.length, normalizedB.length);
    const distance = levenshteinDistance(normalizedA, normalizedB);
    const similarity = maxLen > 0 ? (maxLen - distance) / maxLen : 0;
    
    if (similarity > 0.7) {
      score += 0.4 * similarity;
      matchedFields.push('company_name');
    } else {
      unmatchedFields.push('company_name');
    }
  }

  return {
    score: Math.min(1.0, score), // Cap at 1.0
    matchedFields,
    unmatchedFields,
  };
}
