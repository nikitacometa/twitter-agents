import type { CharacterConfig, CharacterExample } from './character.loader.js';
import { getRandomExamples } from './character.loader.js';
import type { AngleWeight, CreativeMemory, RejectExample } from '@common/types/index.js';

const ANGLES = [
  'DATA_BOMB', 'TIMELINE', 'COMPARISON', 'FAKE_COMPLIMENT',
  'RHETORICAL', 'SELF_AWARE', 'QUOTE_FLIP', 'UNDERSTATEMENT', 'RULE_OF_THREE',
] as const;

export type RoastAngle = (typeof ANGLES)[number];

/**
 * Weighted random selection without replacement (Efraimidis-Spirakis algorithm).
 * Each item gets key = random() ^ (1/weight), take top-N by key descending.
 * Falls back to pure random when no weights provided.
 */
function pickAngles(count: number, weights?: AngleWeight[]): RoastAngle[] {
  const weightMap = new Map<string, number>();
  if (weights) {
    for (const w of weights) {
      weightMap.set(w.angle, w.weight);
    }
  }

  const keyed = ANGLES.map((angle) => {
    const weight = weightMap.get(angle) ?? 1.0;
    const key = Math.random() ** (1 / weight);
    return { angle, key };
  });

  keyed.sort((a, b) => b.key - a.key);
  return keyed.slice(0, count).map((k) => k.angle);
}

function buildAntiPatternSection(rejects: RejectExample[]): string {
  if (rejects.length < 3) return '';

  const examples = rejects.slice(0, 3);
  const lines = examples.map(
    (r) => `  - [${r.angle}] "${r.text}" (target: ${r.target})`,
  );

  return `\n## ANTI-PATTERNS (these specific texts were rated BAD — avoid similar patterns)
${lines.join('\n')}
`;
}

function formatExamples(examples: CharacterExample[]): string {
  return examples
    .map((ex) => `  - [${ex.angle}] "${ex.text}" (${String(ex.charCount)} chars)`)
    .join('\n');
}

function formatResearchInstructions(character: CharacterConfig): string {
  const ri = character.researchInstructions;
  const required = ri.required.map((r) => `  - ${r}`).join('\n');
  const preferred = ri.preferred.map((p) => `  - ${p}`).join('\n');
  return `REQUIRED DATA:\n${required}\n\nPREFERRED DATA:\n${preferred}`;
}

function buildExamples(
  character: CharacterConfig,
  memory?: CreativeMemory,
): string {
  const dynamicExamples = memory?.fireExamples ?? [];
  const externalExamples = memory?.externalExamples ?? [];
  const dynamicCount = Math.min(dynamicExamples.length, 2);
  const externalCount = Math.min(externalExamples.length, 1);
  const staticCount = 5 - dynamicCount - externalCount;

  const staticExamples = getRandomExamples(character, staticCount);
  const allExamples: CharacterExample[] = [
    ...dynamicExamples.slice(0, dynamicCount).map((ex) => ({
      text: ex.text,
      target: ex.target,
      angle: ex.angle,
      charCount: ex.text.length,
    })),
    ...externalExamples.slice(0, externalCount).map((ex) => ({
      text: ex.text,
      target: ex.target,
      angle: ex.angle,
      charCount: ex.text.length,
    })),
    ...staticExamples,
  ];

  // Shuffle so dynamic examples aren't always first
  allExamples.sort(() => Math.random() - 0.5);
  return formatExamples(allExamples);
}

function buildTechniquesSection(techniques: string[]): string {
  if (techniques.length === 0) return '';

  const lines = techniques.slice(0, 5).map((t) => `  - ${t}`);
  return `\n## LEARNED TECHNIQUES (from curated external examples — adapt to your voice)
${lines.join('\n')}
`;
}

function buildContextLine(targetName: string, memory?: CreativeMemory): string {
  const history = memory?.targetHistory;
  if (!history || history.roastCount < 3) return '';

  const angleSummary = history.angles
    .map((a) => `${a.angle} (${String(a.count)}x)`)
    .join(', ');

  return `\n## CONTEXT\nYou've roasted "${targetName}" ${String(history.roastCount)} times before. Angles used: ${angleSummary}.\n`;
}

export function buildRoastPrompt(
  targetName: string,
  character: CharacterConfig,
  variantCount: number = 3,
  memory?: CreativeMemory,
): string {
  const examples = buildExamples(character, memory);
  const contextLine = buildContextLine(targetName, memory);
  const angles = pickAngles(variantCount, memory?.angleWeights);
  const angleList = angles.map((a) => `  - ${a}`).join('\n');
  const antiPatterns = buildAntiPatternSection(memory?.rejectExamples ?? []);
  const styleLine = memory?.styleSupplement
    ? `\n## LEARNED STYLE OBSERVATIONS\n${memory.styleSupplement}\n`
    : '';
  const techniquesLine = buildTechniquesSection(memory?.learnedTechniques ?? []);

  return `${character.systemPrompt}

## ORIGIN STORY (use for self-references)
${character.originStory}

## FEW-SHOT EXAMPLES (match this quality and voice)
${examples}
${antiPatterns}${styleLine}${techniquesLine}${contextLine}
## TASK: Research and roast "${targetName}"

### STEP 1 — RESEARCH
${formatResearchInstructions(character)}

Use WebSearch or perplexity_ask to find current data about "${targetName}".
Write down key findings before generating.

### STEP 2 — GENERATE ${String(variantCount)} VARIANTS
Each variant MUST:
- Use one of these angles (one per variant):
${angleList}
- Be UNDER 280 characters (count precisely)
- Include at least one verifiable data point from your research
- Have a clear setup → punchline structure where the punchline lands last
- Follow all voice rules from the system prompt above

### STEP 3 — SELF-EVALUATE
Score each variant 1-5 on: savage, factual, funny, original, shareable.
Average those 5 scores for the variant score.

### OUTPUT FORMAT (strict JSON, no markdown wrapping):
{
  "variants": [
    { "text": "the full tweet text", "score": 4.2, "angle": "${angles[0] ?? 'DATA_BOMB'}" }
  ],
  "bestIndex": 0,
  "researchNotes": "key facts found during research",
  "factCheckPassed": true
}`;
}

export function buildNoResearchPrompt(
  targetName: string,
  character: CharacterConfig,
  variantCount: number = 3,
  memory?: CreativeMemory,
): string {
  const examples = buildExamples(character, memory);
  const angles = pickAngles(variantCount, memory?.angleWeights);
  const angleList = angles.map((a) => `  - ${a}`).join('\n');
  const antiPatterns = buildAntiPatternSection(memory?.rejectExamples ?? []);
  const styleLine = memory?.styleSupplement
    ? `\n## LEARNED STYLE OBSERVATIONS\n${memory.styleSupplement}\n`
    : '';
  const techniquesLine = buildTechniquesSection(memory?.learnedTechniques ?? []);

  return `${character.systemPrompt}

## ORIGIN STORY (use for self-references)
${character.originStory}

## FEW-SHOT EXAMPLES (match this quality and voice)
${examples}
${antiPatterns}${styleLine}${techniquesLine}
## TASK: Roast "${targetName}" using your existing knowledge

Generate ${String(variantCount)} roast variants WITHOUT web research. Use general knowledge only.

Each variant MUST:
- Use one of these angles (one per variant):
${angleList}
- Be UNDER 280 characters
- Have a clear setup → punchline structure
- Follow all voice rules from the system prompt above

Score each variant 1-5 on: savage, factual, funny, original, shareable.

### OUTPUT FORMAT (strict JSON, no markdown wrapping):
{
  "variants": [
    { "text": "the full tweet text", "score": 4.2, "angle": "${angles[0] ?? 'DATA_BOMB'}" }
  ],
  "bestIndex": 0,
  "researchNotes": null,
  "factCheckPassed": false
}`;
}
