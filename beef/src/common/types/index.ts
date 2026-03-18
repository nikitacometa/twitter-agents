// Shared domain types used across all modules.

// --- Roast domain ---

export type TargetType = 'project' | 'token' | 'trend' | 'person';

export type RoastSource = 'autonomous' | 'mention' | 'burn_request' | 'reply_guy';

export type RoastStatus = 'posted' | 'failed' | 'dry_run' | 'pending_approval';

export interface RoastTarget {
  name: string;
  type: TargetType;
  context?: string;
}

export interface RoastVariant {
  text: string;
  score: number;
  angle: string;
}

export interface RoastDraft {
  target: RoastTarget;
  variants: RoastVariant[];
  bestIndex: number;
  researchNotes: string | null;
  factCheckPassed: boolean;
}

export interface PostedRoast {
  id: number;
  targetName: string;
  targetType: TargetType;
  tweetText: string;
  tweetId: string | null;
  source: RoastSource;
  status: RoastStatus;
  factChecked: boolean;
  contextData: string | null;
  agentOutput: string | null;
  createdAt: string;
  likes: number;
  retweets: number;
  replies: number;
  impressions: number;
}

// --- Queue domain ---

export type QueuePriority = 1 | 3 | 5 | 8 | 10;

export type QueueStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'rejected';

export interface QueueItem {
  id: number;
  targetName: string;
  targetType: TargetType;
  source: RoastSource;
  priority: QueuePriority;
  status: QueueStatus;
  context: string | null;
  errorMessage: string | null;
  attempts: number;
  maxAttempts: number;
  createdAt: string;
  updatedAt: string;
}

export interface NewQueueItem {
  targetName: string;
  targetType: TargetType;
  source: RoastSource;
  priority: QueuePriority;
  context?: string;
}

// --- Mention domain ---

export type MentionRequestType = 'roast_request' | 'challenge' | 'reply' | 'other';

export interface Mention {
  id: number;
  tweetId: string;
  authorId: string;
  authorName: string;
  text: string;
  requestType: MentionRequestType | null;
  processed: boolean;
  responseId: string | null;
  createdAt: string;
}

// --- Target profiles ---

export interface TargetProfile {
  id: number;
  name: string;
  type: TargetType;
  data: Record<string, unknown>;
  roastCount: number;
  lastRoasted: string | null;
  lastEnriched: string;
  updatedAt: string;
}

// --- Engagement ---

export interface EngagementSnapshot {
  id: number;
  roastId: number;
  likes: number;
  retweets: number;
  replies: number;
  impressions: number;
  capturedAt: string;
}

// --- News ---

export type NewsSource = 'rss' | 'dexscreener' | 'perplexity' | 'claude_research';

export interface NewsItem {
  id: number;
  source: NewsSource;
  title: string | null;
  content: string;
  url: string | null;
  relevance: number | null;
  usedForRoast: number | null;
  createdAt: string;
}

// --- Users ---

export interface TwitterUser {
  id: number;
  twitterId: string;
  username: string;
  displayName: string | null;
  followerCount: number | null;
  bioSummary: string | null;
  interactionCount: number;
  firstSeen: string;
  lastSeen: string;
  notes: string | null;
}

// --- Human feedback ---

export type HumanVerdict = 'fire' | 'post' | 'iterate' | 'reject';

// --- Creative memory (dynamic few-shot + target history) ---

export interface FireExample {
  text: string;
  angle: string;
  target: string;
}

export interface AngleUsage {
  angle: string;
  count: number;
}

export interface RejectExample {
  text: string;
  angle: string;
  target: string;
}

export interface AngleWeight {
  angle: string;
  weight: number;
}

export interface CreativeMemory {
  fireExamples: FireExample[];
  targetHistory?: {
    roastCount: number;
    angles: AngleUsage[];
  };
  rejectExamples?: RejectExample[];
  styleSupplement?: string;
  angleWeights?: AngleWeight[];
  externalExamples?: FireExample[];
  learnedTechniques?: string[];
}

// --- External examples ---

export type ExternalExampleType = 'post_roast' | 'person_roast' | 'news_roast';

export interface ExternalExample {
  id: number;
  type: ExternalExampleType;
  originalText: string;
  originalAuthor: string | null;
  originalUrl: string | null;
  roastText: string;
  roastAuthor: string | null;
  roastUrl: string | null;
  context: string | null;
  submitterTelegramId: number;
  submitterScore: number | null;
  submitterNotes: string | null;
  analysis: ExampleAnalysis | null;
  extractedPattern: string | null;
  classifiedAngle: string | null;
  specificityScore: number | null;
  createdAt: string;
  usedInPrompts: number;
}

export interface ExampleAnalysis {
  technique: string;
  secondaryTechniques: string[];
  structure: string;
  specificityScore: number;
  whatMakesItWork: string;
  reusablePattern: string;
  dataPointsUsed: string[];
  tone: string;
  lengthCategory: string;
  beefAngleMapping: string;
  adaptationHint: string;
}

export interface RoastPattern {
  id: number;
  patternType: 'structure' | 'technique' | 'angle_variant';
  description: string;
  sourceExampleIds: number[];
  frequency: number;
  effectiveness: number | null;
  createdAt: string;
  updatedAt: string;
}

// --- Config ---

export interface RuntimeConfig {
  paused: boolean;
  dailyLimit: number;
  mentionSinceId: string | null;
  moderationMode: boolean;
}

// --- Tweet observation ---

export type TweetSource = 'mention_poll' | 'search' | 'reply_guy' | 'engagement_track';

export interface ObservedTweet {
  id: number;
  tweetId: string;
  authorId: string;
  authorName: string;
  text: string;
  source: TweetSource;
  metrics: TweetMetrics | null;
  createdAt: string;
  observedAt: string;
}

export interface TweetMetrics {
  likes: number;
  retweets: number;
  replies: number;
  impressions: number;
}
