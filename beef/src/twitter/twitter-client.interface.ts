import type { TweetMetrics } from '@common/types/index.js';

export interface PostResult {
  tweetId: string;
}

export interface MentionData {
  tweetId: string;
  authorId: string;
  authorName: string;
  text: string;
  /** The tweet this mention is replying to (if any). */
  inReplyToTweetId?: string;
  /** Full text of the parent tweet (when available from API response). */
  parentTweetText?: string;
  /** Author username of the parent tweet. */
  parentAuthorName?: string;
  /** Image URLs attached to the parent tweet. */
  parentMediaUrls?: string[];
}

export interface ITwitterClient {
  get isConfigured(): boolean;
  postTweet(text: string): Promise<PostResult | null>;
  replyToTweet(text: string, replyToId: string): Promise<PostResult | null>;
  getMentions(sinceId?: string): Promise<MentionData[]>;
  getTweetMetrics(tweetIds: string[]): Promise<Map<string, TweetMetrics>>;
  shutdown?(): Promise<void>;
}
