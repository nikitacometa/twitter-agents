import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Logger } from 'pino';
import type { LLMProvider, AgentResult } from '@agent/agent.types.js';
import type { ImgflipClient, CaptionResult } from './imgflip-client.js';
import type { MemeHistoryRepository } from './meme-history.repository.js';
import type { MemeTemplate } from './meme-templates.js';
import { MemeGenerator, type MemeInput } from './meme-generator.js';

// ─── Test template ──────────────────────────────────────────────────────────

const TEST_TEMPLATE: MemeTemplate = {
  id: '181913649',
  name: 'Drake Hotline Bling',
  boxCount: 2,
  tier: 1,
  structure: 'Box 1: rejected. Box 2: chosen.',
  tone: ['dismissive'],
  bestFor: 'comparison',
  antiPatterns: 'no chronology',
  charLimit: 80,
  examples: [{ boxes: ['a', 'b'], context: 'test' }],
};

const TEST_TEMPLATE_PIGEON: MemeTemplate = {
  id: '100777631',
  name: 'Is This A Pigeon',
  boxCount: 3,
  tier: 2,
  structure: 'Box 1: subject. Box 2: misidentified thing. Box 3: question.',
  tone: ['confused', 'delusional'],
  bestFor: 'misidentification',
  antiPatterns: 'not for comparisons',
  charLimit: 50,
  examples: [{ boxes: ['x', 'y', 'z'], context: 'test' }],
};

// ─── Mocks ──────────────────────────────────────────────────────────────────

function mockLogger(): Logger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn().mockReturnThis(),
  } as unknown as Logger;
}

function mockHistoryRepo(recentNames: string[] = []): MemeHistoryRepository {
  return {
    getRecentTemplateNames: vi.fn().mockReturnValue(recentNames),
    insert: vi.fn().mockReturnValue(1),
    getByTarget: vi.fn().mockReturnValue([]),
    getCount: vi.fn().mockReturnValue(0),
  } as unknown as MemeHistoryRepository;
}

function mockImgflip(configured = true): ImgflipClient {
  return {
    isConfigured: configured,
    captionImage: vi.fn().mockResolvedValue({
      url: 'https://i.imgflip.com/test.jpg',
      pageUrl: 'https://imgflip.com/i/test',
    } satisfies CaptionResult),
    downloadToTmp: vi.fn().mockResolvedValue('/tmp/beef-meme-test.jpg'),
  } as unknown as ImgflipClient;
}

function mockProvider(data: unknown): LLMProvider {
  return {
    run: vi.fn().mockResolvedValue({
      data,
      durationMs: 200,
      provider: 'claude-code',
    } satisfies AgentResult<unknown>),
  } as unknown as LLMProvider;
}

const DEFAULT_INPUT: MemeInput = {
  target: 'Solana',
  targetType: 'project',
  context: 'SOL down 40% from ATH',
};

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('MemeGenerator', () => {
  let log: Logger;
  let historyRepo: MemeHistoryRepository;
  let imgflip: ImgflipClient;

  beforeEach(() => {
    log = mockLogger();
    historyRepo = mockHistoryRepo();
    imgflip = mockImgflip();
  });

  describe('generate — meme_only', () => {
    it('returns meme with caption when LLM chooses meme_only', async () => {
      const provider = mockProvider({
        format: 'meme_only',
        caption: 'solana moment',
        meme: {
          templateId: '181913649',
          boxes: ['selling at the top', 'buying more sol'],
          rationale: 'comparison works',
        },
      });

      const gen = new MemeGenerator(imgflip, provider, historyRepo, log, [TEST_TEMPLATE]);
      const result = await gen.generate(DEFAULT_INPUT);

      expect(result.format).toBe('meme_only');
      expect(result.tweetText).toBe('solana moment');
      expect(result.meme).not.toBeNull();
      expect(result.meme!.templateName).toBe('Drake Hotline Bling');
      expect(result.meme!.boxes).toEqual(['selling at the top', 'buying more sol']);
      expect(result.meme!.imageUrl).toBe('https://i.imgflip.com/test.jpg');
      expect(result.meme!.localPath).toBe('/tmp/beef-meme-test.jpg');
    });

    it('uses empty string for tweetText when caption is omitted', async () => {
      const provider = mockProvider({
        format: 'meme_only',
        meme: {
          templateId: '181913649',
          boxes: ['a', 'b'],
          rationale: 'test',
        },
      });

      const gen = new MemeGenerator(imgflip, provider, historyRepo, log, [TEST_TEMPLATE]);
      const result = await gen.generate(DEFAULT_INPUT);

      expect(result.tweetText).toBe('');
    });
  });

  describe('generate — meme_plus_text', () => {
    it('returns meme with roast text', async () => {
      const provider = mockProvider({
        format: 'meme_plus_text',
        roastText: 'solana validators are just AWS instances with extra steps ser',
        meme: {
          templateId: '181913649',
          boxes: ['decentralization', 'aws instances'],
          rationale: 'ironic comparison',
        },
      });

      const gen = new MemeGenerator(imgflip, provider, historyRepo, log, [TEST_TEMPLATE]);
      const result = await gen.generate(DEFAULT_INPUT);

      expect(result.format).toBe('meme_plus_text');
      expect(result.tweetText).toBe('solana validators are just AWS instances with extra steps ser');
      expect(result.meme).not.toBeNull();
    });

    it('falls back to input roastText when LLM omits roastText', async () => {
      const provider = mockProvider({
        format: 'meme_plus_text',
        meme: {
          templateId: '181913649',
          boxes: ['a', 'b'],
          rationale: 'test',
        },
      });

      const gen = new MemeGenerator(imgflip, provider, historyRepo, log, [TEST_TEMPLATE]);
      const result = await gen.generate({
        ...DEFAULT_INPUT,
        roastText: 'pre-existing roast',
      });

      expect(result.tweetText).toBe('pre-existing roast');
    });
  });

  describe('generate — text_only', () => {
    it('returns text_only with no meme', async () => {
      const provider = mockProvider({
        format: 'text_only',
        roastText: 'solana down bad fr fr',
        meme: null,
      });

      const gen = new MemeGenerator(imgflip, provider, historyRepo, log, [TEST_TEMPLATE]);
      const result = await gen.generate(DEFAULT_INPUT);

      expect(result.format).toBe('text_only');
      expect(result.tweetText).toBe('solana down bad fr fr');
      expect(result.meme).toBeNull();
    });

    it('falls back to input roastText when LLM returns text_only without roastText', async () => {
      const provider = mockProvider({
        format: 'text_only',
        meme: null,
      });

      const gen = new MemeGenerator(imgflip, provider, historyRepo, log, [TEST_TEMPLATE]);
      const result = await gen.generate({
        ...DEFAULT_INPUT,
        roastText: 'existing roast',
      });

      expect(result.tweetText).toBe('existing roast');
    });
  });

  describe('fallbacks', () => {
    it('falls back to text_only when LLM picks unknown template', async () => {
      const provider = mockProvider({
        format: 'meme_only',
        caption: 'test',
        meme: {
          templateId: 'nonexistent_999',
          boxes: ['a', 'b'],
          rationale: 'bad pick',
        },
      });

      const gen = new MemeGenerator(imgflip, provider, historyRepo, log, [TEST_TEMPLATE]);
      const result = await gen.generate(DEFAULT_INPUT);

      expect(result.format).toBe('text_only');
      expect(result.meme).toBeNull();
      expect(log.warn).toHaveBeenCalledWith(
        expect.objectContaining({ templateId: 'nonexistent_999' }),
        expect.stringContaining('unknown template'),
      );
    });

    it('falls back to text_only when box count mismatches', async () => {
      const provider = mockProvider({
        format: 'meme_only',
        meme: {
          templateId: '181913649',
          boxes: ['only one box'],
          rationale: 'test',
        },
      });

      const gen = new MemeGenerator(imgflip, provider, historyRepo, log, [TEST_TEMPLATE]);
      const result = await gen.generate(DEFAULT_INPUT);

      expect(result.format).toBe('text_only');
      expect(result.meme).toBeNull();
      expect(log.warn).toHaveBeenCalled();
    });

    it('falls back to text_only when box text is too long', async () => {
      const provider = mockProvider({
        format: 'meme_only',
        meme: {
          templateId: '181913649',
          boxes: ['a'.repeat(100), 'short'],
          rationale: 'test',
        },
      });

      const gen = new MemeGenerator(imgflip, provider, historyRepo, log, [TEST_TEMPLATE]);
      const result = await gen.generate(DEFAULT_INPUT);

      expect(result.format).toBe('text_only');
      expect(result.meme).toBeNull();
    });

    it('falls back to text_only when box has too many words', async () => {
      const provider = mockProvider({
        format: 'meme_only',
        meme: {
          templateId: '181913649',
          boxes: ['one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen', 'short'],
          rationale: 'test',
        },
      });

      const gen = new MemeGenerator(imgflip, provider, historyRepo, log, [TEST_TEMPLATE]);
      const result = await gen.generate(DEFAULT_INPUT);

      expect(result.format).toBe('text_only');
      expect(result.meme).toBeNull();
    });

    it('falls back to text_only when Imgflip captionImage fails', async () => {
      const failingImgflip = mockImgflip();
      // eslint-disable-next-line @typescript-eslint/unbound-method
      vi.mocked(failingImgflip.captionImage).mockRejectedValue(new Error('API down'));

      const provider = mockProvider({
        format: 'meme_only',
        caption: 'test',
        meme: {
          templateId: '181913649',
          boxes: ['a', 'b'],
          rationale: 'test',
        },
      });

      const gen = new MemeGenerator(failingImgflip, provider, historyRepo, log, [TEST_TEMPLATE]);
      const result = await gen.generate(DEFAULT_INPUT);

      expect(result.format).toBe('text_only');
      expect(result.meme).toBeNull();
      expect(log.error).toHaveBeenCalled();
    });

    it('falls back to text_only when Imgflip downloadToTmp fails', async () => {
      const failingImgflip = mockImgflip();
      // eslint-disable-next-line @typescript-eslint/unbound-method
      vi.mocked(failingImgflip.downloadToTmp).mockRejectedValue(new Error('download failed'));

      const provider = mockProvider({
        format: 'meme_only',
        meme: {
          templateId: '181913649',
          boxes: ['a', 'b'],
          rationale: 'test',
        },
      });

      const gen = new MemeGenerator(failingImgflip, provider, historyRepo, log, [TEST_TEMPLATE]);
      const result = await gen.generate(DEFAULT_INPUT);

      expect(result.format).toBe('text_only');
      expect(result.meme).toBeNull();
    });

    it('allows empty boxes (natural for some templates)', async () => {
      const provider = mockProvider({
        format: 'meme_only',
        meme: {
          templateId: '181913649',
          boxes: ['top text', ''],
          rationale: 'test',
        },
      });

      const gen = new MemeGenerator(imgflip, provider, historyRepo, log, [TEST_TEMPLATE]);
      const result = await gen.generate(DEFAULT_INPUT);

      expect(result.format).toBe('meme_only');
      expect(result.meme).not.toBeNull();
    });
  });

  describe('history tracking', () => {
    it('saves successful meme to history', async () => {
      const provider = mockProvider({
        format: 'meme_only',
        meme: {
          templateId: '181913649',
          boxes: ['a', 'b'],
          rationale: 'test reason',
        },
      });

      const gen = new MemeGenerator(imgflip, provider, historyRepo, log, [TEST_TEMPLATE]);
      await gen.generate(DEFAULT_INPUT);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(historyRepo.insert).toHaveBeenCalledWith({
        templateId: '181913649',
        templateName: 'Drake Hotline Bling',
        target: 'Solana',
        boxes: ['a', 'b'],
        format: 'meme_only',
        imageUrl: 'https://i.imgflip.com/test.jpg',
        rationale: 'test reason',
      });
    });

    it('does not save to history on fallback', async () => {
      const provider = mockProvider({
        format: 'text_only',
        roastText: 'just text',
        meme: null,
      });

      const gen = new MemeGenerator(imgflip, provider, historyRepo, log, [TEST_TEMPLATE]);
      await gen.generate(DEFAULT_INPUT);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(historyRepo.insert).not.toHaveBeenCalled();
    });

    it('passes recently used templates to prompt', async () => {
      const recentRepo = mockHistoryRepo(['Drake Hotline Bling', 'This Is Fine']);
      const provider = mockProvider({
        format: 'text_only',
        roastText: 'test',
        meme: null,
      });

      const gen = new MemeGenerator(imgflip, provider, recentRepo, log, [TEST_TEMPLATE]);
      await gen.generate(DEFAULT_INPUT);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(recentRepo.getRecentTemplateNames).toHaveBeenCalledWith(15);
      // The prompt passed to provider should contain recently used section
      // eslint-disable-next-line @typescript-eslint/unbound-method
      const callArgs = vi.mocked(provider.run).mock.calls[0]!;
      const prompt = (callArgs[1] as { prompt: string }).prompt;
      expect(prompt).toContain('RECENTLY USED');
      expect(prompt).toContain('Drake Hotline Bling');
    });
  });

  describe('generateVariants', () => {
    it('returns only successful meme variants', async () => {
      let callCount = 0;
      const provider: LLMProvider = {
        run: vi.fn().mockImplementation(() => {
          callCount++;
          // 1st and 3rd succeed with meme, 2nd returns text_only
          if (callCount === 2) {
            return Promise.resolve({
              data: { format: 'text_only', roastText: 'text', meme: null },
              durationMs: 100,
              provider: 'claude-code',
            });
          }
          return Promise.resolve({
            data: {
              format: 'meme_only',
              meme: { templateId: '181913649', boxes: ['a', 'b'], rationale: 'test' },
            },
            durationMs: 100,
            provider: 'claude-code',
          });
        }),
      } as unknown as LLMProvider;

      const gen = new MemeGenerator(imgflip, provider, historyRepo, log, [TEST_TEMPLATE]);
      const results = await gen.generateVariants(DEFAULT_INPUT, 3);

      expect(results).toHaveLength(2);
      expect(results.every((r) => r.meme !== null)).toBe(true);
    });

    it('handles errors in individual variants gracefully', async () => {
      let callCount = 0;
      const provider: LLMProvider = {
        run: vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 2) {
            return Promise.reject(new Error('LLM timeout'));
          }
          return Promise.resolve({
            data: {
              format: 'meme_only',
              meme: { templateId: '181913649', boxes: ['a', 'b'], rationale: 'test' },
            },
            durationMs: 100,
            provider: 'claude-code',
          });
        }),
      } as unknown as LLMProvider;

      const gen = new MemeGenerator(imgflip, provider, historyRepo, log, [TEST_TEMPLATE]);
      const results = await gen.generateVariants(DEFAULT_INPUT, 3);

      expect(results).toHaveLength(2);
      expect(log.warn).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 1 }),
        expect.stringContaining('failed'),
      );
    });
  });

  describe('angle filtering', () => {
    it('includes Tier 2 template when angle maps to it', async () => {
      // DATA_BOMB maps to Is This A Pigeon (100777631) — a Tier 2 template
      const provider = mockProvider({
        format: 'meme_only',
        meme: {
          templateId: '100777631',
          boxes: ['cardano', '$149K revenue', 'is this a blockchain?'],
          rationale: 'data bomb pigeon',
        },
      });

      const gen = new MemeGenerator(imgflip, provider, historyRepo, log, [TEST_TEMPLATE, TEST_TEMPLATE_PIGEON]);
      const result = await gen.generate({ ...DEFAULT_INPUT, roastAngle: 'DATA_BOMB' });

      // Verify prompt was built with the pigeon template
      // eslint-disable-next-line @typescript-eslint/unbound-method
      const prompt = (vi.mocked(provider.run).mock.calls[0]![1] as { prompt: string }).prompt;
      expect(prompt).toContain('Is This A Pigeon');
      expect(result.meme).not.toBeNull();
    });

    it('excludes Tier 2 templates when no angle is provided', async () => {
      const provider = mockProvider({
        format: 'text_only',
        roastText: 'test',
        meme: null,
      });

      const gen = new MemeGenerator(imgflip, provider, historyRepo, log, [TEST_TEMPLATE, TEST_TEMPLATE_PIGEON]);
      await gen.generate(DEFAULT_INPUT);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      const prompt = (vi.mocked(provider.run).mock.calls[0]![1] as { prompt: string }).prompt;
      // Tier 1 Drake should be in prompt, Tier 2 Pigeon should not
      expect(prompt).toContain('Drake Hotline Bling');
      expect(prompt).not.toContain('Is This A Pigeon');
    });

    it('falls back to Tier 1 for unknown angle', async () => {
      const provider = mockProvider({
        format: 'text_only',
        roastText: 'test',
        meme: null,
      });

      const gen = new MemeGenerator(imgflip, provider, historyRepo, log, [TEST_TEMPLATE, TEST_TEMPLATE_PIGEON]);
      await gen.generate({ ...DEFAULT_INPUT, roastAngle: 'UNKNOWN_ANGLE' });

      // eslint-disable-next-line @typescript-eslint/unbound-method
      const prompt = (vi.mocked(provider.run).mock.calls[0]![1] as { prompt: string }).prompt;
      expect(prompt).toContain('Drake Hotline Bling');
      expect(prompt).not.toContain('Is This A Pigeon');
    });

    it('is case-insensitive for angle names', async () => {
      const provider = mockProvider({
        format: 'text_only',
        roastText: 'test',
        meme: null,
      });

      const gen = new MemeGenerator(imgflip, provider, historyRepo, log, [TEST_TEMPLATE, TEST_TEMPLATE_PIGEON]);
      await gen.generate({ ...DEFAULT_INPUT, roastAngle: 'data_bomb' });

      // eslint-disable-next-line @typescript-eslint/unbound-method
      const prompt = (vi.mocked(provider.run).mock.calls[0]![1] as { prompt: string }).prompt;
      expect(prompt).toContain('Is This A Pigeon');
    });
  });

  describe('target dedup', () => {
    it('calls getByTarget and excludes previously used templates', async () => {
      const dedupeRepo = mockHistoryRepo();
      // eslint-disable-next-line @typescript-eslint/unbound-method
      vi.mocked(dedupeRepo.getByTarget).mockReturnValue([
        { id: 1, templateId: '181913649', templateName: 'Drake Hotline Bling', target: 'Solana', boxes: ['a', 'b'], format: 'meme_only' as const, imageUrl: null, rationale: null, createdAt: '2026-01-01' },
      ]);

      const provider = mockProvider({
        format: 'text_only',
        roastText: 'test',
        meme: null,
      });

      const gen = new MemeGenerator(imgflip, provider, dedupeRepo, log, [TEST_TEMPLATE, TEST_TEMPLATE_PIGEON]);
      // No angle → Tier 1 only. Drake excluded by dedup → should get empty pool → fallback to full Tier 1 pool
      await gen.generate(DEFAULT_INPUT);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(dedupeRepo.getByTarget).toHaveBeenCalledWith('Solana', 5);
    });
  });

  describe('context injection', () => {
    it('includes KEY FACTS section when context is provided', async () => {
      const provider = mockProvider({
        format: 'text_only',
        roastText: 'test',
        meme: null,
      });

      const gen = new MemeGenerator(imgflip, provider, historyRepo, log, [TEST_TEMPLATE]);
      await gen.generate({ ...DEFAULT_INPUT, context: 'SOL TVL dropped 40%, validators = AWS' });

      // eslint-disable-next-line @typescript-eslint/unbound-method
      const prompt = (vi.mocked(provider.run).mock.calls[0]![1] as { prompt: string }).prompt;
      expect(prompt).toContain('KEY FACTS');
      expect(prompt).toContain('SOL TVL dropped 40%');
    });

    it('truncates context longer than 500 chars', async () => {
      const provider = mockProvider({
        format: 'text_only',
        roastText: 'test',
        meme: null,
      });

      const longContext = 'x'.repeat(600);
      const gen = new MemeGenerator(imgflip, provider, historyRepo, log, [TEST_TEMPLATE]);
      await gen.generate({ ...DEFAULT_INPUT, context: longContext });

      // eslint-disable-next-line @typescript-eslint/unbound-method
      const prompt = (vi.mocked(provider.run).mock.calls[0]![1] as { prompt: string }).prompt;
      expect(prompt).not.toContain('x'.repeat(600));
      expect(prompt).toContain('x'.repeat(500) + '...');
    });

    it('omits KEY FACTS when context is empty', async () => {
      const provider = mockProvider({
        format: 'text_only',
        roastText: 'test',
        meme: null,
      });

      const gen = new MemeGenerator(imgflip, provider, historyRepo, log, [TEST_TEMPLATE]);
      await gen.generate({ target: 'Solana', targetType: 'project' });

      // eslint-disable-next-line @typescript-eslint/unbound-method
      const prompt = (vi.mocked(provider.run).mock.calls[0]![1] as { prompt: string }).prompt;
      expect(prompt).not.toContain('KEY FACTS');
    });
  });

  describe('preferStandalone', () => {
    it('excludes meme_plus_text from format choices when preferStandalone is true', async () => {
      const provider = mockProvider({
        format: 'text_only',
        roastText: 'test',
        meme: null,
      });

      const gen = new MemeGenerator(imgflip, provider, historyRepo, log, [TEST_TEMPLATE]);
      await gen.generate({ ...DEFAULT_INPUT, preferStandalone: true });

      // eslint-disable-next-line @typescript-eslint/unbound-method
      const prompt = (vi.mocked(provider.run).mock.calls[0]![1] as { prompt: string }).prompt;
      expect(prompt).toContain('PREFERRED');
      // The TASK section should not offer meme_plus_text as a choice
      const taskSection = prompt.split('## TASK:')[1]!.split('## RULES:')[0]!;
      expect(taskSection).not.toContain('meme_plus_text');
    });

    it('biases toward meme_only when roastText is provided', async () => {
      const provider = mockProvider({
        format: 'text_only',
        roastText: 'test',
        meme: null,
      });

      const gen = new MemeGenerator(imgflip, provider, historyRepo, log, [TEST_TEMPLATE]);
      await gen.generate({ ...DEFAULT_INPUT, roastText: 'existing roast' });

      // eslint-disable-next-line @typescript-eslint/unbound-method
      const prompt = (vi.mocked(provider.run).mock.calls[0]![1] as { prompt: string }).prompt;
      expect(prompt).toContain('PREFERRED');
      expect(prompt).toContain('Roast text already exists');
    });
  });

  describe('isConfigured', () => {
    it('delegates to imgflip client', () => {
      const gen = new MemeGenerator(imgflip, mockProvider({}), historyRepo, log);
      expect(gen.isConfigured).toBe(true);

      const unconfigured = mockImgflip(false);
      const gen2 = new MemeGenerator(unconfigured, mockProvider({}), historyRepo, log);
      expect(gen2.isConfigured).toBe(false);
    });
  });
});
