import { describe, it, expect } from 'vitest';
import { MUTATIONS, pickMutations, formatMutationSection } from './mutations.js';
import type { MutationType } from './types.js';

describe('MUTATIONS registry', () => {
  it('has at least 15 mutations', () => {
    expect(MUTATIONS.length).toBeGreaterThanOrEqual(15);
  });

  it('covers all 4 mutation types', () => {
    const types = new Set(MUTATIONS.map((m) => m.type));
    expect(types).toContain('constraint');
    expect(types).toContain('voice');
    expect(types).toContain('perspective');
    expect(types).toContain('wildcard');
  });

  it('all mutations have unique ids', () => {
    const ids = MUTATIONS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('all mutations have non-empty text', () => {
    for (const m of MUTATIONS) {
      expect(m.text.length).toBeGreaterThan(10);
    }
  });
});

describe('pickMutations', () => {
  it('returns requested count', () => {
    expect(pickMutations(1)).toHaveLength(1);
    expect(pickMutations(2)).toHaveLength(2);
    expect(pickMutations(3)).toHaveLength(3);
  });

  it('returns empty array for count 0', () => {
    expect(pickMutations(0)).toHaveLength(0);
  });

  it('returns no more than available mutations', () => {
    const result = pickMutations(100);
    expect(result.length).toBe(MUTATIONS.length);
  });

  it('returns unique mutations (no duplicates)', () => {
    for (let i = 0; i < 50; i++) {
      const picked = pickMutations(5);
      const ids = picked.map((m) => m.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('weighted selection favors constraint mutations', () => {
    const typeCounts: Record<MutationType, number> = {
      constraint: 0,
      voice: 0,
      perspective: 0,
      wildcard: 0,
    };

    const iterations = 1000;
    for (let i = 0; i < iterations; i++) {
      const [mutation] = pickMutations(1);
      typeCounts[mutation!.type]++;
    }

    // Constraint (weight 0.4) should appear most
    expect(typeCounts.constraint).toBeGreaterThan(typeCounts.wildcard);
    expect(typeCounts.constraint).toBeGreaterThan(typeCounts.perspective);

    // Wildcard (weight 0.1) should appear least
    expect(typeCounts.wildcard).toBeLessThan(typeCounts.voice);
  });

  it('all mutation types appear over many picks', () => {
    const seen = new Set<MutationType>();
    for (let i = 0; i < 200; i++) {
      const [mutation] = pickMutations(1);
      seen.add(mutation!.type);
    }
    expect(seen.size).toBe(4);
  });
});

describe('formatMutationSection', () => {
  it('returns empty string for no mutations', () => {
    expect(formatMutationSection([])).toBe('');
  });

  it('includes mutation text for single mutation', () => {
    const result = formatMutationSection([MUTATIONS[0]!]);
    expect(result).toContain(MUTATIONS[0]!.text);
    expect(result).toContain('FARM MUTATION');
    expect(result).toContain('this constraint');
  });

  it('includes all mutation texts for multiple', () => {
    const selected = MUTATIONS.slice(0, 3);
    const result = formatMutationSection(selected);
    for (const m of selected) {
      expect(result).toContain(m.text);
    }
    expect(result).toContain('these constraints');
  });
});
