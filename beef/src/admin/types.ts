import type { FeedbackRepository } from '@storage/repositories/feedback.repository.js';
import type { ProviderManager } from '@agent/provider-manager.js';
import type { Logger } from 'pino';

export interface BotDependencies {
  token: string;
  adminIds: number[];
  feedbackRepo: FeedbackRepository;
  provider: ProviderManager | null;
  logger: Logger;
}
