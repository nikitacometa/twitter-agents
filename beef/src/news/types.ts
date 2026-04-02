// News roast pipeline domain types.

import type { MonitorTier } from '@monitor/monitor-targets.js';

// --- News event (accumulated from timeline monitor) ---

export interface NewsEvent {
  id: number;
  tweetId: string;
  authorHandle: string;
  authorTier: MonitorTier;
  tweetText: string;
  tweetUrl: string;
  monitorScore: number;
  followersK: number;
  isReply: boolean;
  storyId: string | null;
  storyLabel: string | null;
  roastability: number | null;
  usedInDigest: boolean;
  createdAt: string;
}

export interface InsertNewsEvent {
  tweetId: string;
  authorHandle: string;
  authorTier: MonitorTier;
  tweetText: string;
  tweetUrl: string;
  monitorScore: number;
  followersK: number;
  isReply: boolean;
}

// --- News story (output of Phase 2 research) ---

export interface StoryAmmunition {
  quotes: string[];
  contradictions: string[];
  numbers: string[];
  targetHandle: string;
}

export interface NewsStory {
  storyId: string;
  label: string;
  importance: number;
  roastability: number;
  factualConfidence: 'high' | 'medium' | 'low';
  target: string;
  keyFacts: string[];
  ammunition: StoryAmmunition;
  suggestedAngles: string[];
  sourceTweetIds: string[];
  sourceUrl: string | null;
}

export interface ResearchOutput {
  researchSummary: string;
  marketContext: string;
  stories: NewsStory[];
}

// --- News variant (roast candidate with story metadata) ---

export interface NewsVariant {
  text: string;
  angle: string;
  selfScore: number;
  storyId: string;
  pipeline: 'opus' | 'lightning';
}

// --- Evaluated news variant (after judge panel) ---

export interface RankedNewsVariant extends NewsVariant {
  judgeScore: number;
  funny: number;
  impact: number;
  original: number;
  reason: string;
}

// --- News digest (pipeline run result) ---

export interface NewsDigest {
  id: number;
  storiesFound: number;
  storiesSelected: number;
  variantsGenerated: number;
  variantsFiltered: number;
  variantsEvaluated: number;
  roastsSent: number;
  topStory: string | null;
  topScore: number | null;
  researchSummary: string | null;
  durationMs: number;
  createdAt: string;
}

export interface InsertNewsDigest {
  storiesFound: number;
  storiesSelected: number;
  variantsGenerated: number;
  variantsFiltered: number;
  variantsEvaluated: number;
  roastsSent: number;
  topStory?: string;
  topScore?: number;
  researchSummary?: string;
  durationMs: number;
}

// --- Pipeline result (returned to caller) ---

export interface NewsPipelineResult {
  stories: NewsStory[];
  topRoasts: RankedNewsVariant[];
  runnerUps: RankedNewsVariant[];
  researchSummary: string;
  marketContext: string;
  stats: NewsPipelineStats;
}

export interface NewsPipelineStats {
  storiesFound: number;
  storiesSelected: number;
  totalGenerated: number;
  afterFilter: number;
  afterDedup: number;
  ranked: number;
  evaluated: number;
  selected: number;
  durationMs: number;
  phaseTimings: {
    gatherMs: number;
    researchMs: number;
    generateMs: number;
    evaluateMs: number;
  };
  opusVariants: number;
  lightningVariants: number;
}
