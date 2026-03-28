// Humor strategies for meme-farm pipeline.
// Each strategy forces a distinct comedic angle, guaranteeing diverse output.

export type MemeStrategyId =
  | 'quote_flip'
  | 'hypocrisy_reveal'
  | 'absurd_extrapolation'
  | 'understatement'
  | 'self_own'
  | 'comparison'
  | 'ratio_commentary'
  | 'cultural_mashup';

export interface MemeStrategy {
  id: MemeStrategyId;
  name: string;
  weight: number;
  instruction: string;
  example: string;
  /** Template IDs from MEME_TEMPLATES that work best with this strategy. */
  compatibleTemplates: string[];
  tone: string;
}

// ─── Strategy Definitions ────────────────────────────────────────────────────

export const MEME_STRATEGIES: MemeStrategy[] = [
  {
    id: 'quote_flip',
    name: 'Quote Flip',
    weight: 2.5,
    instruction: [
      'Use their actual words from the tweet against them.',
      'The setup quotes exactly what they said; the punchline reveals why the quote is self-incriminating, ironic, or absurd in context.',
      'The best quote flips need zero explanation — the contradiction between their words and reality IS the joke.',
    ].join(' '),
    example: 'They tweeted "decentralization is our core value" → Batman Slapping Robin: "but they said decentrali—" / "IT HAS 3 ADMIN KEYS"',
    compatibleTemplates: ['438680', '188390779', '252600902', '129242436', '178591752'],
    tone: 'confrontational, hypocrisy-exposing',
  },
  {
    id: 'hypocrisy_reveal',
    name: 'Hypocrisy Reveal',
    weight: 2.2,
    instruction: [
      'Show the gap between what they say publicly and what they do.',
      'Find the contradiction between this tweet\'s claim and known behavior, past statements, or on-chain reality.',
      'Present the two faces side-by-side — let the audience connect the dots.',
    ].join(' '),
    example: 'Claims "transparency always" → Drake: rejecting "publishing financials" / choosing "vibes update thread"',
    compatibleTemplates: ['181913649', '309868304', '178591752', '180190441', '252600902'],
    tone: 'exposé, receipts-dropping',
  },
  {
    id: 'absurd_extrapolation',
    name: 'Absurd Extrapolation',
    weight: 1.5,
    instruction: [
      'Take their logic to its ridiculous but mathematically valid conclusion.',
      'If X at current rate, then Y in Z time. Galaxy-brain the math until it collapses under its own weight.',
      'The humor comes from the logic being technically correct but obviously insane.',
    ].join(' '),
    example: '"Can\'t rug the community if you already rugged them twice" — Roll Safe tapping forehead',
    compatibleTemplates: ['89370399', '226297822', '217743513', '87743020', '161865971'],
    tone: 'galaxy-brain, technically-true',
  },
  {
    id: 'understatement',
    name: 'Understatement',
    weight: 1.2,
    instruction: [
      'Describe the catastrophic thing with maximum calm.',
      'The contrast between the disaster and the understated reaction IS the joke.',
      'Use "This Is Fine" energy — acknowledge the fire while sipping coffee.',
    ].join(' '),
    example: '$18B TVL to $0 in 72 hours → This Is Fine: "TVL evaporating in 72 hours" / "the algo stablecoin is working as designed"',
    compatibleTemplates: ['55311130', '27813981', '89370399', '161865971'],
    tone: 'denial, copium, dark calm',
  },
  {
    id: 'self_own',
    name: 'Self Own',
    weight: 1.0,
    instruction: [
      'Frame it as if THEY are accidentally revealing something embarrassing about themselves.',
      'Their own tweet/behavior is the confession — you just highlight what they didn\'t mean to say.',
      'Disaster Girl energy: they look pleased at the chaos they caused.',
    ].join(' '),
    example: 'Founder bragging about "community first" → Disaster Girl: the community burning in the background',
    compatibleTemplates: ['97984', '259237855', '222403160', '188390779'],
    tone: 'schadenfreude, smugness',
  },
  {
    id: 'comparison',
    name: 'Comparison',
    weight: 1.0,
    instruction: [
      'Find something the target resembles that is far less glamorous.',
      'The comparison recontextualizes their self-image into something mundane or embarrassing.',
      'Use Drake or Same Picture to put the two things side by side.',
    ].join(' '),
    example: 'Drake rejecting: "auditing smart contracts" / choosing: "aping based on a CT thread"',
    compatibleTemplates: ['181913649', '180190441', '112126428', '178591752', '309668311', '135256802'],
    tone: 'dismissive, reframing',
  },
  {
    id: 'ratio_commentary',
    name: 'Ratio Commentary',
    weight: 0.8,
    instruction: [
      'Comment on the engagement, follower count, market data, or any ratio that reveals something embarrassing.',
      'The gap between claimed importance and actual signal IS the punchline.',
      'Use specific numbers — "$47B mcap, $149K revenue" hits harder than "bad fundamentals".',
    ].join(' '),
    example: 'Change My Mind: "$47B mcap, $149K revenue. change my mind"',
    compatibleTemplates: ['129242436', '100777631', '252600902', '222403160'],
    tone: 'data-driven, provocative',
  },
  {
    id: 'cultural_mashup',
    name: 'Cultural Mashup',
    weight: 0.8,
    instruction: [
      'Reframe their crypto situation using a wildly unrelated cultural reference — sports, movies, food, historical events.',
      'The cognitive distance between the reference and the crypto context IS the laugh.',
      'Distracted Boyfriend is perfect: VC = boyfriend, "AI tokens" = other woman, "their portfolio" = girlfriend.',
    ].join(' '),
    example: 'Distracted Boyfriend: VC looking at "AI tokens" while "their DeFi portfolio" looks disgusted',
    compatibleTemplates: ['112126428', '124822590', '79132341', '226297822', '87743020'],
    tone: 'surreal, unexpected',
  },
];

// ─── Weighted Selection ──────────────────────────────────────────────────────

/**
 * Pick `count` strategies using Efraimidis-Spirakis weighted sampling.
 * When count > 8, wraps around with reshuffled weights.
 */
export function pickStrategies(count: number): MemeStrategy[] {
  if (count <= 0) return [];

  const result: MemeStrategy[] = [];
  const rounds = Math.ceil(count / MEME_STRATEGIES.length);

  for (let round = 0; round < rounds; round++) {
    const remaining = count - result.length;
    if (remaining <= 0) break;

    const take = Math.min(remaining, MEME_STRATEGIES.length);
    const keyed = MEME_STRATEGIES.map((s) => ({
      strategy: s,
      key: Math.random() ** (1 / s.weight),
    }));

    keyed.sort((a, b) => b.key - a.key);
    result.push(...keyed.slice(0, take).map((k) => k.strategy));
  }

  return result;
}
