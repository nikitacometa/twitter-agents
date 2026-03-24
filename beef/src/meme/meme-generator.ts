import type { Logger } from 'pino';
import type { LLMProvider, AgentResult } from '@agent/agent.types.js';
import type { TargetType } from '@common/types/index.js';
import { getErrorMessage } from '@common/utils/error.util.js';
import type { ImgflipClient } from './imgflip-client.js';
import { type MemeTemplate, MEME_TEMPLATES, getTemplateById } from './meme-templates.js';
import type { MemeHistoryRepository } from './meme-history.repository.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export type MemeFormat = 'meme_only' | 'meme_plus_text' | 'text_only';

export interface MemeInput {
  target: string;
  targetType: TargetType;
  /** Existing roast text — if provided, meme complements it. */
  roastText?: string;
  /** Additional context: tweet text, research notes, etc. */
  context?: string;
}

export interface MemeOutput {
  format: MemeFormat;
  /** Tweet text: caption (meme_only), roast (meme_plus_text), or full roast (text_only). */
  tweetText: string;
  meme: {
    imageUrl: string;
    localPath: string;
    templateId: string;
    templateName: string;
    boxes: string[];
    rationale: string;
  } | null;
}

/** Raw LLM output schema. */
interface LlmMemeOutput {
  format: MemeFormat;
  roastText?: string;
  caption?: string;
  meme: {
    templateId: string;
    boxes: string[];
    rationale: string;
  } | null;
}

// ─── Filter ──────────────────────────────────────────────────────────────────

interface FilterResult {
  passed: boolean;
  reason?: string;
}

function filterMemeBoxes(boxes: string[], template: MemeTemplate): FilterResult {
  if (boxes.length !== template.boxCount) {
    return { passed: false, reason: `box count mismatch: got ${String(boxes.length)}, need ${String(template.boxCount)}` };
  }
  for (let i = 0; i < boxes.length; i++) {
    const box = boxes[i]!;
    if (box.length === 0) {
      // Allow empty boxes for templates where it's natural (e.g., Laughing Leo box 2)
      continue;
    }
    if (box.length > template.charLimit + 10) {
      return { passed: false, reason: `box ${String(i)} too long: ${String(box.length)} chars (limit ${String(template.charLimit)})` };
    }
    const wordCount = box.split(/\s+/).length;
    if (wordCount > 15) {
      return { passed: false, reason: `box ${String(i)} too many words: ${String(wordCount)}` };
    }
  }
  return { passed: true };
}

// ─── Prompt ──────────────────────────────────────────────────────────────────

function buildMemePrompt(
  input: MemeInput,
  templates: MemeTemplate[],
  recentlyUsed: string[],
): string {
  const templateList = templates
    .map((t) => {
      const examplesStr = t.examples
        .map((e) => `    "${e.boxes.join('" | "')}" (${e.context})`)
        .join('\n');
      return [
        `[${t.id}] ${t.name} (${String(t.boxCount)} boxes, max ${String(t.charLimit)} chars/box)`,
        `  Structure: ${t.structure}`,
        `  Tone: ${t.tone.join(', ')}`,
        `  Best for: ${t.bestFor}`,
        `  Anti-patterns: ${t.antiPatterns}`,
        `  Examples:`,
        examplesStr,
      ].join('\n');
    })
    .join('\n\n');

  const recentSection = recentlyUsed.length > 0
    ? `\n## RECENTLY USED TEMPLATES (avoid these unless PERFECT fit):\n${recentlyUsed.join(', ')}\n`
    : '';

  const targetSection = [
    `Target: ${input.target}`,
    `Type: ${input.targetType}`,
    input.context ? `Context: ${input.context}` : '',
    input.roastText ? `\nExisting roast text:\n"${input.roastText}"` : '',
  ].filter(Boolean).join('\n');

  return `You are a meme generator for a crypto roast bot (@0xBeefer). Create the funniest, most savage meme possible.

## AVAILABLE TEMPLATES:

${templateList}
${recentSection}
## TARGET:

${targetSection}

## TASK:

Choose the best format for this target:

1. **meme_only** — the meme IS the entire post. Tweet text is just a short caption (max 30 chars) or empty string.
   Use when: the visual format perfectly captures the joke. No text needed.

2. **meme_plus_text** — meme adds a DIFFERENT comedic angle than the roast text.
   Use when: existing roast text is good AND a meme can add something the text doesn't say.
   CRITICAL: the meme must NOT repeat the roast text. It attacks from a different angle.
   ${input.roastText ? 'Roast text is provided — use it as tweetText and create a complementary meme.' : 'Generate both roast text AND meme.'}

3. **text_only** — no meme needed, text is self-sufficient.
   Use when: the roast is highly specific with numbers/data that doesn't fit a meme template.

Then select the template and write box text.

## RULES:
- Each box: max chars per template's limit, max 8-10 words
- Boxes must follow the template's STRUCTURE exactly
- Be SPECIFIC to this target — no generic crypto humor
- Box text: lowercase, CT slang ok, no hashtags, no emoji
- If meme_plus_text: meme must attack from a DIFFERENT angle than roast text

## OUTPUT (JSON only, no other text):
{
  "format": "meme_only" | "meme_plus_text" | "text_only",
  "roastText": "tweet text for meme_plus_text, or omit for meme_only",
  "caption": "short caption for meme_only format, or omit",
  "meme": {
    "templateId": "ID from the list above",
    "boxes": ["box 1 text", "box 2 text"],
    "rationale": "why this template fits"
  }
}

If format is text_only, set meme to null and provide roastText.`;
}

// ─── Generator ───────────────────────────────────────────────────────────────

export class MemeGenerator {
  private readonly templates: MemeTemplate[];

  constructor(
    private readonly imgflip: ImgflipClient,
    private readonly provider: LLMProvider,
    private readonly historyRepo: MemeHistoryRepository,
    private readonly logger: Logger,
    templates?: MemeTemplate[],
  ) {
    this.templates = templates ?? MEME_TEMPLATES;
  }

  get isConfigured(): boolean {
    return this.imgflip.isConfigured;
  }

  async generate(input: MemeInput): Promise<MemeOutput> {
    const recentlyUsed = this.historyRepo.getRecentTemplateNames(15);
    const prompt = buildMemePrompt(input, this.templates, recentlyUsed);

    // LLM call
    const result: AgentResult<LlmMemeOutput> = await this.provider.run('meme-generate', {
      prompt,
      profile: 'meme-generate',
      requiresResearch: false,
    });

    const llmOutput = result.data;

    // Handle text_only
    if (llmOutput.format === 'text_only' || !llmOutput.meme) {
      return {
        format: 'text_only',
        tweetText: llmOutput.roastText ?? input.roastText ?? '',
        meme: null,
      };
    }

    // Validate template exists
    const template = getTemplateById(llmOutput.meme.templateId);
    if (!template) {
      this.logger.warn(
        { templateId: llmOutput.meme.templateId },
        'LLM selected unknown template — falling back to text_only',
      );
      return {
        format: 'text_only',
        tweetText: llmOutput.roastText ?? llmOutput.caption ?? input.roastText ?? '',
        meme: null,
      };
    }

    // Pre-filter boxes
    const filterResult = filterMemeBoxes(llmOutput.meme.boxes, template);
    if (!filterResult.passed) {
      this.logger.warn(
        { reason: filterResult.reason, template: template.name, boxes: llmOutput.meme.boxes },
        'Meme boxes failed pre-filter — falling back to text_only',
      );
      return {
        format: 'text_only',
        tweetText: llmOutput.roastText ?? llmOutput.caption ?? input.roastText ?? '',
        meme: null,
      };
    }

    // Generate image via Imgflip
    let imageUrl: string;
    let localPath: string;
    try {
      const captionResult = await this.imgflip.captionImage(template.id, llmOutput.meme.boxes);
      imageUrl = captionResult.url;
      localPath = await this.imgflip.downloadToTmp(imageUrl);
    } catch (error) {
      this.logger.error(
        { err: error, template: template.name },
        `Imgflip API failed: ${getErrorMessage(error)}`,
      );
      return {
        format: 'text_only',
        tweetText: llmOutput.roastText ?? llmOutput.caption ?? input.roastText ?? '',
        meme: null,
      };
    }

    // Determine tweet text based on format
    let tweetText: string;
    if (llmOutput.format === 'meme_only') {
      tweetText = llmOutput.caption ?? '';
    } else {
      tweetText = llmOutput.roastText ?? input.roastText ?? '';
    }

    // Save to history
    this.historyRepo.insert({
      templateId: template.id,
      templateName: template.name,
      target: input.target,
      boxes: llmOutput.meme.boxes,
      format: llmOutput.format,
      imageUrl,
      rationale: llmOutput.meme.rationale,
    });

    this.logger.info(
      {
        format: llmOutput.format,
        template: template.name,
        target: input.target,
        durationMs: result.durationMs,
      },
      'Meme generated successfully',
    );

    return {
      format: llmOutput.format,
      tweetText,
      meme: {
        imageUrl,
        localPath,
        templateId: template.id,
        templateName: template.name,
        boxes: llmOutput.meme.boxes,
        rationale: llmOutput.meme.rationale,
      },
    };
  }

  async generateVariants(input: MemeInput, count: number): Promise<MemeOutput[]> {
    const results: MemeOutput[] = [];
    for (let i = 0; i < count; i++) {
      try {
        const result = await this.generate(input);
        if (result.meme) {
          results.push(result);
        }
      } catch (error) {
        this.logger.warn(
          { err: error, variant: i },
          `Meme variant ${String(i)} failed: ${getErrorMessage(error)}`,
        );
      }
    }
    return results;
  }
}
