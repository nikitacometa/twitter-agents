import type { JudgePersona, EvaluationResult } from './types.js';

export interface JudgePersonaConfig {
  id: JudgePersona;
  name: string;
  systemPrompt: string;
}

const PERSONAS: Record<JudgePersona, JudgePersonaConfig> = {
  ct_degen: {
    id: 'ct_degen',
    name: 'CT Degen',
    systemPrompt:
      'You are a CT degen with 50K followers who only RTs the most savage takes. ' +
      "You've seen every roast format. You value shareability, meme energy, and viral potential above all. " +
      'A roast that makes you want to screenshot and send to your group chat gets high marks.',
  },
  comedy_writer: {
    id: 'comedy_writer',
    name: 'Comedy Writer',
    systemPrompt:
      "You are a comedy writer who consults for Wendy's Twitter. " +
      'You judge jokes by structure and surprise, not just shock value. ' +
      'Setup-punchline craft, timing, and originality matter most to you. ' +
      'A roast can be savage without being funny — you catch the difference.',
  },
  data_hawk: {
    id: 'data_hawk',
    name: 'Data Hawk',
    systemPrompt:
      'You are a DeFi analyst who fact-checks everything. ' +
      "A roast without a real data point is worthless to you. " +
      'Specificity is king — exact numbers, verifiable claims, surgical precision. ' +
      "Generic insults score low no matter how funny they are.",
  },
};

export function getPersona(id: JudgePersona): JudgePersonaConfig {
  return PERSONAS[id];
}

export function pickJudgePair(): [JudgePersonaConfig, JudgePersonaConfig] {
  const all: JudgePersona[] = ['ct_degen', 'comedy_writer', 'data_hawk'];
  // Fisher-Yates for 3 elements
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [all[i], all[j]] = [all[j]!, all[i]!];
  }
  return [PERSONAS[all[0]!], PERSONAS[all[1]!]];
}

export function buildEvaluationPrompt(
  persona: JudgePersonaConfig,
  targetName: string,
  tweetText: string,
  researchNotes: string | null,
): string {
  return `${persona.systemPrompt}

Evaluate this crypto roast tweet.

Target: "${targetName}"
Roast: "${tweetText}"
${researchNotes ? `Research context: "${researchNotes}"` : 'No research context available.'}

Think through each criterion step-by-step, then score.

## Criteria

1. SAVAGE (1-5): How hard does this hit? Is it genuinely brutal or just mildly snarky?
   1=bland  2=mild  3=solid hit  4=ouch  5=lethal

2. FACTUAL (1-5): Is it grounded in verifiable data/events?
   1=made up  2=vague reference  3=real but common knowledge  4=specific real data  5=surgical data point

3. FUNNY (1-5): Does the setup→punchline land?
   1=not funny  2=smile  3=chuckle  4=laugh  5=screenshot-worthy

4. ORIGINAL (1-5): Would crypto twitter have seen this take before?
   1=cliché  2=slight twist  3=fresh angle  4=novel  5=never seen this

5. SHAREABLE (1-5): Would someone RT this without context?
   1=niche  2=needs context  3=works standalone  4=very shareable  5=viral potential

6. CRYPTO_NATIVE (1-5): Does it sound like CT, not a marketing team?
   1=corporate  2=trying too hard  3=passable  4=native  5=sounds like a degen with data

## Output

Respond with ONLY valid JSON (no markdown, no code fences):
{"reasoning":"2-3 sentences explaining your overall impression","scores":{"savage":N,"factual":N,"funny":N,"original":N,"shareable":N,"crypto_native":N},"composite":N.N,"verdict":"stockpile or discard","one_line_why":"why this works or doesn't in ≤15 words"}

The composite score is the average of all 6 criteria scores, rounded to 1 decimal.
If composite >= 4.0, verdict is "stockpile". Otherwise "discard".`;
}

export function parseEvaluationOutput(raw: string): EvaluationResult {
  // Strip markdown code fences if present
  const cleaned = raw.replace(/^```(?:json)?\s*\n?/m, '').replace(/\n?```\s*$/m, '').trim();

  // Find JSON object in the output
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('No JSON object found in evaluation output');
  }

  const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;

  const scores = parsed['scores'] as Record<string, unknown> | undefined;
  if (!scores || typeof scores !== 'object') {
    throw new Error('Missing or invalid scores object');
  }

  const requiredKeys = ['savage', 'factual', 'funny', 'original', 'shareable', 'crypto_native'] as const;
  for (const key of requiredKeys) {
    if (typeof scores[key] !== 'number') {
      throw new Error(`Missing or non-numeric score: ${key}`);
    }
  }

  const composite = typeof parsed['composite'] === 'number'
    ? parsed['composite']
    : requiredKeys.reduce((sum, k) => sum + (scores[k] as number), 0) / requiredKeys.length;

  return {
    reasoning: typeof parsed['reasoning'] === 'string' ? parsed['reasoning'] : '',
    scores: {
      savage: scores['savage'] as number,
      factual: scores['factual'] as number,
      funny: scores['funny'] as number,
      original: scores['original'] as number,
      shareable: scores['shareable'] as number,
      crypto_native: scores['crypto_native'] as number,
    },
    composite: Math.round(composite * 10) / 10,
    verdict: parsed['verdict'] === 'stockpile' ? 'stockpile' : 'discard',
    one_line_why: typeof parsed['one_line_why'] === 'string' ? parsed['one_line_why'] : '',
  };
}
