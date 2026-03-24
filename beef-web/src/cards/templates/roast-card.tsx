import type { RoastCardData } from '../types.js';
import { colors, fonts, scoreToVerdict, verdictColor, targetTypeColor } from '../theme.js';
import { avatarDataUrl } from '../assets.js';

function ScoreDots({ score }: { score: number }) {
  const filled = Math.round(score);
  return (
    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          style={{
            width: '10px',
            height: '10px',
            borderRadius: '50%',
            background: i <= filled ? colors.red : colors.borderAccent,
            border: `1px solid ${i <= filled ? colors.red : colors.textMuted}`,
          }}
        />
      ))}
      <span
        style={{
          fontFamily: fonts.mono,
          fontSize: '13px',
          color: colors.textDim,
          marginLeft: '6px',
        }}
      >
        {score.toFixed(1)}
      </span>
    </div>
  );
}

function TerminalDots() {
  return (
    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ff5f57' }} />
      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#febc2e' }} />
      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#28c840' }} />
    </div>
  );
}

export function RoastCard(data: RoastCardData): React.ReactElement {
  const verdict = scoreToVerdict(data.qualityScore);
  const vColor = verdictColor(verdict);
  const typeColor = targetTypeColor(data.targetType);
  const ts = data.timestamp ?? new Date().toISOString().split('T')[0];

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '1200px',
        height: '630px',
        padding: '40px 48px',
        fontFamily: fonts.mono,
        color: colors.text,
        position: 'relative',
      }}
    >
      {/* Top bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '8px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <TerminalDots />
          <span
            style={{
              fontSize: '11px',
              fontWeight: 700,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: colors.textMuted,
            }}
          >
            audit report
          </span>
        </div>

        {/* AUDITED stamp */}
        <div
          style={{
            display: 'flex',
            fontFamily: fonts.slab,
            fontSize: '11px',
            fontWeight: 700,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: colors.red,
            border: `2px solid ${colors.red}`,
            padding: '3px 10px',
            transform: 'rotate(12deg)',
            opacity: 0.7,
          }}
        >
          audited
        </div>
      </div>

      {/* Thin red line */}
      <div
        style={{
          display: 'flex',
          width: '100%',
          height: '1px',
          background: `linear-gradient(90deg, ${colors.red}, ${colors.redBright}, ${colors.red}, transparent)`,
          marginBottom: '28px',
        }}
      />

      {/* Target name + type */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '16px', marginBottom: '6px' }}>
        <span
          style={{
            fontFamily: fonts.slab,
            fontSize: '38px',
            fontWeight: 700,
            color: colors.text,
            lineHeight: 1.1,
          }}
        >
          {data.targetName}
        </span>
        <span
          style={{
            fontSize: '10px',
            fontWeight: 700,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: typeColor,
            border: `1px solid ${typeColor}`,
            padding: '2px 8px',
            borderRadius: '2px',
          }}
        >
          {data.targetType}
        </span>
      </div>

      {/* Angle badge */}
      {data.angle && (
        <span
          style={{
            display: 'flex',
            fontSize: '10px',
            fontWeight: 600,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: colors.textDim,
            marginBottom: '20px',
          }}
        >
          {data.angle}
        </span>
      )}

      {/* Roast text — the main content */}
      <div
        style={{
          display: 'flex',
          flex: 1,
          alignItems: 'center',
        }}
      >
        <span
          style={{
            fontSize: data.roastText.length > 180 ? '20px' : data.roastText.length > 120 ? '22px' : '26px',
            lineHeight: 1.5,
            color: colors.text,
            maxWidth: '1000px',
          }}
        >
          {data.roastText}
        </span>
      </div>

      {/* Bottom divider — grill line */}
      <div
        style={{
          display: 'flex',
          width: '100%',
          height: '1px',
          background: `linear-gradient(90deg, transparent, ${colors.red}40, transparent)`,
          marginBottom: '20px',
        }}
      />

      {/* Bottom bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        {/* Verdict badge */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
          }}
        >
          <span
            style={{
              fontSize: '11px',
              fontWeight: 700,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: vColor,
              border: `1px solid ${vColor}`,
              padding: '4px 14px',
              borderRadius: '2px',
              background: `${vColor}12`,
            }}
          >
            {verdict}
          </span>
          <ScoreDots score={data.qualityScore} />
        </div>

        {/* Branding */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {avatarDataUrl && (
            <img
              src={avatarDataUrl}
              width={36}
              height={36}
              style={{ borderRadius: '50%' }}
            />
          )}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: colors.text }}>
              @0xBeefer
            </span>
            <span style={{ fontSize: '10px', color: colors.textMuted }}>
              {ts}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
