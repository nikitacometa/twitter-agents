import type { Mutation, MutationType } from './types.js';

export const MUTATIONS: Mutation[] = [
  // --- Constraint mutations ---
  { id: 'short', type: 'constraint', text: 'CONSTRAINT: Must be under 140 characters. Half-tweet challenge — every word must earn its place.' },
  { id: 'max-length', type: 'constraint', text: 'CONSTRAINT: Use exactly 270-280 characters. Fill the space — density is a weapon.' },
  { id: 'question', type: 'constraint', text: 'CONSTRAINT: Must end with a question, not a statement. Let them answer it in their head.' },
  { id: 'single-sent', type: 'constraint', text: 'CONSTRAINT: Single sentence only. No periods except the last one.' },
  { id: 'no-data', type: 'constraint', text: 'CONSTRAINT: No numbers, percentages, or dollar amounts. Pure narrative roast.' },
  { id: 'number-lead', type: 'constraint', text: 'CONSTRAINT: Must open with a specific number (dollar amount, percentage, date, or count).' },

  // --- Voice mutations ---
  { id: 'ice-cold', type: 'voice', text: 'VOICE OVERRIDE: Maximum restraint. Ice cold. No exclamation energy. Whisper the kill shot.' },
  { id: 'amused', type: 'voice', text: 'VOICE OVERRIDE: Genuinely amused, not angry. You find this project FUNNY. The humor is that it exists.' },
  { id: 'fake-respect', type: 'voice', text: 'VOICE OVERRIDE: The compliment IS the roast. Sound impressed. The reader should need 2 seconds to realize you just destroyed them.' },
  { id: 'normie', type: 'voice', text: 'VOICE OVERRIDE: Explain this project to a confused normie. The explanation itself is the roast.' },
  { id: 'therapist', type: 'voice', text: 'VOICE OVERRIDE: Sound like a therapist gently breaking bad news. Clinical empathy that somehow makes it worse.' },

  // --- Perspective mutations ---
  { id: 'investors', type: 'perspective', text: "PERSPECTIVE: Roast from their own investors' internal group chat." },
  { id: 'obituary', type: 'perspective', text: "PERSPECTIVE: You are writing this project's obituary, dated 2027. What did it die of?" },
  { id: 'non-crypto', type: 'perspective', text: 'PERSPECTIVE: Compare this to a non-crypto thing — a restaurant, movie, or historical event. The comparison IS the roast.' },
  { id: 'competitor', type: 'perspective', text: "PERSPECTIVE: You are this project's biggest competitor. What would YOU tweet about them?" },
  { id: 'future', type: 'perspective', text: "PERSPECTIVE: It's 2028. This project was a footnote. What do you remember about it? Probably nothing — that's the roast." },

  // --- Wildcard mutations ---
  { id: 'ignore-angle', type: 'wildcard', text: 'WILDCARD: Ignore the assigned angle. Find the angle that HURTS most. Trust your instinct.' },
  { id: 'no-name', type: 'wildcard', text: 'WILDCARD: The roast must work even if you remove the project name. It should be recognizable from the description alone.' },
  { id: 'one-word', type: 'wildcard', text: 'WILDCARD: The punchline must be a single word. Build to it.' },
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
