import type { Logger } from 'pino';
import type { IProfileFetcher, TwitterProfile } from './twitter-client.interface.js';
import type { TargetRepository } from '@storage/repositories/target.repository.js';

const DEFAULT_TTL_HOURS = 24;

export class CachedProfileFetcher implements IProfileFetcher {
  private readonly inner: IProfileFetcher;
  private readonly targetRepo: TargetRepository;
  private readonly logger: Logger;
  private readonly ttlMs: number;

  constructor(opts: {
    inner: IProfileFetcher;
    targetRepo: TargetRepository;
    logger: Logger;
    ttlHours?: number;
  }) {
    this.inner = opts.inner;
    this.targetRepo = opts.targetRepo;
    this.logger = opts.logger;
    this.ttlMs = (opts.ttlHours ?? DEFAULT_TTL_HOURS) * 60 * 60 * 1000;
  }

  async getProfile(username: string): Promise<TwitterProfile | null> {
    const cached = this.targetRepo.getByName(username.toLowerCase());

    if (cached && !this.isStale(cached.lastEnriched)) {
      this.logger.debug({ username, cachedAt: cached.lastEnriched }, 'Profile served from cache');
      return hydrateProfile(cached.data, username);
    }

    const profile = await this.inner.getProfile(username);
    if (!profile) return null;

    this.targetRepo.upsert(username.toLowerCase(), 'person', {
      username: profile.username,
      biography: profile.biography,
      followersCount: profile.followersCount,
      isVerified: profile.isVerified,
      website: profile.website,
      recentTweets: profile.recentTweets,
    });

    this.logger.debug({ username, followers: profile.followersCount }, 'Profile cached');
    return profile;
  }

  private isStale(lastEnriched: string): boolean {
    const enrichedAt = new Date(lastEnriched + 'Z').getTime();
    return Date.now() - enrichedAt > this.ttlMs;
  }
}

function hydrateProfile(data: Record<string, unknown>, fallbackUsername: string): TwitterProfile {
  return {
    username: (data['username'] as string) ?? fallbackUsername,
    biography: (data['biography'] as string) ?? null,
    followersCount: (data['followersCount'] as number) ?? null,
    isVerified: (data['isVerified'] as boolean) ?? false,
    website: (data['website'] as string) ?? null,
    recentTweets: (data['recentTweets'] as string[]) ?? [],
  };
}
