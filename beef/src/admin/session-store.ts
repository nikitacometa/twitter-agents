import { randomBytes } from 'node:crypto';
import type { RoastSession, SessionVariant } from './types.js';
import type { HumanVerdict } from '@common/types/index.js';

const SESSION_TTL_MS = 60 * 60 * 1000; // 1 hour

export class SessionStore {
  private readonly sessions = new Map<string, RoastSession>();

  createSession(
    targetName: string,
    source: 'generate' | 'manual',
    variants: SessionVariant[],
    chatId: number,
  ): RoastSession {
    this.cleanup();
    const id = randomBytes(4).toString('hex');
    const session: RoastSession = {
      id,
      targetName,
      source,
      variants,
      ratings: new Map(),
      chatId,
      createdAt: new Date(),
    };
    this.sessions.set(id, session);
    return session;
  }

  get(id: string): RoastSession | undefined {
    return this.sessions.get(id);
  }

  addRating(sessionId: string, evaluatorId: number, variantIdx: number, verdict: HumanVerdict): boolean {
    const session = this.sessions.get(sessionId);
    if (!session || variantIdx < 0 || variantIdx >= session.variants.length) return false;

    let evaluatorRatings = session.ratings.get(evaluatorId);
    if (!evaluatorRatings) {
      evaluatorRatings = new Map();
      session.ratings.set(evaluatorId, evaluatorRatings);
    }
    evaluatorRatings.set(variantIdx, verdict);
    return true;
  }

  getRating(sessionId: string, evaluatorId: number, variantIdx: number): HumanVerdict | undefined {
    return this.sessions.get(sessionId)?.ratings.get(evaluatorId)?.get(variantIdx);
  }

  delete(id: string): void {
    this.sessions.delete(id);
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [id, session] of this.sessions) {
      if (now - session.createdAt.getTime() > SESSION_TTL_MS) {
        this.sessions.delete(id);
      }
    }
  }
}
