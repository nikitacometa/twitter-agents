export type ActivityEventType =
  | 'wake'
  | 'sleep'
  | 'hunt'
  | 'target_locked'
  | 'research'
  | 'cooking'
  | 'roast_ready'
  | 'posted'
  | 'engagement'
  | 'mention'
  | 'burn_request'
  | 'challenge'
  | 'think'
  | 'stats'
  | 'error'
  | 'milestone';

export interface ActivityEvent {
  id: string;
  type: ActivityEventType;
  timestamp: string;
  narrative: string;
  data?: Record<string, unknown>;
  expandable?: {
    title: string;
    content: string;
  };
}

export interface ActivityFeed {
  version: number;
  botStatus: 'online' | 'offline' | 'sleeping';
  lastUpdate: string;
  stats: ActivityFeedStats;
  events: ActivityEvent[];
}

export interface ActivityFeedStats {
  totalRoasts: number;
  totalLikes: number;
  stockpileSize: number;
  burnedTokens: number;
  uptime: string;
}
