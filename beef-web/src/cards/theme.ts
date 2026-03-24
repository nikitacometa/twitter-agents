// $BEEF visual identity — hardcoded values (satori doesn't support CSS variables)

export const colors = {
  bg: '#0a0a0a',
  bgSurface: '#0e0e0e',
  bgElevated: '#151515',
  border: '#1e1e1e',
  borderAccent: '#2a2a2a',
  text: '#e8e8e8',
  textDim: '#888888',
  textMuted: '#444444',
  red: '#cc0000',
  redBright: '#ff4500',
  redGlow: 'rgba(204,0,0,0.3)',
  redDim: 'rgba(204,0,0,0.08)',
  green: '#00ff41',
  greenDim: 'rgba(0,255,65,0.08)',
  amber: '#d4a843',
  amberDim: 'rgba(212,168,67,0.08)',
  blood: '#4a0000',
  char: '#1a0000',
  violet: '#a78bfa',
} as const;

export const fonts = {
  mono: 'IBM Plex Mono',
  slab: 'Zilla Slab',
} as const;

export type Verdict = 'WELL DONE' | 'CRISPY' | 'MEDIUM RARE' | 'RARE';

export function scoreToVerdict(score: number): Verdict {
  if (score >= 4.5) return 'WELL DONE';
  if (score >= 4.0) return 'CRISPY';
  if (score >= 3.5) return 'MEDIUM RARE';
  return 'RARE';
}

export function verdictColor(verdict: Verdict): string {
  switch (verdict) {
    case 'WELL DONE': return colors.redBright;
    case 'CRISPY': return '#ef4444';
    case 'MEDIUM RARE': return colors.amber;
    case 'RARE': return colors.green;
  }
}

export function targetTypeColor(type: string): string {
  switch (type) {
    case 'project': return colors.red;
    case 'token': return colors.amber;
    case 'trend': return colors.green;
    case 'person': return colors.violet;
    default: return colors.red;
  }
}

export const sizes = {
  card: { width: 1200, height: 630 },
  square: { width: 1080, height: 1080 },
} as const;
