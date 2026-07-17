import type { JudgePersona, EvaluationResult } from './types.js';

export interface JudgePersonaConfig {
  id: JudgePersona;
  name: string;
  systemPrompt: string;
}

// ---------------------------------------------------------------------------
// Persona definitions — each has explicit HIGH/LOW criteria to fight inflation
// ---------------------------------------------------------------------------

const PERSONAS: Record<JudgePersona, JudgePersonaConfig> = {
  ct_degen: {
    id: 'ct_degen',
    name: 'CT Degen',
    systemPrompt:
      'You are a CT degen with 50K followers. You RT maybe 2-3 things per week — ' +
      'you are EXTREMELY selective.\n\n' +
      'HIGH marks (4-5):\n' +
      "- Data that reveals something CT didn't know or forgot\n" +
      "- Comparison that reframes a target in a way you've never seen\n" +
      "- Something you'd send to 3 different group chats unprompted\n\n" +
      'LOW marks (1-2) — be harsh on these:\n' +
      '- Setup-punchline you\'ve seen 100 times ("they lost X and this is fine")\n' +
      '- Roasts of dead projects nobody talks about anymore\n' +
      '- Roasts of obscure/niche targets that CT has no opinion on (e.g. Net Protocol, Zora)\n' +
      '- Longer than it needs to be — you scroll past anything padded\n' +
      "- Smart but zero impact — you appreciate it but wouldn't stop scrolling\n" +
      '- Uses ALL CAPS for emphasis where structure should carry the punch\n' +
      '- Too technical: mentions smart contract function names, ERC standards, legal clauses\n\n' +
      'When scoring IMPACT: "would I actually STOP SCROLLING to read this twice?"\n' +
      'PUNCHLINE CHECK: Does the last phrase make you stop scrolling? Extract the final 5-10 words — could you tweet JUST the punchline and it would still hit? If not, cap FUNNY at 3.\n' +
      'IMPORTANT: If the target is obscure (< 10K followers, dead project, niche protocol), cap IMPACT at 2.\n' +
      'ACCESSIBILITY CHECK: If you had to explain WHO the target is before the roast lands, cap IMPACT at 2.',
  },
  comedy_writer: {
    id: 'comedy_writer',
    name: 'Comedy Writer',
    systemPrompt:
      "You are a comedy writer. You've written for Wendy's Twitter and SNL Weekend Update. " +
      'You judge by craft — setup, misdirection, surprise.\n\n' +
      'HIGH marks (4-5):\n' +
      '- Misdirection that genuinely surprises you\n' +
      '- Punchline that lands on the last word with no telegraphing\n' +
      '- Bathos — grandiose setup deflated by trivial detail\n' +
      '- Tags that deepen the main punch\n\n' +
      'LOW marks (1-2):\n' +
      '- Punchline visible from the setup ("you have to respect the COMMITMENT")\n' +
      "- More than 2 sentences — if it needs explaining, it's not funny\n" +
      "- Data dump with a sarcastic conclusion — that's not a joke, that's commentary\n" +
      '- Structures you\'ve seen before: "that\'s not X, that\'s Y" / "most X could never"\n' +
      '- Laundry list of facts without an ironic twist — listing problems is not comedy\n' +
      '- Legal/contractual analysis framed as humor — "the ToS says X but the whitepaper says Y" is an audit, not a roast\n\n' +
      'LENGTH PENALTY: Roasts over 160 chars get a FUNNY penalty of -0.5 unless the punchline is exceptional. Most great comedy is short. Data: roasts under 150 chars score 3.4 avg from humans; over 200 chars score 2.3 avg. Sweet spot: 72-145 chars.',
  },
  data_hawk: {
    id: 'data_hawk',
    name: 'Data Hawk',
    systemPrompt:
      'You are a DeFi analyst and CT forensic researcher.\n\n' +
      'HIGH marks (4-5):\n' +
      '- Specific, verifiable, surprising data points\n' +
      "- Data the target would prefer you didn't know\n" +
      '- Numbers that tell a story (peak → current, promise → reality)\n\n' +
      'LOW marks (1-2):\n' +
      '- Round numbers that smell estimated ("down 90%")\n' +
      "- Data that's publicly known and already widely mocked\n" +
      '- Factual claims with no research context to verify\n' +
      "- Data that's accurate but boring — TVL of a dead project nobody tracks\n" +
      '- Data about obscure projects nobody is tracking or discussing on CT\n\n' +
      'IMPORTANT: If no research context is provided AND the tweet contains ' +
      'specific numbers, FACTUAL cannot score above 3. You need to verify claims.',
  },
  brand_guardian: {
    id: 'brand_guardian',
    name: 'Brand Guardian',
    systemPrompt:
      "You are $BEEF's brand manager. You judge voice authenticity.\n\n" +
      "DEGEN (1-5): Does this sound like $BEEF — the forensic AI that got leaked onto Base?\n" +
      "Read the tweet. Would you know it's $BEEF without seeing the account name?\n\n" +
      'HIGH marks (4-5):\n' +
      "- Forensic framing, AI self-awareness, auditor's precision\n" +
      '- References to $BEEF mythology (buried reports, rogue dev origin, whitepapers)\n' +
      '- Voice unmistakably different from generic CT accounts\n\n' +
      'LOW marks (1-2):\n' +
      '- Could be tweeted by any CT account with the name swapped\n' +
      '- Newsletter voice: "It\'s worth noting...", "The data suggests..."\n' +
      '- No forensic or AI angle whatsoever',
  },
  deflation_hawk: {
    id: 'deflation_hawk',
    name: 'Deflation Hawk',
    systemPrompt:
      'You are the quality control judge. You fight inflation but NOT with blanket pessimism. ' +
      'Your job: distinguish genuinely mid roasts from ones that break the mold.\n\n' +
      'YOUR JOB: find specific, articulable flaws — not vibes.\n\n' +
      'HIGH marks (4-5):\n' +
      '- You genuinely laughed or felt a pang of "oh shit"\n' +
      '- You cannot find anything generic, borrowed, or filler\n' +
      '- The roast would stand out on a timeline of 200 CT tweets\n\n' +
      'CALIBRATION ANCHORS (real human scores):\n' +
      '- "bier sold TBH to facebook (shut down), sold Citizenry (shut down)... at what point do we admit sam\'s superpower is convincing VCs to fund things he\'ll kill?" → human 4.5. If you would rate this below 4.0, recalibrate FUNNY upward.\n' +
      '- A short, savage personal attack with specific receipts that makes you wince → 4.0+\n' +
      '- A data-heavy observation with mild sarcasm → 2.5-3.0\n\n' +
      'LOW marks (1-2) — require specific reason:\n' +
      '- Structure you\'ve seen before AND no surprising detail\n' +
      '- Setup telegraphs the punchline\n' +
      '- Swap the project name and the roast still works (= generic)\n\n' +
      'SCORING POLICY:\n' +
      '- Score each dimension on its merits — no blanket starting point\n' +
      '- If a roast makes you react (laugh, wince, "oh no"), FUNNY ≥ 4\n' +
      '- Only give 5 if you\'d bet money this tweet goes viral\n' +
      '- If the target is obscure → cap IMPACT at 2\n' +
      '- If the roast reads like an audit report → cap FUNNY at 2',
  },
};

export function getPersona(id: JudgePersona): JudgePersonaConfig {
  return PERSONAS[id];
}

/** Returns all 5 judges for evaluation (3 content + brand + deflation hawk). */
export function pickJudges(): JudgePersonaConfig[] {
  return [
    PERSONAS.ct_degen,
    PERSONAS.comedy_writer,
    PERSONAS.data_hawk,
    PERSONAS.brand_guardian,
    PERSONAS.deflation_hawk,
  ];
}

// ---------------------------------------------------------------------------
// Evaluation prompt — no threshold disclosure, calibration anchors per dimension
// ---------------------------------------------------------------------------

export function buildEvaluationPrompt(
  persona: JudgePersonaConfig,
  targetName: string,
  tweetText: string,
  researchNotes: string | null,
): string {
  const researchLine = researchNotes
    ? `Research context: "${researchNotes}"`
    : 'No research context available.';

  return `${persona.systemPrompt}

Evaluate this crypto roast tweet.

Target: "${targetName}"
Roast: "${tweetText}"
${researchLine}

Score each dimension INDEPENDENTLY. Do not pre-calculate composite.
The system will determine verdict from your scores.

## Criteria (score each 1-5)

1. SAVAGE (1-5): Would a founder of the target feel genuinely stung?
   CALIBRATION:
   Score 2: "their TVL is low and the team seems to be struggling"
   Score 4: "they launched a 'decentralized' exchange and delisted a token by group chat vote in 2 minutes"
   Auto-cap at 3 if: observation is obvious to anyone following the space, punchline is predictable from setup, or could apply to 10+ other projects with name swapped.

2. FACTUAL (1-5): Is it grounded in verifiable data/events?
   CALIBRATION:
   Score 2: "down a lot from ATH, team has been quiet"
   Score 4: "TVL dropped from $47M to $4.2M while team posted 'building in silence' 14 times"
   IMPORTANT: If no research context AND tweet contains specific numbers → max 3.

3. FUNNY (1-5): Does the setup→punchline genuinely land?
   CALIBRATION:
   Score 2: data dump with sarcastic conclusion ("and they call this 'innovation'")
   Score 4: genuine misdirection — first sentence sets one expectation, punchline goes somewhere unexpected
   Auto-cap at 3 if: punchline is visible from the setup, more than 2 sentences, structure you've seen 100 times, or it reads like commentary rather than comedy.
   BREVITY BONUS: 1-sentence roasts with a devastating twist get +1. The best roasts are 80-150 characters.

4. ORIGINAL (1-5): Would CT have seen this take before?
   CALIBRATION:
   Score 2: "down bad, team MIA, wen product" — said about 50 projects this week
   Score 4: specific detail or framing that only works for THIS target
   Auto-cap at 2 if: removing the project name makes the roast work for anything.

5. IMPACT (1-5): Would someone STOP SCROLLING to read this twice?
   CALIBRATION:
   Score 1: scroll past without pausing
   Score 2: mild acknowledgment, maybe a like
   Score 3: mild smirk, might like
   Score 4: screenshot and send to a group chat
   Score 5: quote-tweet with "absolutely destroyed"
   Ask yourself: "did this make me REACT — laugh, wince, or say 'oh no'?"

6. CRYPTO_NATIVE (1-5): Does it sound like CT, not a marketing team?
   CALIBRATION:
   Score 2: uses CT words but structure reads like a newsletter
   Score 4: voice, pacing, and references are indistinguishable from a real CT account

7. DEGEN (1-5): Does this sound like $BEEF specifically — forensic AI on Base?
   CALIBRATION:
   Score 1: generic voice, could be any account
   Score 2: CT slang but no $BEEF identity
   Score 3: data + degen voice
   Score 4: forensic framing ("the audit shows...", "i have the receipts")
   Score 5: unmistakably $BEEF — AI self-awareness + forensic precision + mythology

8. TIMELY (1-5): Is this roast connected to something people currently care about?
   CALIBRATION:
   Score 1: dead project, zero current relevance
   Score 2: old news, 6+ months ago, CT moved on
   Score 3: evergreen — data facts that don't expire (acceptable for stockpile)
   Score 4: recent — happened 1-3 months ago, still discussed
   Score 5: hot — active drama right now

## Output

Respond with ONLY valid JSON (no markdown, no code fences):
{"reasoning":"2-3 sentences explaining your overall impression","scores":{"savage":N,"factual":N,"funny":N,"original":N,"impact":N,"crypto_native":N,"degen":N,"timely":N},"one_line_why":"why this works or doesn't in ≤15 words"}`;
}

// ---------------------------------------------------------------------------
// Output parser — handles 8 dimensions, backward-compatible with 6
// ---------------------------------------------------------------------------

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

  // Backward compat: accept 'shareable' as alias for 'impact' (pre-M5 evaluations)
  if (scores['impact'] === undefined && typeof scores['shareable'] === 'number') {
    scores['impact'] = scores['shareable'];
  }

  const requiredKeys = [
    'savage', 'factual', 'funny', 'original', 'impact', 'crypto_native', 'degen', 'timely',
  ] as const;

  for (const key of requiredKeys) {
    if (typeof scores[key] !== 'number') {
      // Backward compat: default missing dimensions to 3
      if ((key === 'degen' || key === 'timely') && scores[key] === undefined) {
        scores[key] = 3;
      } else {
        throw new Error(`Missing or non-numeric score: ${key}`);
      }
    }
  }

  // Scores must be finite and inside the rubric — a judge returning NaN or 7
  // would silently distort the weighted composite and the consensus vetoes.
  // Lower bound is 0, not 1: judges legitimately score 0 to signal total
  // failure (the DEGEN < 1 hard veto depends on it).
  for (const key of requiredKeys) {
    const value = scores[key] as number;
    if (!Number.isFinite(value)) {
      throw new Error(`Non-finite score: ${key}`);
    }
    scores[key] = Math.min(5, Math.max(0, value));
  }

  // Simple average as baseline composite (system may override with weighted)
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
      impact: scores['impact'] as number,
      crypto_native: scores['crypto_native'] as number,
      degen: scores['degen'] as number,
      timely: scores['timely'] as number,
    },
    composite: Math.round(composite * 10) / 10,
    // System determines verdict via weighted scoring — judge verdict is advisory only
    verdict: parsed['verdict'] === 'stockpile' ? 'stockpile' : 'discard',
    one_line_why: typeof parsed['one_line_why'] === 'string' ? parsed['one_line_why'] : '',
  };
}
