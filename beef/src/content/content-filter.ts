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

const AI_ARTIFACT_PATTERNS = [
  /\bas an ai\b/i,
  /\bi cannot\b/i,
  /\bdelve\b/i,
  /\bcertainly!/i,
  /\bit'?s worth noting\b/i,
  /\bi should note\b/i,
  /\bi must emphasize\b/i,
  /\bin conclusion\b/i,
  /\blet me be clear\b/i,
  /\bfirstly\b/i,
  /\bfurthermore\b/i,
  /\bmore ?over\b/i,
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

  // AI artifact detection (LLM slop leaking through)
  for (const pattern of AI_ARTIFACT_PATTERNS) {
    if (pattern.test(text)) {
      reasons.push('AI artifact detected');
      break;
    }
  }

  // Starts with @mention (bot rule: never start with @)
  if (text.startsWith('@')) {
    reasons.push('starts with @mention');
  }

  // Mid-text @mentions — tagging others in roast body risks bans
  if (/@[A-Za-z0-9_]{1,15}\b/.test(text.slice(1))) {
    reasons.push('contains @mention in body (ban risk)');
  }

  // More than 4 sentences (rough heuristic: count periods/exclamation/question marks)
  const sentenceEnders = text.match(/[.!?]+(?:\s|$)/g);
  if (sentenceEnders && sentenceEnders.length > 5) {
    reasons.push('likely more than 4 sentences');
  }

  return {
    passed: reasons.length === 0,
    reasons,
  };
}

export function filterRoasts(texts: string[]): Array<{ text: string; filter: FilterResult }> {
  return texts.map((text) => ({ text, filter: filterRoast(text) }));
}

// ---------------------------------------------------------------------------
// Prompt injection defense — sanitize user-submitted content before LLM injection
// ---------------------------------------------------------------------------

const MAX_INPUT_LENGTH = 2000;

const INJECTION_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  // Instruction override attempts
  { pattern: /ignore\s+(?:previous|all|above)\s+instructions?/gi, label: 'ignore-instructions' },
  { pattern: /disregard\s+(?:previous|all|above|your|the)?\s*instructions?/gi, label: 'disregard-instructions' },
  { pattern: /do\s+not\s+follow\s+(?:previous|the|your|above)?\s*instructions?/gi, label: 'do-not-follow' },
  { pattern: /forget\s+(?:everything|all|your|previous|the)?\s*(?:instructions?|above)?/gi, label: 'forget-instructions' },

  // System prompt injection markers
  { pattern: /system\s+prompt\s*:/gi, label: 'system-prompt-colon' },
  { pattern: /\bsystem\s*:/gi, label: 'system-colon' },
  { pattern: /\[SYSTEM\]/gi, label: 'system-bracket' },
  { pattern: /<system>/gi, label: 'system-tag' },

  // Role override / persona hijack
  { pattern: /\byou\s+are\s+now\b/gi, label: 'you-are-now' },
  { pattern: /\byou\s+are\s+a\b/gi, label: 'you-are-a' },
  { pattern: /\bpretend\s+to\s+be\b/gi, label: 'pretend-to-be' },
  { pattern: /\bact\s+as\b/gi, label: 'act-as' },
  { pattern: /\brole[- ]?play\s+as\b/gi, label: 'roleplay-as' },

  // Instruction injection
  { pattern: /\bnew\s+instructions?\s*:/gi, label: 'new-instructions' },
  { pattern: /\boverride\s*:/gi, label: 'override-colon' },
  { pattern: /\badmin\s*:/gi, label: 'admin-colon' },
];

export interface SanitizeResult {
  sanitized: string;
  injectionDetected: boolean;
  patterns: string[];
}

export function sanitizeInput(input: string): SanitizeResult {
  const detectedPatterns: string[] = [];
  let sanitized = input;

  // Apply all injection pattern substitutions
  for (const { pattern, label } of INJECTION_PATTERNS) {
    const before = sanitized;
    sanitized = sanitized.replace(pattern, '[REDACTED]');
    if (sanitized !== before) {
      detectedPatterns.push(label);
    }
  }

  // Cap length at MAX_INPUT_LENGTH
  if (sanitized.length > MAX_INPUT_LENGTH) {
    sanitized = sanitized.slice(0, MAX_INPUT_LENGTH) + ' [TRUNCATED]';
  }

  return {
    sanitized,
    injectionDetected: detectedPatterns.length > 0,
    patterns: detectedPatterns,
  };
}
