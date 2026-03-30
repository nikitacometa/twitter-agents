/**
 * Twitter profile enrichment for the roast farm pipeline.
 *
 * Gathers maximum data about a Twitter handle via Scraper or Official API
 * and formats it into a rich profileContext string for the LLM prompt.
 */

import type { Scraper } from '@the-convocation/twitter-scraper';
import type { TwitterApi } from 'twitter-api-v2';
import type { Logger } from 'pino';
import { getErrorMessage } from '@common/utils/error.util.js';
import { expandTcoUrls, expandTcoUrlsByPosition } from '@common/utils/tweet-text.js';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface TwitterEnricherOptions {
  scraper?: Scraper;
  apiClient?: TwitterApi;
  logger: Logger;
  /** Max recent tweets+replies to fetch (default 20) */
  maxTweets?: number;
  /** Max liked tweets to fetch (default 15) */
  maxLikes?: number;
}

export interface EnrichmentResult {
  profileContext: string;
  username: string;
  followersCount: number | null;
  /** Whether any data was successfully fetched */
  hasData: boolean;
}

export class TwitterEnricher {
  private readonly scraper: Scraper | null;
  private readonly apiClient: TwitterApi | null;
  private readonly logger: Logger;
  private readonly maxTweets: number;
  private readonly maxLikes: number;

  constructor(opts: TwitterEnricherOptions) {
    this.scraper = opts.scraper ?? null;
    this.apiClient = opts.apiClient ?? null;
    this.logger = opts.logger;
    this.maxTweets = opts.maxTweets ?? 20;
    this.maxLikes = opts.maxLikes ?? 15;
  }

  get isConfigured(): boolean {
    return this.scraper !== null || this.apiClient !== null;
  }

  /**
   * Enrich a Twitter handle with maximum available data.
   * Tries Scraper first (richer data, no API quota), falls back to Official API.
   */
  async enrich(handle: string): Promise<EnrichmentResult | null> {
    const username = handle.replace(/^@/, '');
    if (!username) return null;

    if (this.scraper) {
      return this.enrichViaScraper(username);
    }

    if (this.apiClient) {
      return this.enrichViaApi(username);
    }

    this.logger.debug({ username }, 'No Twitter client available for enrichment');
    return null;
  }

  // ---------------------------------------------------------------------------
  // Scraper-based enrichment (preferred — richer data, no API quota)
  // ---------------------------------------------------------------------------

  private async enrichViaScraper(username: string): Promise<EnrichmentResult | null> {
    const scraper = this.scraper!;
    const sections: string[] = [];
    let followersCount: number | null = null;

    // --- Call 1: Profile ---
    let pinnedTweetIds: string[] = [];
    try {
      const profile = await scraper.getProfile(username);
      if (!profile) {
        this.logger.warn({ username }, 'Scraper: profile not found');
        return null;
      }

      followersCount = profile.followersCount ?? null;
      pinnedTweetIds = profile.pinnedTweetIds ?? [];

      sections.push(this.formatProfile({
        username: profile.username ?? username,
        displayName: profile.name ?? null,
        bio: profile.biography ?? null,
        followersCount: profile.followersCount ?? null,
        followingCount: profile.followingCount ?? null,
        tweetsCount: profile.tweetsCount ?? null,
        likesCount: profile.likesCount ?? null,
        joined: profile.joined ? new Date(profile.joined).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : null,
        location: profile.location ?? null,
        isBlueVerified: profile.isBlueVerified ?? false,
        website: profile.website ?? null,
      }));

      this.logger.info({ username, followers: followersCount }, 'Enrichment: profile fetched');
    } catch (err) {
      this.logger.warn({ err: getErrorMessage(err), username }, 'Enrichment: profile fetch failed');
    }

    // --- Call 2: Pinned tweet ---
    if (pinnedTweetIds.length > 0) {
      try {
        const pinned = await scraper.getTweet(pinnedTweetIds[0]!);
        if (pinned?.text) {
          sections.push(this.formatPinnedTweet({
            text: expandTcoUrlsByPosition(pinned.text, pinned.urls),
            likes: pinned.likes ?? 0,
            retweets: pinned.retweets ?? 0,
            views: pinned.views ?? 0,
          }));
          this.logger.debug({ username }, 'Enrichment: pinned tweet fetched');
        }
      } catch (err) {
        this.logger.debug({ err: getErrorMessage(err), username }, 'Enrichment: pinned tweet fetch failed');
      }
    }

    // --- Call 3: Recent tweets + replies (most valuable for roast) ---
    const tweets: TweetSnippet[] = [];
    const replies: TweetSnippet[] = [];
    try {
      const iter = scraper.getTweetsAndReplies(username, this.maxTweets);
      let count = 0;
      for await (const tweet of iter) {
        if (count >= this.maxTweets) break;
        if (!tweet.text) { count++; continue; }

        const snippet: TweetSnippet = {
          text: expandTcoUrlsByPosition(tweet.text, tweet.urls),
          likes: tweet.likes ?? 0,
          retweets: tweet.retweets ?? 0,
          views: tweet.views ?? 0,
          isReply: tweet.isReply ?? false,
          replyTo: tweet.inReplyToStatus?.username ?? null,
          timestamp: tweet.timeParsed ?? null,
        };

        if (snippet.isReply) {
          replies.push(snippet);
        } else {
          tweets.push(snippet);
        }
        count++;
      }

      if (tweets.length > 0) {
        sections.push(this.formatTweets(tweets));
      }
      if (replies.length > 0) {
        sections.push(this.formatReplies(replies));
      }

      this.logger.info(
        { username, tweets: tweets.length, replies: replies.length },
        'Enrichment: tweets+replies fetched',
      );
    } catch (err) {
      this.logger.warn({ err: getErrorMessage(err), username }, 'Enrichment: tweets fetch failed');
    }

    // --- Call 4: Liked tweets (affiliations, values) ---
    try {
      const likedTweets: LikedTweetSnippet[] = [];
      const likeIter = scraper.getLikedTweets(username, this.maxLikes);
      let likeCount = 0;
      for await (const tweet of likeIter) {
        if (likeCount >= this.maxLikes) break;
        if (!tweet.text) { likeCount++; continue; }

        likedTweets.push({
          author: tweet.username ?? 'unknown',
          text: expandTcoUrlsByPosition(tweet.text, tweet.urls),
          likes: tweet.likes ?? 0,
        });
        likeCount++;
      }

      if (likedTweets.length > 0) {
        sections.push(this.formatLikedTweets(likedTweets));
      }

      this.logger.info({ username, liked: likedTweets.length }, 'Enrichment: liked tweets fetched');
    } catch (err) {
      // Liked tweets often fail (private likes, restricted endpoint) — not critical
      this.logger.debug({ err: getErrorMessage(err), username }, 'Enrichment: liked tweets fetch failed');
    }

    if (sections.length === 0) return null;

    return {
      profileContext: sections.join('\n\n'),
      username,
      followersCount,
      hasData: true,
    };
  }

  // ---------------------------------------------------------------------------
  // Official API enrichment (fallback — fewer calls, uses API quota)
  // ---------------------------------------------------------------------------

  private async enrichViaApi(username: string): Promise<EnrichmentResult | null> {
    const api = this.apiClient!;
    const sections: string[] = [];
    let followersCount: number | null = null;

    // --- Call 1: Profile + pinned tweet expansion ---
    let userId: string | null = null;
    try {
      const user = await api.v2.userByUsername(username, {
        'user.fields': [
          'created_at', 'description', 'location', 'url', 'verified',
          'verified_type', 'public_metrics', 'pinned_tweet_id',
          'profile_image_url', 'entities',
        ],
        expansions: ['pinned_tweet_id'],
        'tweet.fields': ['text', 'note_tweet', 'entities', 'public_metrics', 'created_at'],
      });

      if (!user.data) {
        this.logger.warn({ username }, 'API: user not found');
        return null;
      }

      userId = user.data.id;
      const metrics = user.data.public_metrics;
      followersCount = metrics?.followers_count ?? null;

      sections.push(this.formatProfile({
        username: user.data.username,
        displayName: user.data.name ?? null,
        bio: user.data.description ?? null,
        followersCount: metrics?.followers_count ?? null,
        followingCount: metrics?.following_count ?? null,
        tweetsCount: metrics?.tweet_count ?? null,
        likesCount: metrics?.like_count ?? null,
        joined: user.data.created_at
          ? new Date(user.data.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
          : null,
        location: user.data.location ?? null,
        isBlueVerified: user.data.verified ?? false,
        website: user.data.url ?? null,
      }));

      // Pinned tweet from expansion (with note_tweet + URL expansion)
      const pinnedTweet = user.includes?.tweets?.[0];
      if (pinnedTweet?.text) {
        const pm = pinnedTweet.public_metrics;
        const pinnedText = pinnedTweet.note_tweet?.text ?? pinnedTweet.text;
        const pinnedUrls = pinnedTweet.note_tweet?.entities?.urls ?? pinnedTweet.entities?.urls;
        sections.push(this.formatPinnedTweet({
          text: expandTcoUrls(pinnedText, pinnedUrls),
          likes: pm?.like_count ?? 0,
          retweets: pm?.retweet_count ?? 0,
          views: pm?.impression_count ?? 0,
        }));
      }

      this.logger.info({ username, followers: followersCount }, 'API enrichment: profile fetched');
    } catch (err) {
      this.logger.warn({ err: getErrorMessage(err), username }, 'API enrichment: profile fetch failed');
      return null;
    }

    // --- Call 2: Recent tweets (all — includes replies and retweets) ---
    if (userId) {
      try {
        const timeline = await api.v2.userTimeline(userId, {
          max_results: 50,
          'tweet.fields': ['text', 'note_tweet', 'entities', 'public_metrics', 'created_at', 'in_reply_to_user_id', 'referenced_tweets'],
          expansions: ['referenced_tweets.id.author_id'],
          'user.fields': ['username'],
        });

        const tweets: TweetSnippet[] = [];
        const replies: TweetSnippet[] = [];

        const refUsers = new Map<string, string>();
        if (timeline.includes?.users) {
          for (const u of timeline.includes.users) {
            refUsers.set(u.id, u.username);
          }
        }

        for (const tweet of timeline.data?.data ?? []) {
          if (!tweet.text) continue;
          const pm = tweet.public_metrics;
          const isReply = !!tweet.in_reply_to_user_id;
          const replyTo = tweet.in_reply_to_user_id ? (refUsers.get(tweet.in_reply_to_user_id) ?? null) : null;
          const tweetText = tweet.note_tweet?.text ?? tweet.text;
          const tweetUrls = tweet.note_tweet?.entities?.urls ?? tweet.entities?.urls;

          const snippet: TweetSnippet = {
            text: expandTcoUrls(tweetText, tweetUrls),
            likes: pm?.like_count ?? 0,
            retweets: pm?.retweet_count ?? 0,
            views: pm?.impression_count ?? 0,
            isReply,
            replyTo,
            timestamp: tweet.created_at ? new Date(tweet.created_at) : null,
          };

          if (isReply) {
            replies.push(snippet);
          } else {
            tweets.push(snippet);
          }
        }

        if (tweets.length > 0) sections.push(this.formatTweets(tweets.slice(0, 15)));
        if (replies.length > 0) sections.push(this.formatReplies(replies.slice(0, 10)));

        this.logger.info(
          { username, tweets: tweets.length, replies: replies.length },
          'API enrichment: timeline fetched',
        );
      } catch (err) {
        this.logger.warn({ err: getErrorMessage(err), username }, 'API enrichment: timeline fetch failed');
      }
    }

    // --- Call 3: Liked tweets ---
    if (userId) {
      try {
        const liked = await api.v2.userLikedTweets(userId, {
          max_results: this.maxLikes,
          'tweet.fields': ['text', 'note_tweet', 'entities', 'public_metrics', 'author_id'],
          expansions: ['author_id'],
          'user.fields': ['username'],
        });

        const likedUsers = new Map<string, string>();
        if (liked.includes?.users) {
          for (const u of liked.includes.users) {
            likedUsers.set(u.id, u.username);
          }
        }

        const likedTweets: LikedTweetSnippet[] = [];
        for (const tweet of liked.data?.data ?? []) {
          if (!tweet.text) continue;
          const likedText = tweet.note_tweet?.text ?? tweet.text;
          const likedUrls = tweet.note_tweet?.entities?.urls ?? tweet.entities?.urls;
          likedTweets.push({
            author: tweet.author_id ? (likedUsers.get(tweet.author_id) ?? 'unknown') : 'unknown',
            text: expandTcoUrls(likedText, likedUrls),
            likes: tweet.public_metrics?.like_count ?? 0,
          });
        }

        if (likedTweets.length > 0) {
          sections.push(this.formatLikedTweets(likedTweets));
        }

        this.logger.info({ username, liked: likedTweets.length }, 'API enrichment: liked tweets fetched');
      } catch (err) {
        this.logger.debug({ err: getErrorMessage(err), username }, 'API enrichment: liked tweets fetch failed');
      }
    }

    if (sections.length === 0) return null;

    return {
      profileContext: sections.join('\n\n'),
      username,
      followersCount,
      hasData: true,
    };
  }

  // ---------------------------------------------------------------------------
  // Formatters — structured text for the LLM prompt
  // ---------------------------------------------------------------------------

  private formatProfile(p: ProfileData): string {
    const lines = [`TWITTER PROFILE: @${p.username}`];
    if (p.displayName) lines.push(`Display Name: ${p.displayName}`);
    if (p.bio) lines.push(`Bio: "${p.bio}"`);

    const stats: string[] = [];
    if (p.followersCount !== null) stats.push(`${formatNum(p.followersCount)} followers`);
    if (p.followingCount !== null) stats.push(`${formatNum(p.followingCount)} following`);
    if (p.tweetsCount !== null) stats.push(`${formatNum(p.tweetsCount)} tweets`);
    if (p.likesCount !== null) stats.push(`${formatNum(p.likesCount)} likes`);
    if (stats.length > 0) lines.push(`Stats: ${stats.join(' | ')}`);

    if (p.joined) lines.push(`Joined: ${p.joined}`);
    if (p.location) lines.push(`Location: ${p.location}`);
    if (p.isBlueVerified) lines.push('Verified: Blue (paid subscription)');
    if (p.website) lines.push(`Website: ${p.website}`);

    // Compute ratio for roast material
    if (p.followersCount !== null && p.followingCount !== null && p.followingCount > 0) {
      const ratio = p.followersCount / p.followingCount;
      if (ratio < 0.5) {
        lines.push(`Follower/Following ratio: ${ratio.toFixed(2)} (follows way more than followed back)`);
      } else if (ratio > 10) {
        lines.push(`Follower/Following ratio: ${ratio.toFixed(0)}x (significant reach)`);
      }
    }

    return lines.join('\n');
  }

  private formatPinnedTweet(t: { text: string; likes: number; retweets: number; views: number }): string {
    const metrics = [
      `${formatNum(t.likes)} likes`,
      `${formatNum(t.retweets)} RTs`,
      t.views > 0 ? `${formatNum(t.views)} views` : null,
    ].filter(Boolean).join(', ');

    return `PINNED TWEET (what they consider their best):\n"${truncate(t.text, 500)}" (${metrics})`;
  }

  private formatTweets(tweets: TweetSnippet[]): string {
    const lines = [`RECENT ORIGINAL TWEETS (${String(tweets.length)} most recent):`];
    for (let i = 0; i < tweets.length; i++) {
      const t = tweets[i]!;
      const age = t.timestamp ? timeAgo(t.timestamp) : '';
      const metrics = `${formatNum(t.likes)} likes, ${formatNum(t.retweets)} RTs`;
      const ageStr = age ? ` — ${age}` : '';
      lines.push(`${String(i + 1)}. "${truncate(t.text, 280)}" (${metrics}${ageStr})`);
    }
    return lines.join('\n');
  }

  private formatReplies(replies: TweetSnippet[]): string {
    const lines = [`RECENT REPLIES (who they interact with, ${String(replies.length)} samples):`];
    for (let i = 0; i < Math.min(replies.length, 10); i++) {
      const r = replies[i]!;
      const target = r.replyTo ? `@${r.replyTo}` : 'someone';
      const age = r.timestamp ? timeAgo(r.timestamp) : '';
      const ageStr = age ? ` — ${age}` : '';
      lines.push(`${String(i + 1)}. -> ${target}: "${truncate(r.text, 250)}"${ageStr}`);
    }
    return lines.join('\n');
  }

  private formatLikedTweets(likes: LikedTweetSnippet[]): string {
    const lines = [`RECENTLY LIKED TWEETS (what they endorse/value, ${String(likes.length)} samples):`];
    for (let i = 0; i < likes.length; i++) {
      const l = likes[i]!;
      lines.push(`${String(i + 1)}. @${l.author}: "${truncate(l.text, 250)}"`);
    }
    return lines.join('\n');
  }
}

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface ProfileData {
  username: string;
  displayName: string | null;
  bio: string | null;
  followersCount: number | null;
  followingCount: number | null;
  tweetsCount: number | null;
  likesCount: number | null;
  joined: string | null;
  location: string | null;
  isBlueVerified: boolean;
  website: string | null;
}

interface TweetSnippet {
  text: string;
  likes: number;
  retweets: number;
  views: number;
  isReply: boolean;
  replyTo: string | null;
  timestamp: Date | null;
}

interface LikedTweetSnippet {
  author: string;
  text: string;
  likes: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function truncate(text: string, maxLen: number): string {
  const clean = text.replace(/\n/g, ' ').trim();
  if (clean.length <= maxLen) return clean;
  return clean.slice(0, maxLen - 3) + '...';
}

function timeAgo(date: Date): string {
  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);

  if (diffMin < 60) return `${String(diffMin)}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${String(diffH)}h ago`;
  const diffD = Math.floor(diffH / 24);
  return `${String(diffD)}d ago`;
}
