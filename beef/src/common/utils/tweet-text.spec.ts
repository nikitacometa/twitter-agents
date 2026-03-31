import { describe, it, expect } from 'vitest';
import { expandTcoUrls, expandTcoUrlsByPosition, twitterWeightedLength } from './tweet-text.js';

describe('expandTcoUrls', () => {
  it('replaces t.co URL with expanded URL', () => {
    const text = 'Check this out https://t.co/abc123 cool stuff';
    const urls = [{ url: 'https://t.co/abc123', expanded_url: 'https://example.com/article' }];
    expect(expandTcoUrls(text, urls)).toBe('Check this out https://example.com/article cool stuff');
  });

  it('removes media URLs (pic.twitter.com)', () => {
    const text = 'My photo https://t.co/pic123';
    const urls = [{ url: 'https://t.co/pic123', expanded_url: 'https://pic.twitter.com/abc' }];
    expect(expandTcoUrls(text, urls)).toBe('My photo');
  });

  it('removes media URLs (pbs.twimg.com)', () => {
    const text = 'Look at this https://t.co/img456 great';
    const urls = [{ url: 'https://t.co/img456', expanded_url: 'https://pbs.twimg.com/media/123.jpg' }];
    expect(expandTcoUrls(text, urls)).toBe('Look at this great');
  });

  it('handles multiple URLs', () => {
    const text = 'Links: https://t.co/aaa and https://t.co/bbb';
    const urls = [
      { url: 'https://t.co/aaa', expanded_url: 'https://one.com' },
      { url: 'https://t.co/bbb', expanded_url: 'https://two.com' },
    ];
    expect(expandTcoUrls(text, urls)).toBe('Links: https://one.com and https://two.com');
  });

  it('returns text unchanged when no URLs provided', () => {
    expect(expandTcoUrls('hello world', null)).toBe('hello world');
    expect(expandTcoUrls('hello world', [])).toBe('hello world');
    expect(expandTcoUrls('hello world', undefined)).toBe('hello world');
  });

  it('skips entities with missing url or expanded_url', () => {
    const text = 'test https://t.co/xxx end';
    const urls = [{ url: 'https://t.co/xxx' }, { expanded_url: 'https://example.com' }];
    expect(expandTcoUrls(text, urls)).toBe('test https://t.co/xxx end');
  });

  it('handles $ in expanded URLs without special replacement', () => {
    const text = 'Buy https://t.co/abc123 now';
    const urls = [{ url: 'https://t.co/abc123', expanded_url: 'https://dex.com/token/$BEEF' }];
    expect(expandTcoUrls(text, urls)).toBe('Buy https://dex.com/token/$BEEF now');
  });

  it('handles $& and $$ in expanded URLs literally', () => {
    const text = 'Check https://t.co/xyz';
    const urls = [{ url: 'https://t.co/xyz', expanded_url: 'https://example.com/$$profit$$' }];
    expect(expandTcoUrls(text, urls)).toBe('Check https://example.com/$$profit$$');
  });

  it('cleans up double spaces after media removal in middle of text', () => {
    const text = 'before https://t.co/media after';
    const urls = [{ url: 'https://t.co/media', expanded_url: 'https://pic.twitter.com/xyz' }];
    expect(expandTcoUrls(text, urls)).toBe('before after');
  });

  it('handles empty text', () => {
    const urls = [{ url: 'https://t.co/abc', expanded_url: 'https://example.com' }];
    expect(expandTcoUrls('', urls)).toBe('');
  });

  it('handles URL entity not found in text (no crash)', () => {
    const text = 'no matching url here';
    const urls = [{ url: 'https://t.co/notintext', expanded_url: 'https://example.com' }];
    expect(expandTcoUrls(text, urls)).toBe('no matching url here');
  });
});

describe('twitterWeightedLength', () => {
  it('counts ASCII text as 1 per char', () => {
    expect(twitterWeightedLength('hello world')).toBe(11);
  });

  it('counts URLs as 23 each regardless of length', () => {
    expect(twitterWeightedLength('check https://example.com/very/long/path out')).toBe(
      'check '.length + 23 + ' out'.length,
    );
  });

  it('counts multiple URLs correctly', () => {
    expect(twitterWeightedLength('https://a.com https://b.com')).toBe(23 + 1 + 23);
  });

  it('counts emojis (surrogate pairs) as 2', () => {
    // 🔥 is U+1F525, in the emoticons range
    expect(twitterWeightedLength('fire 🔥')).toBe(5 + 2);
  });

  it('counts CJK characters as 2', () => {
    expect(twitterWeightedLength('你好')).toBe(4);
  });

  it('counts mixed ASCII + emoji + CJK', () => {
    // "hi 🔥 你" = 2 + 1 + 2 + 1 + 2 = 8
    expect(twitterWeightedLength('hi 🔥 你')).toBe(8);
  });

  it('returns 0 for empty string', () => {
    expect(twitterWeightedLength('')).toBe(0);
  });

  it('counts typical roast text (ASCII only) same as length', () => {
    const text = 'your TVL dropped 94% and you tweeting about partnerships';
    expect(twitterWeightedLength(text)).toBe(text.length);
  });

  it('handles text at 280 ASCII chars', () => {
    const text = 'a'.repeat(280);
    expect(twitterWeightedLength(text)).toBe(280);
  });

  it('detects text over limit due to emoji weight', () => {
    // 279 ASCII + 1 emoji (weight 2) = 281 weighted
    const text = 'a'.repeat(279) + '🔥';
    expect(twitterWeightedLength(text)).toBe(281);
  });
});

describe('expandTcoUrlsByPosition', () => {
  it('replaces t.co URLs by position matching', () => {
    const text = 'First https://t.co/aaa second https://t.co/bbb';
    const expanded = ['https://one.com', 'https://two.com'];
    expect(expandTcoUrlsByPosition(text, expanded)).toBe('First https://one.com second https://two.com');
  });

  it('removes media URLs by position', () => {
    const text = 'Image https://t.co/media done';
    const expanded = ['https://pic.twitter.com/xyz'];
    expect(expandTcoUrlsByPosition(text, expanded)).toBe('Image done');
  });

  it('handles more t.co URLs than expanded URLs (stops at available)', () => {
    const text = 'A https://t.co/aaa B https://t.co/bbb';
    const expanded = ['https://only-one.com'];
    expect(expandTcoUrlsByPosition(text, expanded)).toBe('A https://only-one.com B https://t.co/bbb');
  });

  it('returns text unchanged when no expanded URLs', () => {
    expect(expandTcoUrlsByPosition('hello', null)).toBe('hello');
    expect(expandTcoUrlsByPosition('hello', [])).toBe('hello');
  });

  it('returns text unchanged when no t.co URLs in text', () => {
    expect(expandTcoUrlsByPosition('no links here', ['https://one.com'])).toBe('no links here');
  });

  it('handles $ in expanded URLs without special replacement', () => {
    const text = 'Buy https://t.co/abc now';
    expect(expandTcoUrlsByPosition(text, ['https://dex.com/$BEEF'])).toBe('Buy https://dex.com/$BEEF now');
  });

  it('handles http:// (not https) t.co links', () => {
    const text = 'Old link http://t.co/oldlink here';
    expect(expandTcoUrlsByPosition(text, ['https://example.com'])).toBe('Old link https://example.com here');
  });

  it('handles empty text', () => {
    expect(expandTcoUrlsByPosition('', ['https://example.com'])).toBe('');
  });

  it('handles more expanded URLs than t.co URLs (ignores extras)', () => {
    const text = 'Only https://t.co/one here';
    expect(expandTcoUrlsByPosition(text, ['https://one.com', 'https://two.com'])).toBe('Only https://one.com here');
  });
});
