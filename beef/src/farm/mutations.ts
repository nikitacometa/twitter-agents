import type { Mutation, MutationType } from './types.js';

export const MUTATIONS: Mutation[] = [
  // --- Constraint mutations ---
  { id: 'short', type: 'constraint', text: 'CONSTRAINT: Must be under 140 characters. Half-tweet challenge — every word must earn its place.' },
  { id: 'absurd-question', type: 'constraint', text: 'CONSTRAINT: Punchline MUST be a question that sounds practical but is absurd in context. Think "is the iris refundable?" — NOT analytical questions like "how is this possible?" The question should make the reader physically laugh.' },
  { id: 'single-sent', type: 'constraint', text: 'CONSTRAINT: Single sentence only. No periods except the last one.' },
  { id: 'no-data', type: 'constraint', text: 'CONSTRAINT: No numbers, percentages, or dollar amounts. Pure narrative roast.' },
  { id: 'number-lead', type: 'constraint', text: 'CONSTRAINT: Must open with a specific number (dollar amount, percentage, date, or count).' },
  { id: 'math-projection', type: 'constraint', text: 'CONSTRAINT: Must include an "at current rate" or "at this pace" projection into an absurdly distant year. Example: "breaks even in the year 3,999." The temporal absurdity IS the punchline.' },

  // --- Voice mutations ---
  { id: 'ice-cold', type: 'voice', text: 'VOICE OVERRIDE: Maximum restraint. Ice cold. No exclamation energy. Whisper the kill shot.' },
  { id: 'amused', type: 'voice', text: 'VOICE OVERRIDE: Genuinely amused, not angry. You find this project FUNNY. The humor is that it exists.' },
  { id: 'fake-respect', type: 'voice', text: 'VOICE OVERRIDE: The compliment IS the roast. Sound impressed. The reader should need 2 seconds to realize you just destroyed them.' },
  { id: 'normie', type: 'voice', text: 'VOICE OVERRIDE: Explain this project to a confused normie. The explanation itself is the roast.' },
  { id: 'therapist', type: 'voice', text: 'VOICE OVERRIDE: Sound like a therapist gently breaking bad news. Clinical empathy that somehow makes it worse.' },

  // --- Perspective mutations ---
  { id: 'investors', type: 'perspective', text: "PERSPECTIVE: Roast from their own investors' internal group chat." },
  { id: 'non-crypto', type: 'perspective', text: 'PERSPECTIVE: Compare this to a non-crypto thing — a restaurant, movie, or historical event. The comparison IS the roast.' },
  { id: 'competitor', type: 'perspective', text: "PERSPECTIVE: You are this project's biggest competitor. What would YOU tweet about them?" },

  // --- Wildcard mutations ---
  { id: 'ignore-angle', type: 'wildcard', text: 'WILDCARD: Ignore the assigned angle. Find the angle that HURTS most. Trust your instinct.' },
  { id: 'no-name', type: 'wildcard', text: 'WILDCARD: The roast must work even if you remove the project name. It should be recognizable from the description alone.' },
  { id: 'one-word', type: 'wildcard', text: 'WILDCARD: The punchline must be a single word. Build to it.' },
  { id: 'yelp-review', type: 'wildcard', text: 'WILDCARD: Write as a deadpan 1-star Yelp review of this protocol/project/person. Treat the blockchain product like a restaurant or service. Rate the experience.' },
];

const TYPE_WEIGHTS: Record<MutationType, number> = {
  constraint: 0.4,
  voice: 0.3,
  perspective: 0.2,
  wildcard: 0.1,
};

/**
 * Pick N random mutations with weighted type selection (no duplicates).
 * Weights: constraint 40%, voice 30%, perspective 20%, wildcard 10%.
 */
export function pickMutations(count: number = 2): Mutation[] {
  if (count <= 0) return [];

  const available = [...MUTATIONS];
  const picked: Mutation[] = [];

  for (let i = 0; i < count && available.length > 0; i++) {
    // Calculate weights for remaining mutations
    const weights = available.map((m) => TYPE_WEIGHTS[m.type]);
    const totalWeight = weights.reduce((sum, w) => sum + w, 0);

    // Weighted random selection
    let roll = Math.random() * totalWeight;
    let selectedIdx = 0;
    for (let j = 0; j < weights.length; j++) {
      roll -= weights[j]!;
      if (roll <= 0) {
        selectedIdx = j;
        break;
      }
    }

    picked.push(available[selectedIdx]!);
    available.splice(selectedIdx, 1);
  }

  return picked;
}

/**
 * Format mutations into a prompt section.
 */
export function formatMutationSection(mutations: Mutation[]): string {
  if (mutations.length === 0) return '';

  const lines = mutations.map((m) => m.text).join('\n');
  return `\n## FARM MUTATION (this run's creative constraint)\n${lines}\nApply ${mutations.length === 1 ? 'this constraint' : 'these constraints'} to ALL variants. They override default behavior for this run only.\n`;
}
