export type CardType = 'roast' | 'kill-report' | 'stats' | 'leaderboard' | 'milestone';

export interface RoastCardData {
  targetName: string;
  targetType: 'project' | 'token' | 'trend' | 'person';
  roastText: string;
  qualityScore: number;
  angle?: string;
  timestamp?: string;
}

export interface KillReportData {
  targetName: string;
  targetType: string;
  roastText: string;
  qualityScore: number;
  scores: {
    savage: number;
    factual: number;
    funny: number;
    original: number;
    shareable: number;
    crypto_native: number;
    degen: number;
    timely: number;
  };
  angle: string;
  strategy: string;
  timestamp?: string;
}

export interface StatsDashboardData {
  totalRoasts: number;
  stockpileSize: number;
  avgQualityScore: number;
  projectsAudited: number;
  topTargets: Array<{
    name: string;
    roastCount: number;
    avgScore: number;
    bestAngle: string;
  }>;
  uptime: string;
  lastRoastTime: string;
}

export interface LeaderboardData {
  title: string;
  subtitle: string;
  entries: Array<{
    rank: number;
    name: string;
    score: number;
    count: number;
  }>;
}

export interface MilestoneData {
  number: string;
  achievement: string;
  supportingText: string;
}

export type CardData =
  | { type: 'roast'; data: RoastCardData }
  | { type: 'kill-report'; data: KillReportData }
  | { type: 'stats'; data: StatsDashboardData }
  | { type: 'leaderboard'; data: LeaderboardData }
  | { type: 'milestone'; data: MilestoneData };
