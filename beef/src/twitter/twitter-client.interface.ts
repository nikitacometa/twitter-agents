import type { TweetMetrics } from '@common/types/index.js';

export interface PostResult {
  tweetId: string;
}

export interface MentionData {
  tweetId: string;
  authorId: string;
  authorName: string;
  text: string;
}

export interface ITwitterClient {
  get isConfigured(): boolean;
  postTweet(text: string): Promise<PostResult | null>;
  replyToTweet(text: string, replyToId: string): Promise<PostResult | null>;
  getMentions(sinceId?: string): Promise<MentionData[]>;
  getTweetMetrics(tweetIds: string[]): Promise<Map<string, TweetMetrics>>;
}
