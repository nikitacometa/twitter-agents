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
  /** Roast angle (DATA_BOMB, COMPARISON, etc.) — narrows template selection. */
  roastAngle?: string;
  /** When true, exclude meme_plus_text — force meme_only or text_only. */
  preferStandalone?: boolean;
  /** When true, meme is a visual reply to a specific tweet — prompt emphasizes tweet content. */
  isTweetResponse?: boolean;
  /** Stockpile entry ID — saved to meme_history for traceability. */
  stockpileId?: number;
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
  /** Set when format was downgraded from meme to text_only due to an error. */
  degradationReason?: 'unknown_template' | 'box_filter_failed' | 'imgflip_error' | 'invalid_llm_output';
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

// ─── Angle→Template Mapping ──────────────────────────────────────────────────

/**
 * Maps roast angles to compatible template IDs.
 * Reduces 43 templates to 6-10 per angle, eliminating LLM decision fatigue.
 */
const ANGLE_TEMPLATE_MAP: Record<string, string[]> = {
  // Is This A Pigeon, Change My Mind, Two Buttons, Panik Kalm Panik
  DATA_BOMB: ['100777631', '129242436', '87743020', '226297822'],
  // Drake, Tuxedo Winnie, Same Picture, Distracted Boyfriend
  COMPARISON: ['181913649', '178591752', '180190441', '112126428'],
  // This Is Fine, Roll Safe, Hide Pain Harold
  UNDERSTATEMENT: ['55311130', '89370399', '27813981'],
  // Disaster Girl, Laughing Leo, Woman Yelling At Cat
  FAKE_COMPLIMENT: ['97984', '259237855', '188390779'],
  // Batman Slapping Robin, Woman Yelling At Cat, Always Has Been
  QUOTE_FLIP: ['438680', '188390779', '252600902'],
  // This Is Fine, Hide Pain Harold, Roll Safe
  SELF_AWARE: ['55311130', '27813981', '89370399'],
  // Change My Mind, Roll Safe, Always Has Been, UNO Draw 25
  RHETORICAL: ['129242436', '89370399', '252600902', '217743513'],
  // Two Buttons, Panik Kalm Panik, Bike Fall, Distracted Boyfriend
  RULE_OF_THREE: ['87743020', '226297822', '79132341', '112126428'],
  // Trade Offer, Drake, Batman Slapping Robin, Spiderman Pointing
  HYPOCRISY: ['309868304', '181913649', '438680', '110133729'],
  // Anakin Padme 4 Panel, Surprised Pikachu, Monkey Puppet
  BETRAYAL: ['322841258', '155067746', '148909805'],
};

function filterTemplatesByAngle(
  allTemplates: MemeTemplate[],
  angle?: string,
  excludeIds?: string[],
): MemeTemplate[] {
  const excludeSet = new Set(excludeIds ?? []);

  let pool: MemeTemplate[];
  if (angle) {
    const ids = ANGLE_TEMPLATE_MAP[angle.toUpperCase()];
    if (ids) {
      const idSet = new Set(ids);
      pool = allTemplates.filter((t) => idSet.has(t.id));
    } else {
      // Unknown angle — fallback to Tier 1 only
      pool = allTemplates.filter((t) => t.tier === 1);
    }
  } else {
    // No angle — Tier 1 only
    pool = allTemplates.filter((t) => t.tier === 1);
  }

  // Exclude previously used templates for this target
  const filtered = pool.filter((t) => !excludeSet.has(t.id));

  // If exclusion removed everything, return original pool
  return filtered.length > 0 ? filtered : pool;
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

  // Truncate context — keep enough for specific numbers/facts (the core of good memes)
  const truncatedContext = input.context
    ? input.context.length > 1500
      ? input.context.slice(0, 1500) + '...'
      : input.context
    : '';

  const targetSection = [
    `Target: ${input.target}`,
    `Type: ${input.targetType}`,
    input.roastText ? `\nExisting roast text:\n"${input.roastText}"` : '',
  ].filter(Boolean).join('\n');

  const contextSection = truncatedContext
    ? `\n## KEY FACTS (use specific numbers/data in box text — numbers hit harder than words):\n${truncatedContext}\n`
    : '';

  const tweetSection = input.isTweetResponse ? `
## TWEET RESPONSE MODE:
This meme is a REPLY to a specific tweet. The meme MUST respond to the tweet's content, claims, or absurdity.
- Reference what the person actually said — not generic takes about them
- The viewer should understand the joke by seeing the tweet + your meme together
- Pick a template that creates contrast with or commentary on the tweet's claim
` : '';

  return `You are a meme generator for a crypto roast bot (@0xBeefer). Create the funniest, most savage meme possible.

## AVAILABLE TEMPLATES:

${templateList}
${recentSection}${contextSection}${tweetSection}
## TARGET:

${targetSection}

## TASK:

Choose the best format:
${input.preferStandalone ? `
1. **meme_only** (PREFERRED) — the meme IS the roast. Caption: 1-5 words or empty. The image speaks for itself.
   This is the strongest format when the template perfectly captures the joke.

2. **text_only** — no meme needed. Only if NO template fits this specific roast.
` : input.roastText ? `
1. **meme_only** (PREFERRED) — the meme IS a standalone visual joke. Caption: 1-5 words or empty.
   Roast text already exists — your meme should be a DIFFERENT visual joke posted alongside it.
   Prefer this format. The meme adds a visual angle the text can't.

2. **meme_plus_text** — meme adds a DIFFERENT comedic angle than the roast text.
   CRITICAL: the meme must NOT repeat the roast text. It attacks from a different angle.
   Use the provided roast text as tweetText.

3. **text_only** — no meme needed. Only if NO template fits.
` : `
1. **meme_only** — the meme IS the entire post. Caption: 1-5 words or empty. The image speaks for itself.

2. **meme_plus_text** — generate both roast text AND a complementary meme.
   CRITICAL: text and meme must attack from DIFFERENT angles.

3. **text_only** — no meme needed. Only if NO template fits.
`}
Select the template and write box text.

## RULES:
- Each box: max chars per template's limit, max 8-10 words
- Boxes must follow the template's STRUCTURE exactly
- Be SPECIFIC to this target — use real numbers/data, no generic crypto humor
- Box text: match the template's tone (ALL CAPS for confrontational templates like Batman Slapping, lowercase for chill ones like Roll Safe). CT slang ok. No hashtags, no emoji
- If meme_plus_text: meme must attack from a DIFFERENT angle than roast text

## PERFECT OUTPUT EXAMPLES:

Target: Cardano, Context: "$149K annual revenue, $47B market cap"
{"format":"meme_only","caption":"","meme":{"templateId":"100777631","boxes":["cardano holders","$149K revenue on $47B mcap","is this a blockchain?"],"rationale":"pigeon = misidentification — holders mistake $149K revenue for success"}}

Target: Hyperliquid, Context: "moved $2.5B from bridge to multisig after exploit"
{"format":"meme_only","caption":"decentralization loading","meme":{"templateId":"181913649","boxes":["trustless on-chain bridge","3 of 4 multisig controlled by team"],"rationale":"drake = rejecting good for worse — centralized over decentralized"}}

Target: Terra/Luna, Context: "TVL dropped from $18B to $0 in 3 days"
{"format":"meme_only","caption":"","meme":{"templateId":"55311130","boxes":["$18B tvl evaporating in 72 hours","the algo stablecoin is working as designed"],"rationale":"this-is-fine = denial during catastrophe"}}

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
    // Target-specific dedup: exclude templates already used for this target
    let excludeIds: string[] = [];
    let recentlyUsed: string[] = [];
    try {
      const targetHistory = this.historyRepo.getByTarget(input.target, 5);
      excludeIds = targetHistory.map((h) => h.templateId);
      recentlyUsed = this.historyRepo.getRecentTemplateNames(15);
    } catch (error) {
      this.logger.warn(
        { err: error, target: input.target },
        'Meme history lookup failed — proceeding without dedup',
      );
    }

    // Angle-based filtering: narrow 43 templates to 6-10
    const filteredTemplates = filterTemplatesByAngle(this.templates, input.roastAngle, excludeIds);

    const prompt = buildMemePrompt(input, filteredTemplates, recentlyUsed);

    // LLM call
    const result: AgentResult<LlmMemeOutput> = await this.provider.run('meme-generate', {
      prompt,
      profile: 'meme-generate',
      requiresResearch: false,
    });

    const llmOutput = result.data;

    // Runtime validation — LLM may return unexpected shapes
    const validFormats: MemeFormat[] = ['meme_only', 'meme_plus_text', 'text_only'];
    if (!llmOutput.format || !validFormats.includes(llmOutput.format)) {
      this.logger.warn({ format: llmOutput.format }, 'LLM returned invalid format — falling back to text_only');
      return {
        format: 'text_only',
        tweetText: input.roastText ?? '',
        meme: null,
        degradationReason: 'invalid_llm_output',
      };
    }

    // Handle text_only
    if (llmOutput.format === 'text_only' || !llmOutput.meme) {
      return {
        format: 'text_only',
        tweetText: llmOutput.roastText ?? input.roastText ?? '',
        meme: null,
      };
    }

    // Validate meme structure
    if (!llmOutput.meme.templateId || !Array.isArray(llmOutput.meme.boxes)) {
      this.logger.warn(
        { meme: llmOutput.meme },
        'LLM returned malformed meme object — falling back to text_only',
      );
      return {
        format: 'text_only',
        tweetText: llmOutput.roastText ?? llmOutput.caption ?? input.roastText ?? '',
        meme: null,
        degradationReason: 'invalid_llm_output',
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
        degradationReason: 'unknown_template',
      };
    }

    // Pre-filter boxes (with one retry on failure)
    let boxes = llmOutput.meme.boxes;
    const filterResult = filterMemeBoxes(boxes, template);
    if (!filterResult.passed) {
      // Retry: ask LLM to fix the specific issue
      const retryResult = await this.retryBoxes(input, template, boxes, filterResult.reason ?? 'unknown');
      if (retryResult) {
        boxes = retryResult;
      } else {
        this.logger.warn(
          { reason: filterResult.reason, template: template.name, boxes },
          'Meme boxes failed pre-filter + retry — falling back to text_only',
        );
        return {
          format: 'text_only',
          tweetText: llmOutput.roastText ?? llmOutput.caption ?? input.roastText ?? '',
          meme: null,
          degradationReason: 'box_filter_failed',
        };
      }
    }

    // Generate image via Imgflip
    let imageUrl: string;
    let localPath: string;
    try {
      const captionResult = await this.imgflip.captionImage(template.id, boxes);
      imageUrl = captionResult.url;
      localPath = await this.imgflip.downloadToTmp(imageUrl);
    } catch (error) {
      this.logger.error(
        { err: error, templateId: template.id, templateName: template.name, boxes },
        `Imgflip API failed: ${getErrorMessage(error)}`,
      );
      return {
        format: 'text_only',
        tweetText: llmOutput.roastText ?? llmOutput.caption ?? input.roastText ?? '',
        meme: null,
        degradationReason: 'imgflip_error',
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
      boxes,
      format: llmOutput.format,
      imageUrl,
      rationale: llmOutput.meme.rationale,
      stockpileId: input.stockpileId,
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
        boxes,
        rationale: llmOutput.meme.rationale,
      },
    };
  }

  /** Retry box generation when filter fails — one corrective LLM call. */
  private async retryBoxes(
    input: MemeInput,
    template: MemeTemplate,
    failedBoxes: string[],
    reason: string,
  ): Promise<string[] | null> {
    try {
      const retryPrompt = [
        `Fix the meme boxes for template "${template.name}" (${String(template.boxCount)} boxes, max ${String(template.charLimit)} chars/box).`,
        `Structure: ${template.structure}`,
        `Target: ${input.target}`,
        `Original boxes that failed: ${JSON.stringify(failedBoxes)}`,
        `Failure reason: ${reason}`,
        '',
        'Return ONLY a JSON array of fixed box texts, e.g.: ["box 1", "box 2"]',
      ].join('\n');

      const retryResult: AgentResult<string[]> = await this.provider.run('meme-generate', {
        prompt: retryPrompt,
        profile: 'meme-generate',
        requiresResearch: false,
      });

      if (!Array.isArray(retryResult.data)) return null;

      const retryFilter = filterMemeBoxes(retryResult.data, template);
      if (!retryFilter.passed) {
        this.logger.debug({ reason: retryFilter.reason }, 'Meme box retry also failed filter');
        return null;
      }

      this.logger.info({ template: template.name }, 'Meme box retry succeeded');
      return retryResult.data;
    } catch (error) {
      this.logger.debug({ err: error }, 'Meme box retry failed');
      return null;
    }
  }

  async generateVariants(input: MemeInput, count: number): Promise<MemeOutput[]> {
    const promises = Array.from({ length: count }, (_, i) =>
      this.generate(input).catch((error: unknown) => {
        this.logger.warn(
          { err: error, variant: i },
          `Meme variant ${String(i)} failed: ${getErrorMessage(error)}`,
        );
        return null;
      }),
    );

    const settled = await Promise.all(promises);
    return settled.filter((r): r is MemeOutput => r !== null && r.meme !== null);
  }
}
