import { readFileSync } from 'node:fs';
import { z } from 'zod';

const exampleSchema = z.object({
  text: z.string(),
  target: z.string(),
  angle: z.string(),
  charCount: z.number().int().positive(),
});

const characterSchema = z.object({
  $schema: z.string().optional(),
  version: z.string(),
  meta: z.object({
    name: z.string(),
    handle: z.string(),
    tagline: z.string(),
    bio: z.string(),
    bioAlt: z.string().optional(),
    avatarDescription: z.string().optional(),
    headerDescription: z.string().optional(),
    pinnedTweet: z.string().optional(),
    chain: z.string(),
    erc8004: z.boolean().optional(),
  }),
  systemPrompt: z.string().min(100),
  originStory: z.string(),
  personality: z.object({
    traits: z.array(z.string()).min(1),
    emotionalRange: z.record(z.string()),
    relationships: z.record(z.string()),
    selfMythology: z.record(z.union([z.string(), z.record(z.string())])),
  }),
  signatureMoves: z.array(z.string()),
  voice: z.object({
    register: z.string(),
    tone: z.string(),
    humor: z.string(),
    pacing: z.string(),
    slang: z.array(z.string()),
    selfAwareness: z.string(),
    signature: z.string(),
  }),
  style: z.object({
    sentenceStructures: z.array(z.string()),
    lengthDistribution: z.record(z.string()),
    forbiddenPatterns: z.array(z.string()),
  }),
  examples: z.record(z.array(exampleSchema)),
  topics: z.object({
    primary: z.array(z.string()),
    seasonal: z.record(z.string()),
    avoidTopics: z.array(z.string()),
  }),
  antiPatterns: z.object({
    content: z.array(z.string()),
    voice: z.array(z.string()),
    engagement: z.array(z.string()),
  }),
  researchInstructions: z.object({
    _note: z.string().optional(),
    required: z.array(z.string()),
    preferred: z.array(z.string()),
    tools: z.array(z.string()),
  }),
  promptVariants: z
    .object({
      _note: z.string().optional(),
      rubric: z.string(),
      persona: z.string(),
      adversarial: z.string(),
      recommendedSplit: z.string(),
    })
    .optional(),
  evaluationFramework: z
    .object({
      _note: z.string().optional(),
      layer1: z.string(),
      layer2: z.string(),
      layer3: z.string(),
      composite: z.string(),
      thresholds: z.record(z.string()),
    })
    .optional(),
});

export type CharacterConfig = z.infer<typeof characterSchema>;

export type CharacterExample = z.infer<typeof exampleSchema>;

export function loadCharacter(filePath: string): CharacterConfig {
  const raw = readFileSync(filePath, 'utf-8');
  const json: unknown = JSON.parse(raw);
  return characterSchema.parse(json);
}

export function getAllExamples(character: CharacterConfig): CharacterExample[] {
  return Object.values(character.examples).flat();
}

export function getRandomExamples(character: CharacterConfig, count: number): CharacterExample[] {
  const all = getAllExamples(character);
  const shuffled = [...all].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

export function getExamplesBySection(
  character: CharacterConfig,
  section: string,
  count?: number,
): CharacterExample[] {
  const examples = character.examples[section] ?? [];
  if (!count || count >= examples.length) return examples;
  const shuffled = [...examples].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}
