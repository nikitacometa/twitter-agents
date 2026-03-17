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
    expect(char.version).toBe('1.0.0');
    expect(char.systemPrompt.length).toBeGreaterThan(100);
    expect(char.personality.traits.length).toBeGreaterThanOrEqual(1);
    expect(char.voice.slang.length).toBeGreaterThan(0);
    expect(char.style.sentenceStructures.length).toBe(8);
    expect(char.style.forbiddenPatterns.length).toBeGreaterThan(0);
  });

  it('has all required example categories', () => {
    const char = loadCharacter(CHARACTER_PATH);
    expect(Object.keys(char.examples).length).toBeGreaterThanOrEqual(5);
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
    expect(all.length).toBeGreaterThanOrEqual(20);
    expect(all.every((ex) => typeof ex.text === 'string')).toBe(true);
  });
});

describe('getRandomExamples', () => {
  it('returns requested number of examples', () => {
    const char = loadCharacter(CHARACTER_PATH);
    const samples = getRandomExamples(char, 5);
    expect(samples).toHaveLength(5);
  });

  it('returns all examples if count exceeds total', () => {
    const char = loadCharacter(CHARACTER_PATH);
    const all = getAllExamples(char);
    const samples = getRandomExamples(char, 999);
    expect(samples).toHaveLength(all.length);
  });
});
