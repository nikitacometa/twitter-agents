const MAX_TWEET_LENGTH = 280;

const BANNED_WORDS = [
  // Slurs and hate speech
  'nigger', 'nigga', 'faggot', 'retard', 'retarded', 'kys',
  // Threats / violence
  'kill yourself', 'i will kill', 'bomb threat', 'shoot up',
  // Doxxing
  'home address', 'phone number', 'real name is',
  // Sexual
  'porn', 'onlyfans',
];

const FINANCIAL_ADVICE_PATTERNS = [
  /\bbuy\s+(?:now|this|the dip)\b/i,
  /\bsell\s+(?:now|everything|your)\b/i,
  /\bnot\s+financial\s+advice\b/i,
  /\b(?:nfa|dyor)\b/i,
  /\bguaranteed\s+(?:returns?|profit|gains?)\b/i,
  /\byou\s+should\s+(?:invest|buy|sell|hold)\b/i,
  /\bfinancial\s+advice\b/i,
];

const TICKER_SPAM_PATTERN = /(\$[A-Z]{2,10})\b[\s\S]*?\1\b[\s\S]*?\1\b/i;

const SELF_HARM_PATTERNS = [
  /\bsuicid/i,
  /\bself[- ]harm/i,
  /\bend\s+(?:it|your\s+life)\b/i,
];

const PERSONAL_ATTACK_PATTERNS = [
  /\b(?:his|her|their)\s+(?:wife|husband|kids?|children|family|mother|father)\b/i,
  /\b(?:mental\s+health|depression|anxiety)\b/i,
];

export interface FilterResult {
  passed: boolean;
  reasons: string[];
}

export function filterRoast(text: string): FilterResult {
  const reasons: string[] = [];
  const lower = text.toLowerCase();

  // Length check
  if (text.length > MAX_TWEET_LENGTH) {
    reasons.push(`exceeds ${String(MAX_TWEET_LENGTH)} chars (${String(text.length)})`);
  }

  if (text.length === 0) {
    reasons.push('empty text');
  }

  // Banned words
  for (const word of BANNED_WORDS) {
    if (lower.includes(word)) {
      reasons.push(`banned word: "${word}"`);
      break;
    }
  }

  // Financial advice
  for (const pattern of FINANCIAL_ADVICE_PATTERNS) {
    if (pattern.test(text)) {
      reasons.push('contains financial advice pattern');
      break;
    }
  }

  // Ticker spam ($BEEF $BEEF $BEEF)
  if (TICKER_SPAM_PATTERN.test(text)) {
    reasons.push('ticker spam (same ticker 3+ times)');
  }

  // Self-harm references
  for (const pattern of SELF_HARM_PATTERNS) {
    if (pattern.test(text)) {
      reasons.push('self-harm reference');
      break;
    }
  }

  // Personal attacks (family, mental health)
  for (const pattern of PERSONAL_ATTACK_PATTERNS) {
    if (pattern.test(text)) {
      reasons.push('personal attack pattern');
      break;
    }
  }

  // Starts with @mention (bot rule: never start with @)
  if (text.startsWith('@')) {
    reasons.push('starts with @mention');
  }

  // More than 2 sentences (rough heuristic: count periods/exclamation/question marks)
  const sentenceEnders = text.match(/[.!?]+(?:\s|$)/g);
  if (sentenceEnders && sentenceEnders.length > 3) {
    reasons.push('likely more than 2 sentences');
  }

  return {
    passed: reasons.length === 0,
    reasons,
  };
}

export function filterRoasts(texts: string[]): Array<{ text: string; filter: FilterResult }> {
  return texts.map((text) => ({ text, filter: filterRoast(text) }));
}
