import { describe, it, expect } from 'vitest';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCharacter, getAllExamples, getRandomExamples } from './character.loader.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CHARACTER_PATH = resolve(__dirname, '../../characters/beef-bot.json');

describe('loadCharacter', () => {
  it('loads and validates beef-bot.json', () => {
    const char = loadCharacter(CHARACTER_PATH);
    expect(char.meta.name).toBe('$BEEF');
    expect(char.version).toBe('1.1.0');
    expect(char.systemPrompt.length).toBeGreaterThan(100);
    expect(char.personality.traits.length).toBeGreaterThanOrEqual(1);
    expect(char.voice.slang.length).toBeGreaterThan(0);
    expect(char.style.sentenceStructures.length).toBe(13);
    expect(char.style.forbiddenPatterns.length).toBeGreaterThan(0);
  });

  it('has curated examples', () => {
    const char = loadCharacter(CHARACTER_PATH);
    expect(Object.keys(char.examples).length).toBeGreaterThanOrEqual(1);
    for (const examples of Object.values(char.examples)) {
      expect(examples.length).toBeGreaterThan(0);
      for (const ex of examples) {
        expect(ex.text).toBeTruthy();
        expect(ex.angle).toBeTruthy();
        expect(ex.charCount).toBeGreaterThan(0);
      }
    }
  });

  it('throws on invalid file path', () => {
    expect(() => loadCharacter('/nonexistent/file.json')).toThrow();
  });
});

describe('getAllExamples', () => {
  it('returns flat array of all examples', () => {
    const char = loadCharacter(CHARACTER_PATH);
    const all = getAllExamples(char);
    expect(all.length).toBeGreaterThanOrEqual(5);
    expect(all.every((ex) => typeof ex.text === 'string')).toBe(true);
  });
});

describe('getRandomExamples', () => {
  it('returns requested number of examples from best section by default', () => {
    const char = loadCharacter(CHARACTER_PATH);
    const samples = getRandomExamples(char, 5);
    expect(samples).toHaveLength(5);
    const bestExamples = char.examples['best'] ?? [];
    for (const sample of samples) {
      expect(bestExamples).toContainEqual(sample);
    }
  });

  it('returns all section examples if count exceeds section total', () => {
    const char = loadCharacter(CHARACTER_PATH);
    const bestExamples = char.examples['best'] ?? [];
    const samples = getRandomExamples(char, 999);
    expect(samples).toHaveLength(bestExamples.length);
  });

  it('returns examples from specified section', () => {
    const char = loadCharacter(CHARACTER_PATH);
    const casualExamples = char.examples['casualReplies'] ?? [];
    const samples = getRandomExamples(char, 3, 'casualReplies');
    expect(samples).toHaveLength(3);
    for (const sample of samples) {
      expect(casualExamples).toContainEqual(sample);
    }
  });

  it('does not mix casualReplies into default roast examples', () => {
    const char = loadCharacter(CHARACTER_PATH);
    const bestExamples = char.examples['best'] ?? [];
    const samples = getRandomExamples(char, bestExamples.length);
    const casualAngles = new Set((char.examples['casualReplies'] ?? []).map((e) => e.text));
    for (const sample of samples) {
      expect(casualAngles.has(sample.text)).toBe(false);
    }
  });
});
