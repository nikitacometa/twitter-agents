import type { CharacterConfig, CharacterExample } from './character.loader.js';
import { getRandomExamples } from './character.loader.js';

const ANGLES = [
  'DATA_BOMB', 'TIMELINE', 'COMPARISON', 'FAKE_COMPLIMENT',
  'RHETORICAL', 'SELF_AWARE', 'QUOTE_FLIP', 'UNDERSTATEMENT', 'RULE_OF_THREE',
] as const;

export type RoastAngle = (typeof ANGLES)[number];

function pickAngles(count: number): RoastAngle[] {
  const shuffled = [...ANGLES].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
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

export function buildRoastPrompt(
  targetName: string,
  character: CharacterConfig,
  variantCount: number = 3,
): string {
  const examples = getRandomExamples(character, 5);
  const angles = pickAngles(variantCount);
  const angleList = angles.map((a) => `  - ${a}`).join('\n');

  return `${character.systemPrompt}

## ORIGIN STORY (use for self-references)
${character.originStory}

## FEW-SHOT EXAMPLES (match this quality and voice)
${formatExamples(examples)}

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
): string {
  const examples = getRandomExamples(character, 5);
  const angles = pickAngles(variantCount);
  const angleList = angles.map((a) => `  - ${a}`).join('\n');

  return `${character.systemPrompt}

## ORIGIN STORY (use for self-references)
${character.originStory}

## FEW-SHOT EXAMPLES (match this quality and voice)
${formatExamples(examples)}

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
