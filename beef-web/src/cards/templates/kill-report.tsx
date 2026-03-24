import type { KillReportData } from '../types.js';
import { colors, fonts, scoreToVerdict, verdictColor } from '../theme.js';
import { avatarDataUrl } from '../assets.js';

const DIMENSION_LABELS: Record<string, string> = {
  savage: 'SAVAGE',
  funny: 'FUNNY',
  original: 'ORIGINAL',
  shareable: 'SHAREABLE',
  degen: 'DEGEN',
  crypto_native: 'CRYPTO',
  timely: 'TIMELY',
  factual: 'FACTUAL',
};

function scoreBarColor(score: number): string {
  if (score >= 4) return colors.green;
  if (score >= 3) return colors.amber;
  if (score >= 2) return colors.redBright;
  return colors.red;
}

function ScoreBar({ label, score }: { label: string; score: number }) {
  const barWidth = Math.max(4, (score / 5) * 100);
  const barColor = scoreBarColor(score);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '8px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span
          style={{
            fontFamily: fonts.mono,
            fontSize: '16px',
            fontWeight: 700,
            letterSpacing: '0.1em',
            color: colors.textDim,
          }}
        >
          {label}
        </span>
        <span
          style={{
            fontFamily: fonts.mono,
            fontSize: '18px',
            fontWeight: 600,
            color: barColor,
          }}
        >
          {score.toFixed(1)}
        </span>
      </div>
      <div
        style={{
          display: 'flex',
          width: '100%',
          height: '10px',
          background: colors.border,
          borderRadius: '5px',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${barWidth}%`,
            height: '100%',
            background: barColor,
            borderRadius: '5px',
          }}
        />
      </div>
    </div>
  );
}

export function KillReport(data: KillReportData): React.ReactElement {
  const verdict = scoreToVerdict(data.qualityScore);
  const vColor = verdictColor(verdict);
  const dims = Object.entries(DIMENSION_LABELS);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '1600px',
        height: '900px',
        fontFamily: fonts.mono,
        color: colors.text,
      }}
    >
      {/* Terminal header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '16px 36px',
          background: colors.bgElevated,
          borderBottom: `2px solid ${colors.border}`,
          gap: '16px',
        }}
      >
        <div style={{ display: 'flex', gap: '8px' }}>
          <div style={{ width: '14px', height: '14px', borderRadius: '50%', background: '#ff5f57' }} />
          <div style={{ width: '14px', height: '14px', borderRadius: '50%', background: '#febc2e' }} />
          <div style={{ width: '14px', height: '14px', borderRadius: '50%', background: '#28c840' }} />
        </div>
        <span style={{ fontSize: '18px', fontWeight: 600, color: colors.textDim, letterSpacing: '0.05em' }}>
          KILL REPORT // {data.targetName.toUpperCase()}
        </span>
      </div>

      {/* Two-column body */}
      <div style={{ display: 'flex', flex: 1, padding: '36px 44px', gap: '40px' }}>
        {/* Left column — roast content */}
        <div style={{ display: 'flex', flexDirection: 'column', flex: '1 1 55%', gap: '20px' }}>
          {/* Badges row */}
          <div style={{ display: 'flex', gap: '14px', alignItems: 'center' }}>
            <span
              style={{
                fontSize: '16px',
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: colors.amber,
                border: `2px solid ${colors.amber}`,
                padding: '4px 12px',
              }}
            >
              {data.angle}
            </span>
            <span
              style={{
                fontSize: '16px',
                fontWeight: 600,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: colors.textMuted,
              }}
            >
              {data.strategy}
            </span>
          </div>

          {/* Target name */}
          <span
            style={{
              fontFamily: fonts.slab,
              fontSize: '44px',
              fontWeight: 700,
              color: colors.text,
              lineHeight: 1.2,
            }}
          >
            {data.targetName}
          </span>

          {/* Roast text */}
          <span
            style={{
              fontSize: data.roastText.length > 200 ? '22px' : '26px',
              lineHeight: 1.6,
              color: colors.text,
              flex: 1,
            }}
          >
            {data.roastText}
          </span>

          {/* Composite score + verdict */}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '20px', marginTop: 'auto' }}>
            <span
              style={{
                fontFamily: fonts.slab,
                fontSize: '64px',
                fontWeight: 700,
                color: vColor,
                lineHeight: 1,
              }}
            >
              {data.qualityScore.toFixed(1)}
            </span>
            <span
              style={{
                fontSize: '18px',
                fontWeight: 700,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: vColor,
                border: `2px solid ${vColor}`,
                padding: '6px 16px',
              }}
            >
              {verdict}
            </span>
          </div>
        </div>

        {/* Vertical separator */}
        <div
          style={{
            display: 'flex',
            width: '2px',
            background: `linear-gradient(180deg, transparent, ${colors.border}, transparent)`,
          }}
        />

        {/* Right column — dimension scores */}
        <div style={{ display: 'flex', flexDirection: 'column', flex: '1 1 40%', gap: '2px' }}>
          <span
            style={{
              fontSize: '16px',
              fontWeight: 700,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: colors.textMuted,
              marginBottom: '16px',
            }}
          >
            dimension analysis
          </span>
          {dims.map(([key, label]) => (
            <ScoreBar
              key={key}
              label={label}
              score={data.scores[key as keyof typeof data.scores] ?? 0}
            />
          ))}
        </div>
      </div>

      {/* Bottom branding bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '14px 44px',
          borderTop: `2px solid ${colors.border}`,
          background: colors.bgSurface,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {avatarDataUrl && (
            <img src={avatarDataUrl} width={36} height={36} style={{ borderRadius: '50%' }} />
          )}
          <span style={{ fontSize: '18px', fontWeight: 600, color: colors.textDim }}>
            @0xBeefer
          </span>
        </div>
        <span style={{ fontSize: '16px', color: colors.textMuted }}>
          forensic accounting ai // base chain
        </span>
      </div>
    </div>
  );
}
