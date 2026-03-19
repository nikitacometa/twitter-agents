import { describe, it, expect } from 'vitest';
import { extractTaggedHandle, classifyMention, extractTarget, isBareOrSimpleMention } from './mention-handler.js';

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
