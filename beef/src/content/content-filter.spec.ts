import { describe, it, expect } from 'vitest';
import { filterRoast, filterRoasts } from './content-filter.js';

describe('filterRoast', () => {
  it('passes a valid roast', () => {
    const result = filterRoast(
      'opensea peak: $2.9B monthly volume. opensea now: $5M. did not survive becoming the myspace of jpegs.',
    );
    expect(result.passed).toBe(true);
    expect(result.reasons).toEqual([]);
  });

  it('rejects text exceeding 280 chars', () => {
    const longText = 'a'.repeat(281);
    const result = filterRoast(longText);
    expect(result.passed).toBe(false);
    expect(result.reasons[0]).toMatch(/exceeds 280 chars/);
  });

  it('rejects empty text', () => {
    const result = filterRoast('');
    expect(result.passed).toBe(false);
    expect(result.reasons).toContain('empty text');
  });

  it('rejects banned words', () => {
    const result = filterRoast('this project is retarded and the devs know it');
    expect(result.passed).toBe(false);
    expect(result.reasons[0]).toMatch(/banned word/);
  });

  it('rejects financial advice patterns', () => {
    const result = filterRoast('you should buy now before the pump hits');
    expect(result.passed).toBe(false);
    expect(result.reasons[0]).toMatch(/financial advice/);
  });

  it('rejects NFA/DYOR', () => {
    const result = filterRoast('this project is down 90% but NFA');
    expect(result.passed).toBe(false);
    expect(result.reasons[0]).toMatch(/financial advice/);
  });

  it('rejects ticker spam', () => {
    const result = filterRoast('buy $BEEF and hold $BEEF because $BEEF is the future');
    expect(result.passed).toBe(false);
    expect(result.reasons).toContain('ticker spam (same ticker 3+ times)');
  });

  it('rejects self-harm references', () => {
    const result = filterRoast('this chart makes me want to end it all');
    expect(result.passed).toBe(false);
    expect(result.reasons[0]).toMatch(/self-harm/);
  });

  it('rejects personal attacks on family', () => {
    const result = filterRoast('his wife must be disappointed by these returns');
    expect(result.passed).toBe(false);
    expect(result.reasons[0]).toMatch(/personal attack/);
  });

  it('rejects text starting with @mention', () => {
    const result = filterRoast('@SomeProject your TVL is down 94%');
    expect(result.passed).toBe(false);
    expect(result.reasons).toContain('starts with @mention');
  });

  it('rejects text with too many sentences', () => {
    const result = filterRoast(
      'One. Two. Three. Four. Five. Six. Seven.',
    );
    expect(result.passed).toBe(false);
    expect(result.reasons[0]).toMatch(/more than 4 sentences/);
  });

  it('passes text with up to 4 sentences', () => {
    const result = filterRoast(
      'first thing. second thing. third thing. fourth thing is the kicker.',
    );
    expect(result.reasons).not.toContainEqual(expect.stringMatching(/sentences/));
  });

  it('passes text at exactly 280 chars', () => {
    const text = 'a'.repeat(280);
    const result = filterRoast(text);
    expect(result.reasons).not.toContainEqual(expect.stringMatching(/exceeds/));
  });

  it('allows different tickers mentioned', () => {
    const result = filterRoast('$ETH dropped while $SOL pumped and $BEEF just watches');
    expect(result.passed).toBe(true);
  });
});

describe('filterRoasts', () => {
  it('filters multiple texts', () => {
    const results = filterRoasts([
      'valid roast about opensea down 94%',
      '',
      'another valid roast here with data',
    ]);
    expect(results).toHaveLength(3);
    expect(results[0]!.filter.passed).toBe(true);
    expect(results[1]!.filter.passed).toBe(false);
    expect(results[2]!.filter.passed).toBe(true);
  });
});
