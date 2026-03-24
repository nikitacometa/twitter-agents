import { describe, it, expect } from 'vitest';
import {
  extractReplyToId,
  extractHandleFromContext,
  extractParentAuthorFromTarget,
  extractMediaUrls,
  extractTriggerText,
  extractHandleFromTarget,
  extractMentionTweetId,
  extractConversationId,
  extractParentTweetId,
  parseTweetUrl,
  isTweetUrl,
} from './queue-manager.js';

describe('extractReplyToId', () => {
  it.each([
    ['reply_to:123456789|by:@user', '123456789'],
    ['reply_to:999|by:@a|handle:@b', '999'],
    ['reply_to:1', '1'],
  ])('extracts id from "%s" → "%s"', (ctx, expected) => {
    expect(extractReplyToId(ctx)).toBe(expected);
  });

  it.each([
    [null],
    [''],
    ['no_reply_to_here'],
    ['by:@user|reply_to:123'],
  ])('returns undefined for %s', (ctx) => {
    expect(extractReplyToId(ctx)).toBeUndefined();
  });
});

describe('extractHandleFromContext', () => {
  it.each([
    ['reply_to:1|by:@user|handle:@elonmusk', 'elonmusk'],
    ['reply_to:1|by:@a|handle:@user_123', 'user_123'],
  ])('extracts handle from "%s" → "%s"', (ctx, expected) => {
    expect(extractHandleFromContext(ctx)).toBe(expected);
  });

  it.each([
    [null],
    [''],
    ['reply_to:1|by:@user'],
    ['reply_to:1|by:@user|parent:456'],
  ])('returns undefined for %s', (ctx) => {
    expect(extractHandleFromContext(ctx)).toBeUndefined();
  });
});

describe('extractParentAuthorFromTarget', () => {
  it.each([
    ['tweet by @solana: "they launched again"', 'solana'],
    ['tweet by @vitalik', 'vitalik'],
    ['tweet by @user_name: "text"', 'user_name'],
  ])('extracts author from "%s" → "%s"', (target, expected) => {
    expect(extractParentAuthorFromTarget(target)).toBe(expected);
  });

  it.each([
    ['@elonmusk'],
    ['Ethereum'],
    ['$SOL'],
    [''],
  ])('returns undefined for "%s"', (target) => {
    expect(extractParentAuthorFromTarget(target)).toBeUndefined();
  });
});

describe('extractMediaUrls', () => {
  it('extracts single URL', () => {
    expect(extractMediaUrls('reply_to:1|by:@a|media:https://pbs.twimg.com/a.jpg'))
      .toEqual(['https://pbs.twimg.com/a.jpg']);
  });

  it('extracts multiple URLs', () => {
    expect(extractMediaUrls('reply_to:1|by:@a|media:https://a.com/1.jpg,https://b.com/2.jpg'))
      .toEqual(['https://a.com/1.jpg', 'https://b.com/2.jpg']);
  });

  it('filters non-http entries', () => {
    expect(extractMediaUrls('reply_to:1|media:https://a.com/1.jpg,notaurl,https://b.com/2.jpg'))
      .toEqual(['https://a.com/1.jpg', 'https://b.com/2.jpg']);
  });

  it.each([
    [null],
    [''],
    ['reply_to:1|by:@user'],
    ['reply_to:1|media:'],
  ])('returns empty array for %s', (ctx) => {
    expect(extractMediaUrls(ctx)).toEqual([]);
  });
});

describe('extractTriggerText', () => {
  it.each([
    ['reply_to:1|by:@user|text:hello world', 'hello world'],
    ['reply_to:1|by:@user|text:@0xBeefer what is this', '@0xBeefer what is this'],
    ['reply_to:1|by:@user|text:short', 'short'],
  ])('extracts text from "%s"', (ctx, expected) => {
    expect(extractTriggerText(ctx)).toBe(expected);
  });

  it('preserves pipe characters in user text (text: is always last segment)', () => {
    expect(extractTriggerText('reply_to:1|text:this | that')).toBe('this | that');
  });

  it.each([
    [null],
    [''],
    ['reply_to:1|by:@user'],
  ])('returns undefined for %s', (ctx) => {
    expect(extractTriggerText(ctx)).toBeUndefined();
  });
});

describe('extractHandleFromTarget', () => {
  it.each([
    ['@elonmusk', 'elonmusk'],
    ['@vitalik', 'vitalik'],
    ['@user_123', 'user_123'],
  ])('extracts handle from @-prefixed "%s" → "%s"', (target, expected) => {
    expect(extractHandleFromTarget(target)).toBe(expected);
  });

  it.each([
    ['solana', 'solana'],
    ['vitalik', 'vitalik'],
    ['abc', 'abc'],
    ['user_name_long', 'user_name_long'],
  ])('extracts plain word handle from "%s" → "%s"', (target, expected) => {
    expect(extractHandleFromTarget(target)).toBe(expected);
  });

  it.each([
    ['tweet by @solana: "launched again"'],
    ['Ethereum is a blockchain'],
    ['$SOL'],
    ['ab'],
    [''],
    ['this has spaces'],
    ['a'.repeat(16)],
  ])('returns undefined for "%s"', (target) => {
    expect(extractHandleFromTarget(target)).toBeUndefined();
  });
});

describe('parseTweetUrl', () => {
  it.each([
    ['https://x.com/elonmusk/status/1234567890', '1234567890'],
    ['https://twitter.com/vitalik/status/999', '999'],
    ['https://x.com/user_123/status/1', '1'],
    ['http://x.com/a/status/111', '111'],
    ['x.com/user/status/555', '555'],
    ['twitter.com/user/status/777', '777'],
    ['check this https://x.com/abc/status/42 please', '42'],
  ])('extracts id from "%s" → "%s"', (input, expected) => {
    expect(parseTweetUrl(input)).toBe(expected);
  });

  it.each([
    [''],
    ['https://x.com/user/likes'],
    ['https://example.com/user/status/123'],
    ['just some random text'],
    ['https://x.com/user/status/'],
    ['https://x.com/user/status/abc'],
  ])('returns null for "%s"', (input) => {
    expect(parseTweetUrl(input)).toBeNull();
  });
});

describe('isTweetUrl', () => {
  it.each([
    'https://x.com/user/status/123',
    'https://twitter.com/user/status/456',
    'http://x.com/user/status/789',
    'x.com/user/status/111',
    'twitter.com/user/status/222',
  ])('returns true for "%s"', (input) => {
    expect(isTweetUrl(input)).toBe(true);
  });

  it.each([
    '',
    'hello world',
    'https://example.com/user/status/123',
    'check this https://x.com/user/status/123',
    'x.com/user/likes',
  ])('returns false for "%s"', (input) => {
    expect(isTweetUrl(input)).toBe(false);
  });
});

describe('extractParentTweetId', () => {
  it.each([
    ['reply_to:1|by:@user|parent:555666777', '555666777'],
    ['reply_to:1|by:@a|mention:1|parent:999|media:https://a.com', '999'],
    ['reply_to:1|by:@a|parent:42|handle:@x', '42'],
  ])('extracts parent tweet id from "%s" → "%s"', (ctx, expected) => {
    expect(extractParentTweetId(ctx)).toBe(expected);
  });

  it.each([
    [null],
    [''],
    ['reply_to:1|by:@user'],
    ['reply_to:1|by:@user|mention:123'],
    ['parent:123'],
  ])('returns undefined for %s', (ctx) => {
    expect(extractParentTweetId(ctx)).toBeUndefined();
  });
});

describe('extractMentionTweetId', () => {
  it.each([
    ['reply_to:1|by:@user|mention:999888777', '999888777'],
    ['reply_to:1|mention:123|handle:@x', '123'],
    ['reply_to:1|by:@a|mention:1', '1'],
  ])('extracts mention tweet id from "%s" → "%s"', (ctx, expected) => {
    expect(extractMentionTweetId(ctx)).toBe(expected);
  });

  it.each([
    [null],
    [''],
    ['reply_to:1|by:@user'],
    ['mention:123'],
  ])('returns undefined for %s', (ctx) => {
    expect(extractMentionTweetId(ctx)).toBeUndefined();
  });
});

describe('extractConversationId', () => {
  it.each([
    ['reply_to:1|by:@user|conversation:999888777', '999888777'],
    ['reply_to:1|mention:123|conversation:456', '456'],
    ['reply_to:1|by:@a|text:hello|conversation:1', '1'],
  ])('extracts conversation id from "%s" → "%s"', (ctx, expected) => {
    expect(extractConversationId(ctx)).toBe(expected);
  });

  it.each([
    [null],
    [''],
    ['reply_to:1|by:@user'],
    ['conversation:123'],
  ])('returns undefined for %s', (ctx) => {
    expect(extractConversationId(ctx)).toBeUndefined();
  });
});
