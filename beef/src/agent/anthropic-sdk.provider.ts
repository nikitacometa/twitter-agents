import { readFile } from 'node:fs/promises';
import Anthropic from '@anthropic-ai/sdk';
import type { Logger } from 'pino';
import type { LlmLogRepository } from '@storage/repositories/llm-log.repository.js';
import { getErrorMessage } from '@common/utils/error.util.js';
import type {
  AgentResult,
  AgentTask,
  LLMProvider,
  ProviderCapabilities,
  ProviderName,
} from './agent.types.js';

const MODEL = 'claude-sonnet-4-20250514';
const DEFAULT_MAX_TOKENS = 4096;
export class AnthropicSDKProvider implements LLMProvider {
  readonly name: ProviderName = 'anthropic-sdk';
  readonly capabilities: ProviderCapabilities = {
    hasPerplexity: false,
    hasWebSearch: false,
    hasFileAccess: false,
    maxTurns: 1,
  };

  private readonly client: Anthropic;

  constructor(
    apiKey: string,
    private readonly logger: Logger,
    private readonly logRepo: LlmLogRepository,
  ) {
    this.client = new Anthropic({ apiKey });
  }

  async run<T>(taskId: string, task: AgentTask): Promise<AgentResult<T>> {
    const start = Date.now();

    try {
      const content = await this.buildMessageContent(task);
      const response = await this.client.messages.create({
        model: MODEL,
        max_tokens: DEFAULT_MAX_TOKENS,
        messages: [{ role: 'user', content }],
      });

      const rawText = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map((block) => block.text)
        .join('');

      // Strip markdown code fences (```json ... ``` or ``` ... ```)
      const text = rawText.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();

      let data: T;
      try {
        data = JSON.parse(text) as T;
      } catch {
        this.logger.error({ taskId, rawText: rawText.slice(0, 500) }, 'Failed to parse LLM JSON response');
        throw new Error(`[${taskId}] Invalid JSON from Anthropic SDK: ${text.slice(0, 100)}`);
      }
      const durationMs = Date.now() - start;

      this.logger.info(
        { taskId, durationMs, provider: this.name, inputTokens: response.usage.input_tokens },
        'SDK task completed',
      );
      this.logRepo.insert({
        taskId,
        taskType: this.name,
        prompt: task.prompt,
        response: text,
        durationMs,
      });

      return { data, durationMs, provider: this.name };
    } catch (error) {
      const durationMs = Date.now() - start;
      this.logger.error(
        { err: error, taskId, durationMs },
        `Anthropic SDK provider failed: ${getErrorMessage(error)}`,
      );
      throw error;
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.client.messages.create({
        model: MODEL,
        max_tokens: 32,
        messages: [{ role: 'user', content: 'Reply with exactly: {"status":"ok"}' }],
      });
      return response.content.length > 0;
    } catch (error) {
      this.logger.warn(
        { err: error },
        `Anthropic SDK health check failed: ${getErrorMessage(error)}`,
      );
      return false;
    }
  }

  private async buildMessageContent(
    task: AgentTask,
  ): Promise<string | Anthropic.MessageCreateParams['messages'][0]['content']> {
    if (!task.imagePaths?.length) return task.prompt;

    const blocks: Anthropic.ContentBlockParam[] = [
      { type: 'text', text: task.prompt },
    ];

    for (const imgPath of task.imagePaths) {
      try {
        const data = await readFile(imgPath);
        const ext = imgPath.endsWith('.png') ? 'png' : 'jpeg';
        blocks.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: `image/${ext}`,
            data: data.toString('base64'),
          },
        });
      } catch (error) {
        this.logger.debug({ err: error, imgPath }, 'Failed to read image for SDK — skipping');
      }
    }

    return blocks;
  }

  shutdown(): void {
    // SDK has no persistent connections to clean up
  }
}

export function createAnthropicSDKProvider(
  apiKey: string | undefined,
  logger: Logger,
  logRepo: LlmLogRepository,
): AnthropicSDKProvider | null {
  if (!apiKey) {
    logger.info('ANTHROPIC_API_KEY not set — SDK fallback disabled');
    return null;
  }
  return new AnthropicSDKProvider(apiKey, logger, logRepo);
}
