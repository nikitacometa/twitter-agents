import { describe, it, expect, vi } from 'vitest';
import {
  extractTaggedHandle,
  classifyMention,
  extractTarget,
  isBareOrSimpleMention,
  shouldSkipThreadMention,
  MentionHandler,
} from './mention-handler.js';
import type { MentionData } from './twitter-client.interface.js';
import type { ITwitterClient } from './twitter-client.interface.js';

describe('extractTaggedHandle', () => {
  const bot = 'BeefThis';

  it.each([
    ['@BeefThis @elonmusk', 'elonmusk'],
    ['@beefthis @SomeUser', 'SomeUser'],
    ['hey @BeefThis check @user1 @user2', 'user1'],
    ['@user @BeefThis', 'user'],
    ['@BeefThis burn them @target', 'target'],
    ['check this @BeefThis @crypto_whale', 'crypto_whale'],
    ['@BeefThis @user123', 'user123'],
    ['@BEEFTHIS @someone', 'someone'],
  ])('extracts handle from "%s" → "%s"', (text, expected) => {
    expect(extractTaggedHandle(text, bot)).toBe(expected);
  });

  it.each([
    ['@BeefThis'],
    ['@BeefThis roast them'],
    ['@BeefThis 🔥'],
    ['@beefthis pls'],
    ['hello world'],
    [''],
  ])('returns null for "%s"', (text) => {
    expect(extractTaggedHandle(text, bot)).toBeNull();
  });
});

describe('classifyMention', () => {
  const bot = 'BeefThis';

  it.each([
    ['@BeefThis roast @solana', 'roast_request'],
    ['@BeefThis burn them', 'roast_request'],
    ['@BeefThis cook @vitalik', 'roast_request'],
    ['@BeefThis destroy this', 'roast_request'],
    ['@BeefThis grill @project', 'roast_request'],
    ['@BeefThis flame on', 'roast_request'],
    ['beef up this project', 'roast_request'],
  ] as const)('classifies "%s" → %s', (text, expected) => {
    expect(classifyMention(text, bot)).toBe(expected);
  });

  it('classifies bare @BeefThis as reply (not roast_request)', () => {
    expect(classifyMention('@BeefThis', bot)).toBe('reply');
    expect(classifyMention('@beefthis', bot)).toBe('reply');
    expect(classifyMention('@BeefThis 🔥', bot)).toBe('reply');
    expect(classifyMention('@BeefThis nice post', bot)).toBe('reply');
  });

  it.each([
    ['@BeefThis that claim is false', 'challenge'],
    ['@BeefThis this is wrong and fake', 'challenge'],
    ['that claim is false', 'challenge'],
    ['this is cap', 'challenge'],
  ] as const)('classifies "%s" → %s', (text, expected) => {
    expect(classifyMention(text, bot)).toBe(expected);
  });

  it('roast keyword takes priority over challenge keyword', () => {
    expect(classifyMention('@BeefThis roast this fake project', bot)).toBe('roast_request');
  });

  it.each([
    ['hello there', 'reply'],
    ['nice post', 'reply'],
    ['', 'reply'],
    ['   ', 'reply'],
  ] as const)('classifies "%s" → %s', (text, expected) => {
    expect(classifyMention(text, bot)).toBe(expected);
  });
});

describe('extractTarget', () => {
  it.each([
    ['@BeefThis roast @vitalik', 'vitalik'],
    ['@BeefThis burn @solana', 'solana'],
    ['destroy @someProject', 'someProject'],
    ['grill @crypto_whale', 'crypto_whale'],
  ])('extracts @handle target from "%s" → "%s"', (text, expected) => {
    expect(extractTarget(text)).toBe(expected);
  });

  it.each([
    ['roast $BEEF', 'BEEF'],
    ['burn $SOL', 'SOL'],
    ['cook $SHIB', 'SHIB'],
  ])('extracts $TOKEN target from "%s" → "%s"', (text, expected) => {
    expect(extractTarget(text)).toBe(expected);
  });

  it.each([
    ['roast Ethereum', 'Ethereum'],
    ['burn Solana', 'Solana'],
    ['destroy Base', 'Base'],
  ])('extracts capitalized project name from "%s" → "%s"', (text, expected) => {
    expect(extractTarget(text)).toBe(expected);
  });

  it.each([
    ['@BeefThis roast them'],
    ['@BeefThis burn 🔥'],
    ['hello world'],
    ['roast it'],
    ['roast AB'],
    [''],
  ])('returns null for "%s"', (text) => {
    expect(extractTarget(text)).toBeNull();
  });
});

describe('isBareOrSimpleMention', () => {
  it.each([
    ['@BeefThis', true],
    ['@BeefThis 🔥', true],
    ['@BeefThis pls', true],
    ['@BeefThis do it', true],
    ['@BeefThis @user', true],
    ['@BeefThis please roast someone for me', false],
    ['@BeefThis I think this project is a scam and should be investigated', false],
  ])('"%s" → %s', (text, expected) => {
    expect(isBareOrSimpleMention(text)).toBe(expected);
  });
});

describe('shouldSkipThreadMention', () => {
  const bot = '0xBeefer';

  function mention(overrides: Partial<MentionData> = {}): MentionData {
    return {
      tweetId: '200',
      authorId: 'u1',
      authorName: 'JohnnyCash',
      text: '@0xBeefer hey whats up',
      inReplyToTweetId: '100',
      conversationId: 'conv1',
      ...overrides,
    };
  }

  it('never skips top-level mentions (no inReplyToTweetId)', () => {
    const m = mention({ inReplyToTweetId: undefined });
    expect(shouldSkipThreadMention(m, 'reply', bot, true)).toBe(false);
  });

  it('does not skip reply in fresh thread (no prior bot reply, not replying to bot)', () => {
    const m = mention({ parentAuthorName: 'SomeOtherUser' });
    expect(shouldSkipThreadMention(m, 'reply', bot, false)).toBe(false);
  });

  it('skips thread chatter when bot already replied in conversation', () => {
    const m = mention({ parentAuthorName: 'SomeOtherUser' });
    expect(shouldSkipThreadMention(m, 'reply', bot, true)).toBe(true);
  });

  it('allows reply to bot tweet — direct engagement (even without conversation dedup)', () => {
    const m = mention({ parentAuthorName: '0xBeefer' });
    expect(shouldSkipThreadMention(m, 'reply', bot, false)).toBe(false);
  });

  it('allows reply to bot tweet — case-insensitive', () => {
    const m = mention({ parentAuthorName: '0XBEEFER' });
    expect(shouldSkipThreadMention(m, 'reply', bot, false)).toBe(false);
  });

  it('allows explicit "roast @target" even in existing thread', () => {
    const m = mention({ text: '@0xBeefer roast @vitalik' });
    expect(shouldSkipThreadMention(m, 'roast_request', bot, true)).toBe(false);
  });

  it('allows explicit "roast $TOKEN" even in existing thread', () => {
    const m = mention({ text: '@0xBeefer roast $SOL' });
    expect(shouldSkipThreadMention(m, 'roast_request', bot, true)).toBe(false);
  });

  it('allows "roast me" even in existing thread', () => {
    const m = mention({ text: '@0xBeefer roast me bro' });
    expect(shouldSkipThreadMention(m, 'roast_request', bot, true)).toBe(false);
  });

  it('skips vague roast keyword in existing thread (no target)', () => {
    const m = mention({ text: '@0xBeefer burn them' });
    expect(shouldSkipThreadMention(m, 'roast_request', bot, true)).toBe(true);
  });

  it('allows challenge in existing thread (accountability layer)', () => {
    const m = mention({ text: '@0xBeefer thats false' });
    expect(shouldSkipThreadMention(m, 'challenge', bot, true)).toBe(false);
  });

  it('allows reply to bot even when conversation dedup is true (direct engagement)', () => {
    const m = mention({ parentAuthorName: '0xBeefer' });
    expect(shouldSkipThreadMention(m, 'reply', bot, true)).toBe(false);
  });
});

describe('MentionHandler reply_to target (regression: must reply to mention tweet, not parent)', () => {
  const BOT = '0xBeefer';

  // Capture enqueued context strings to verify reply_to targets
  function buildHandler(mentions: MentionData[]) {
    const enqueuedContexts: string[] = [];

    const twitter = {
      isConfigured: true,
      getMentions: vi.fn().mockResolvedValue(mentions),
    } as unknown as ITwitterClient;

    const mentionRepo = {
      exists: vi.fn().mockReturnValue(false),
      insert: vi.fn(),
    };

    const userRepo = { upsert: vi.fn(), incrementInteraction: vi.fn() };

    const configRepo = {
      getRuntime: vi.fn().mockReturnValue({ mentionSinceId: null }),
      setMentionSinceId: vi.fn(),
    };

    const queueRepo = {
      enqueue: vi.fn().mockImplementation((item: { context?: string }) => {
        if (item.context) enqueuedContexts.push(item.context);
        return 1;
      }),
    };

    const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };

    const handler = new MentionHandler({
      twitter,
      mentionRepo: mentionRepo as never,
      userRepo: userRepo as never,
      configRepo: configRepo as never,
      queueRepo: queueRepo as never,
      logger: logger as never,
      botUsername: BOT,
    });

    return { handler, enqueuedContexts };
  }

  it('handle roast: reply_to = mention tweet, not parent tweet', async () => {
    // User replies to some third party's tweet and tags "@0xBeefer @elonmusk"
    const { handler, enqueuedContexts } = buildHandler([{
      tweetId: '200',         // the mention tweet
      authorId: 'u1',
      authorName: 'SomeUser',
      text: '@0xBeefer @elonmusk',
      inReplyToTweetId: '100', // parent tweet (NOT the target)
      parentAuthorName: 'ThirdParty',
    }]);

    await handler.poll();
    expect(enqueuedContexts).toHaveLength(1);
    expect(enqueuedContexts[0]).toMatch(/^reply_to:200\|/);
  });

  it('explicit "roast @X": reply_to = mention tweet, not parent tweet', async () => {
    const { handler, enqueuedContexts } = buildHandler([{
      tweetId: '300',
      authorId: 'u2',
      authorName: 'Requester',
      text: '@0xBeefer roast @vitalik',
      inReplyToTweetId: '100',
      parentAuthorName: 'ThirdParty',
    }]);

    await handler.poll();
    expect(enqueuedContexts).toHaveLength(1);
    expect(enqueuedContexts[0]).toMatch(/^reply_to:300\|/);
  });

  it('parent tweet roast (Scenario 2): reply_to = parent tweet (correct)', async () => {
    // Bare "@0xBeefer" under someone's tweet → should reply to parent
    const { handler, enqueuedContexts } = buildHandler([{
      tweetId: '400',
      authorId: 'u3',
      authorName: 'AskingUser',
      text: '@0xBeefer',
      inReplyToTweetId: '100',
      parentAuthorName: 'TargetAuthor',
      parentTweetText: 'My portfolio is up 10000%',
    }]);

    await handler.poll();
    expect(enqueuedContexts).toHaveLength(1);
    expect(enqueuedContexts[0]).toMatch(/^reply_to:100\|/);
  });

  it('casual reply: reply_to = mention tweet', async () => {
    // Standalone mention with no roast keyword and no tagged handle
    const { handler, enqueuedContexts } = buildHandler([{
      tweetId: '500',
      authorId: 'u4',
      authorName: 'RandomUser',
      text: '@0xBeefer hey nice work today bro keep it up',
    }]);

    await handler.poll();
    expect(enqueuedContexts).toHaveLength(1);
    expect(enqueuedContexts[0]).toMatch(/^reply_to:500\|/);
  });
});
