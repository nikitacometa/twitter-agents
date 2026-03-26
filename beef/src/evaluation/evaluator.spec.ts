import { describe, it, expect } from 'vitest';
import {
  calculateWeightedComposite,
  checkHardVetoes,
  checkFunnyConsensusVeto,
  DIMENSION_WEIGHTS,
} from './evaluator.js';
import type { EvaluationScores, JudgeEvaluation } from './types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeScores(overrides: Partial<EvaluationScores> = {}): EvaluationScores {
  return {
    savage: 3, factual: 3, funny: 3, original: 3,
    impact: 3, crypto_native: 3, degen: 3, timely: 3,
    ...overrides,
  };
}

function makeJudge(funnyScore: number): JudgeEvaluation {
  return {
    persona: 'ct_degen',
    result: {
      reasoning: 'test',
      scores: makeScores({ funny: funnyScore }),
      composite: 3,
      verdict: 'stockpile',
      one_line_why: 'test',
    },
  };
}

// ---------------------------------------------------------------------------
// calculateWeightedComposite
// ---------------------------------------------------------------------------

describe('calculateWeightedComposite', () => {
  it('returns weighted sum of all dimensions', () => {
    const scores = makeScores({ funny: 5, impact: 4, original: 3, savage: 2, degen: 1, factual: 1, crypto_native: 1, timely: 0 });
    // 5*0.40 + 4*0.20 + 3*0.15 + 2*0.10 + 1*0.05 + 1*0.05 + 1*0.05 + 0*0.00
    // = 2.0 + 0.8 + 0.45 + 0.2 + 0.05 + 0.05 + 0.05 + 0 = 3.6
    expect(calculateWeightedComposite(scores)).toBeCloseTo(3.6, 5);
  });

  it('returns 0 for all-zero scores', () => {
    const scores = makeScores({ savage: 0, factual: 0, funny: 0, original: 0, impact: 0, crypto_native: 0, degen: 0, timely: 0 });
    expect(calculateWeightedComposite(scores)).toBe(0);
  });

  it('weights sum to 1.0', () => {
    const sum = Object.values(DIMENSION_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1.0, 5);
  });
});

// ---------------------------------------------------------------------------
// checkHardVetoes
// ---------------------------------------------------------------------------

describe('checkHardVetoes', () => {
  it('returns null for passing scores', () => {
    expect(checkHardVetoes(makeScores())).toBeNull();
  });

  it('vetoes FACTUAL < 2', () => {
    expect(checkHardVetoes(makeScores({ factual: 1 }))).toContain('FACTUAL');
  });

  it('vetoes ORIGINAL < 2', () => {
    expect(checkHardVetoes(makeScores({ original: 1 }))).toContain('ORIGINAL');
  });

  it('vetoes DEGEN < 1', () => {
    expect(checkHardVetoes(makeScores({ degen: 0 }))).toContain('DEGEN');
  });

  it('does NOT veto FUNNY < 2 (handled by consensus)', () => {
    expect(checkHardVetoes(makeScores({ funny: 0 }))).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// checkFunnyConsensusVeto — majority threshold
// ---------------------------------------------------------------------------

describe('checkFunnyConsensusVeto', () => {
  describe('5-judge mode', () => {
    it('vetoes when 3/5 judges score FUNNY < 2 (simple majority)', () => {
      const results = [makeJudge(1), makeJudge(1), makeJudge(1), makeJudge(4), makeJudge(5)];
      expect(checkFunnyConsensusVeto(results)).toContain('FUNNY_CONSENSUS');
      expect(checkFunnyConsensusVeto(results)).toContain('3/5');
    });

    it('does NOT veto when only 2/5 score FUNNY < 2', () => {
      const results = [makeJudge(1), makeJudge(1), makeJudge(3), makeJudge(4), makeJudge(5)];
      expect(checkFunnyConsensusVeto(results)).toBeNull();
    });

    it('vetoes when 4/5 score FUNNY < 2', () => {
      const results = [makeJudge(0), makeJudge(1), makeJudge(1), makeJudge(1), makeJudge(5)];
      expect(checkFunnyConsensusVeto(results)).toContain('4/5');
    });

    it('vetoes when all 5 score FUNNY < 2', () => {
      const results = [makeJudge(0), makeJudge(0), makeJudge(1), makeJudge(1), makeJudge(1)];
      expect(checkFunnyConsensusVeto(results)).toContain('5/5');
    });
  });

  describe('3-judge mode', () => {
    it('vetoes when 2/3 judges score FUNNY < 2', () => {
      const results = [makeJudge(1), makeJudge(0), makeJudge(4)];
      expect(checkFunnyConsensusVeto(results)).toContain('FUNNY_CONSENSUS');
      expect(checkFunnyConsensusVeto(results)).toContain('2/3');
    });

    it('does NOT veto when only 1/3 scores FUNNY < 2', () => {
      const results = [makeJudge(1), makeJudge(3), makeJudge(4)];
      expect(checkFunnyConsensusVeto(results)).toBeNull();
    });
  });

  describe('edge cases', () => {
    it('single judge: needs 1/1 to veto (floor(0.5)+1 = 1)', () => {
      expect(checkFunnyConsensusVeto([makeJudge(1)])).toContain('1/1');
    });

    it('single judge: FUNNY >= 2 does not veto', () => {
      expect(checkFunnyConsensusVeto([makeJudge(2)])).toBeNull();
    });

    it('FUNNY exactly 2 does NOT count as low (threshold is < 2)', () => {
      const results = [makeJudge(2), makeJudge(2), makeJudge(2), makeJudge(2), makeJudge(2)];
      expect(checkFunnyConsensusVeto(results)).toBeNull();
    });
  });
});
