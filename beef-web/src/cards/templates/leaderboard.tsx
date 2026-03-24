import type { LeaderboardData } from '../types.js';
import { colors, fonts } from '../theme.js';
import { avatarDataUrl } from '../assets.js';

function scoreColor(score: number): string {
  if (score >= 4.5) return '#ff4500';
  if (score >= 4.0) return '#ef4444';
  if (score >= 3.5) return colors.amber;
  return colors.green;
}

export function Leaderboard(data: LeaderboardData): React.ReactElement {
  const entries = data.entries.slice(0, 10);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '1080px',
        background: colors.bg,
        height: '1080px',
        fontFamily: fonts.mono,
        color: colors.text,
        padding: '48px 44px',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', flexDirection: 'column', marginBottom: '32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '6px' }}>
          {avatarDataUrl && (
            <img src={avatarDataUrl} width={28} height={28} style={{ borderRadius: '50%' }} />
          )}
          <span
            style={{
              fontFamily: fonts.slab,
              fontSize: '32px',
              fontWeight: 700,
              color: colors.red,
              letterSpacing: '-0.02em',
              lineHeight: 1.1,
            }}
          >
            {data.title}
          </span>
        </div>
        <span style={{ fontSize: '13px', color: colors.textDim, marginLeft: '40px' }}>
          {data.subtitle}
        </span>
      </div>

      {/* Red divider */}
      <div
        style={{
          display: 'flex',
          width: '100%',
          height: '2px',
          background: `linear-gradient(90deg, ${colors.red}, ${colors.redBright}, ${colors.red}, transparent)`,
          marginBottom: '20px',
        }}
      />

      {/* Table header */}
      <div
        style={{
          display: 'flex',
          padding: '8px 16px',
          marginBottom: '4px',
        }}
      >
        <span style={{ width: '50px', fontSize: '9px', fontWeight: 700, color: colors.textMuted, letterSpacing: '0.1em' }}>
          #
        </span>
        <span style={{ flex: 1, fontSize: '9px', fontWeight: 700, color: colors.textMuted, letterSpacing: '0.1em' }}>
          TARGET
        </span>
        <span style={{ width: '120px', fontSize: '9px', fontWeight: 700, color: colors.textMuted, letterSpacing: '0.1em' }}>
          SCORE
        </span>
        <span style={{ width: '80px', fontSize: '9px', fontWeight: 700, color: colors.textMuted, letterSpacing: '0.1em', textAlign: 'right' }}>
          ROASTS
        </span>
      </div>

      {/* Entries */}
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: '2px' }}>
        {entries.map((entry) => {
          const isTop3 = entry.rank <= 3;
          const sColor = scoreColor(entry.score);
          const barWidth = Math.max(4, (entry.score / 5) * 100);

          return (
            <div
              key={entry.rank}
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '12px 16px',
                background: isTop3 ? colors.bgElevated : (entry.rank % 2 === 0 ? colors.bgSurface : 'transparent'),
                borderLeft: isTop3 ? `3px solid ${colors.red}` : '3px solid transparent',
                borderRadius: '2px',
              }}
            >
              {/* Rank */}
              <span
                style={{
                  width: '50px',
                  fontFamily: fonts.slab,
                  fontSize: isTop3 ? '22px' : '18px',
                  fontWeight: 700,
                  color: isTop3 ? colors.red : colors.textMuted,
                }}
              >
                {entry.rank}
              </span>

              {/* Name */}
              <span
                style={{
                  flex: 1,
                  fontSize: '15px',
                  fontWeight: isTop3 ? 700 : 400,
                  color: isTop3 ? colors.text : colors.textDim,
                }}
              >
                {entry.name}
              </span>

              {/* Score bar */}
              <div style={{ display: 'flex', flexDirection: 'column', width: '120px', gap: '3px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div
                    style={{
                      flex: 1,
                      height: '5px',
                      background: colors.border,
                      borderRadius: '3px',
                      overflow: 'hidden',
                      display: 'flex',
                    }}
                  >
                    <div
                      style={{
                        width: `${barWidth}%`,
                        height: '100%',
                        background: sColor,
                        borderRadius: '3px',
                      }}
                    />
                  </div>
                  <span
                    style={{
                      fontSize: '12px',
                      fontWeight: 600,
                      color: sColor,
                      fontVariantNumeric: 'tabular-nums',
                      width: '28px',
                      textAlign: 'right',
                    }}
                  >
                    {entry.score.toFixed(1)}
                  </span>
                </div>
              </div>

              {/* Count */}
              <span
                style={{
                  width: '80px',
                  textAlign: 'right',
                  fontSize: '13px',
                  fontWeight: 600,
                  color: colors.textDim,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {entry.count}
              </span>
            </div>
          );
        })}
      </div>

      {/* Bottom branding */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingTop: '20px',
          borderTop: `1px solid ${colors.border}`,
          marginTop: '16px',
        }}
      >
        <span style={{ fontSize: '11px', fontWeight: 600, color: colors.textDim }}>
          @0xBeefer
        </span>
        <span style={{ fontSize: '10px', color: colors.textMuted }}>
          0xbeef.wtf
        </span>
      </div>
    </div>
  );
}
