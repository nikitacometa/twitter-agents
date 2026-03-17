import type { HumanVerdict } from '@common/types/index.js';
import type { FeedbackRepository } from '@storage/repositories/feedback.repository.js';
import type { ProviderManager } from '@agent/provider-manager.js';
import type { Logger } from 'pino';

export interface SessionVariant {
  text: string;
  angle: string;
  score: number;
  promptVariant?: string;
  messageId?: number;
}

export interface RoastSession {
  id: string;
  targetName: string;
  source: 'generate' | 'manual';
  variants: SessionVariant[];
  /** evaluatorTelegramId → variantIndex → verdict */
  ratings: Map<number, Map<number, HumanVerdict>>;
  chatId: number;
  createdAt: Date;
}

export interface BotDependencies {
  token: string;
  adminIds: number[];
  feedbackRepo: FeedbackRepository;
  provider: ProviderManager | null;
  logger: Logger;
}
