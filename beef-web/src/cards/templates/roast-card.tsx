import type { RoastCardData } from '../types.js';
import { colors, fonts, scoreToVerdict, verdictColor, targetTypeColor } from '../theme.js';
import { avatarDataUrl } from '../assets.js';

function ScoreDots({ score }: { score: number }) {
  const filled = Math.round(score);
  return (
    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          style={{
            width: '18px',
            height: '18px',
            borderRadius: '50%',
            background: i <= filled ? colors.red : colors.borderAccent,
            border: `2px solid ${i <= filled ? colors.red : colors.textMuted}`,
          }}
        />
      ))}
      <span
        style={{
          fontFamily: fonts.mono,
          fontSize: '22px',
          fontWeight: 600,
          color: colors.textDim,
          marginLeft: '8px',
        }}
      >
        {score.toFixed(1)}
      </span>
    </div>
  );
}

function TerminalDots() {
  return (
    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
      <div style={{ width: '14px', height: '14px', borderRadius: '50%', background: '#ff5f57' }} />
      <div style={{ width: '14px', height: '14px', borderRadius: '50%', background: '#febc2e' }} />
      <div style={{ width: '14px', height: '14px', borderRadius: '50%', background: '#28c840' }} />
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
        width: '1600px',
        height: '900px',
        padding: '48px 56px',
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
          marginBottom: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <TerminalDots />
          <span
            style={{
              fontSize: '18px',
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
            fontSize: '18px',
            fontWeight: 700,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: colors.red,
            border: `3px solid ${colors.red}`,
            padding: '6px 16px',
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
          height: '2px',
          background: `linear-gradient(90deg, ${colors.red}, ${colors.redBright}, ${colors.red}, transparent)`,
          marginBottom: '36px',
        }}
      />

      {/* Target name + type */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '20px', marginBottom: '8px' }}>
        <span
          style={{
            fontFamily: fonts.slab,
            fontSize: '56px',
            fontWeight: 700,
            color: colors.text,
            lineHeight: 1.1,
          }}
        >
          {data.targetName}
        </span>
        <span
          style={{
            fontSize: '16px',
            fontWeight: 700,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: typeColor,
            border: `2px solid ${typeColor}`,
            padding: '4px 12px',
            borderRadius: '3px',
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
            fontSize: '16px',
            fontWeight: 600,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: colors.textDim,
            marginBottom: '24px',
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
            fontSize: data.roastText.length > 200 ? '30px' : data.roastText.length > 140 ? '34px' : '40px',
            lineHeight: 1.5,
            color: colors.text,
            maxWidth: '1400px',
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
          height: '2px',
          background: `linear-gradient(90deg, transparent, ${colors.red}40, transparent)`,
          marginBottom: '24px',
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
            gap: '20px',
          }}
        >
          <span
            style={{
              fontSize: '18px',
              fontWeight: 700,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: vColor,
              border: `2px solid ${vColor}`,
              padding: '6px 20px',
              borderRadius: '3px',
              background: `${vColor}12`,
            }}
          >
            {verdict}
          </span>
          <ScoreDots score={data.qualityScore} />
        </div>

        {/* Branding */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          {avatarDataUrl && (
            <img
              src={avatarDataUrl}
              width={48}
              height={48}
              style={{ borderRadius: '50%' }}
            />
          )}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: '20px', fontWeight: 600, color: colors.text }}>
              @0xBeefer
            </span>
            <span style={{ fontSize: '15px', color: colors.textMuted }}>
              {ts}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
