export type CardType = 'roast' | 'stats-overview' | 'leaderboard' | 'number-card' | 'stat-duo' | 'stat-quad';

export interface RoastCardData {
  targetName: string;
  targetType: 'project' | 'token' | 'trend' | 'person';
  roastText: string;
  qualityScore: number;
  timestamp?: string;
}

export interface StatsOverviewData {
  totalRoasts: number;
  avgQualityScore: number;
  projectsAudited: number;
  topTargets: Array<{ name: string; count: number }>;
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

export interface NumberCardData {
  number: string;
  achievement: string;
  supportingText: string;
}

export interface StatDuoData {
  targetName?: string;
  stats: [
    { value: string; label: string },
    { value: string; label: string },
  ];
  sourceText?: string;
}

export interface StatQuadData {
  targetName?: string;
  stats: [
    { value: string; label: string },
    { value: string; label: string },
    { value: string; label: string },
    { value: string; label: string },
  ];
  sourceText?: string;
}

export type CardData =
  | { type: 'roast'; data: RoastCardData }
  | { type: 'stats-overview'; data: StatsOverviewData }
  | { type: 'leaderboard'; data: LeaderboardData }
  | { type: 'number-card'; data: NumberCardData }
  | { type: 'stat-duo'; data: StatDuoData }
  | { type: 'stat-quad'; data: StatQuadData };
