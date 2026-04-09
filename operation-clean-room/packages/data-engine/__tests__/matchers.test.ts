import { describe, it, expect } from 'vitest';
import { matchEntities, calculateConfidence } from '../src/reconciliation/matcher.js';

describe('Entity Matching', () => {
  it('should match companies with variant names', async () => {
    const confidence = await calculateConfidence(
      { id: '1', name: 'Acme Corp', domain: 'acme.com' },
      { id: '2', name: 'ACME Corporation Ltd.', domain: 'acme.com' },
    );
    expect(confidence.score).toBeGreaterThan(0.8);
  });

  it('should NOT match unrelated companies', async () => {
    const confidence = await calculateConfidence(
      { id: '1', name: 'Acme Corp', domain: 'acme.com' },
      { id: '2', name: 'Beta Industries', domain: 'beta-ind.com' },
    );
    expect(confidence.score).toBeLessThan(0.3);
  });
});
