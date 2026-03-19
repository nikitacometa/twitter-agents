import { describe, it, expect } from 'vitest';
import {
  getPersona,
  pickJudgePair,
  buildEvaluationPrompt,
  parseEvaluationOutput,
} from './judge-personas.js';

describe('getPersona', () => {
  it('returns ct_degen persona', () => {
    const p = getPersona('ct_degen');
    expect(p.id).toBe('ct_degen');
    expect(p.name).toBe('CT Degen');
    expect(p.systemPrompt).toContain('CT degen');
  });

  it('returns comedy_writer persona', () => {
    const p = getPersona('comedy_writer');
    expect(p.id).toBe('comedy_writer');
    expect(p.name).toBe('Comedy Writer');
  });

  it('returns data_hawk persona', () => {
    const p = getPersona('data_hawk');
    expect(p.id).toBe('data_hawk');
    expect(p.name).toBe('Data Hawk');
    expect(p.systemPrompt).toContain('fact-checks');
  });
});

describe('pickJudgePair', () => {
  it('returns exactly 2 judges', () => {
    const pair = pickJudgePair();
    expect(pair).toHaveLength(2);
  });

  it('returns distinct judges', () => {
    // Run multiple times — pair must always be distinct
    for (let i = 0; i < 50; i++) {
      const [a, b] = pickJudgePair();
      expect(a.id).not.toBe(b.id);
    }
  });

  it('all three personas appear over many picks', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const [a, b] = pickJudgePair();
      seen.add(a.id);
      seen.add(b.id);
    }
    expect(seen.size).toBe(3);
  });
});

describe('buildEvaluationPrompt', () => {
  const persona = getPersona('ct_degen');

  it('includes persona system prompt', () => {
    const prompt = buildEvaluationPrompt(persona, 'Uniswap', 'test roast', null);
    expect(prompt).toContain(persona.systemPrompt);
  });

  it('includes target name and tweet text', () => {
    const prompt = buildEvaluationPrompt(persona, 'Aave', 'your tvl is fake', null);
    expect(prompt).toContain('Target: "Aave"');
    expect(prompt).toContain('Roast: "your tvl is fake"');
  });

  it('includes research context when provided', () => {
    const prompt = buildEvaluationPrompt(persona, 'X', 'roast', 'TVL dropped 90%');
    expect(prompt).toContain('Research context: "TVL dropped 90%"');
  });

  it('shows no-research message when research is null', () => {
    const prompt = buildEvaluationPrompt(persona, 'X', 'roast', null);
    expect(prompt).toContain('No research context available');
  });

  it('includes all 6 scoring criteria', () => {
    const prompt = buildEvaluationPrompt(persona, 'X', 'roast', null);
    expect(prompt).toContain('SAVAGE');
    expect(prompt).toContain('FACTUAL');
    expect(prompt).toContain('FUNNY');
    expect(prompt).toContain('ORIGINAL');
    expect(prompt).toContain('SHAREABLE');
    expect(prompt).toContain('CRYPTO_NATIVE');
  });

  it('requests JSON output format', () => {
    const prompt = buildEvaluationPrompt(persona, 'X', 'roast', null);
    expect(prompt).toContain('Respond with ONLY valid JSON');
    expect(prompt).toContain('"reasoning"');
    expect(prompt).toContain('"scores"');
    expect(prompt).toContain('"composite"');
  });
});

describe('parseEvaluationOutput', () => {
  const validJson = JSON.stringify({
    reasoning: 'Solid roast with real data',
    scores: { savage: 4, factual: 5, funny: 3, original: 4, shareable: 4, crypto_native: 5 },
    composite: 4.2,
    verdict: 'stockpile',
    one_line_why: 'Data-backed and brutal',
  });

  it('parses valid JSON output', () => {
    const result = parseEvaluationOutput(validJson);
    expect(result.reasoning).toBe('Solid roast with real data');
    expect(result.scores.savage).toBe(4);
    expect(result.scores.factual).toBe(5);
    expect(result.scores.funny).toBe(3);
    expect(result.scores.original).toBe(4);
    expect(result.scores.shareable).toBe(4);
    expect(result.scores.crypto_native).toBe(5);
    expect(result.composite).toBe(4.2);
    expect(result.verdict).toBe('stockpile');
    expect(result.one_line_why).toBe('Data-backed and brutal');
  });

  it('strips markdown code fences', () => {
    const wrapped = '```json\n' + validJson + '\n```';
    const result = parseEvaluationOutput(wrapped);
    expect(result.composite).toBe(4.2);
  });

  it('handles code fences without language tag', () => {
    const wrapped = '```\n' + validJson + '\n```';
    const result = parseEvaluationOutput(wrapped);
    expect(result.scores.savage).toBe(4);
  });

  it('extracts JSON embedded in surrounding text', () => {
    const messy = 'Here is my evaluation:\n\n' + validJson + '\n\nHope this helps!';
    const result = parseEvaluationOutput(messy);
    expect(result.verdict).toBe('stockpile');
  });

  it('recalculates composite when missing', () => {
    const noComposite = JSON.stringify({
      reasoning: 'ok',
      scores: { savage: 3, factual: 3, funny: 3, original: 3, shareable: 3, crypto_native: 3 },
      verdict: 'discard',
      one_line_why: 'mid',
    });
    const result = parseEvaluationOutput(noComposite);
    expect(result.composite).toBe(3.0);
  });

  it('rounds composite to 1 decimal', () => {
    const oddComposite = JSON.stringify({
      reasoning: 'ok',
      scores: { savage: 4, factual: 5, funny: 3, original: 4, shareable: 3, crypto_native: 4 },
      composite: 3.8333333,
      verdict: 'discard',
      one_line_why: 'close',
    });
    const result = parseEvaluationOutput(oddComposite);
    expect(result.composite).toBe(3.8);
  });

  it('normalizes non-stockpile verdict to discard', () => {
    const badVerdict = JSON.stringify({
      reasoning: 'ok',
      scores: { savage: 2, factual: 2, funny: 2, original: 2, shareable: 2, crypto_native: 2 },
      composite: 2.0,
      verdict: 'reject',
      one_line_why: 'bad',
    });
    const result = parseEvaluationOutput(badVerdict);
    expect(result.verdict).toBe('discard');
  });

  it('defaults missing string fields to empty string', () => {
    const minimal = JSON.stringify({
      scores: { savage: 3, factual: 3, funny: 3, original: 3, shareable: 3, crypto_native: 3 },
      composite: 3.0,
    });
    const result = parseEvaluationOutput(minimal);
    expect(result.reasoning).toBe('');
    expect(result.one_line_why).toBe('');
  });

  it('throws on missing scores object', () => {
    expect(() => parseEvaluationOutput('{"reasoning":"ok"}')).toThrow('Missing or invalid scores');
  });

  it('throws on missing score field', () => {
    const missing = JSON.stringify({
      scores: { savage: 3, factual: 3, funny: 3, original: 3, shareable: 3 },
    });
    expect(() => parseEvaluationOutput(missing)).toThrow('Missing or non-numeric score: crypto_native');
  });

  it('throws on non-numeric score', () => {
    const badScore = JSON.stringify({
      scores: { savage: 'high', factual: 3, funny: 3, original: 3, shareable: 3, crypto_native: 3 },
    });
    expect(() => parseEvaluationOutput(badScore)).toThrow('Missing or non-numeric score: savage');
  });

  it('throws when no JSON found', () => {
    expect(() => parseEvaluationOutput('This is just text, no JSON here.')).toThrow('No JSON object');
  });
});
