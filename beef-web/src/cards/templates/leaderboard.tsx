import type { LeaderboardData } from '../types.js';
import { colors, fonts } from '../theme.js';

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
        width: '1200px',
        height: '1200px',
        fontFamily: fonts.mono,
        color: colors.text,
        padding: '56px 52px',
        background: colors.overlayLight,
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: '20px', fontWeight: 700, color: colors.red, marginBottom: '12px' }}>
            @0xBeefer
          </span>
          <span
            style={{
              fontFamily: fonts.slab,
              fontSize: '48px',
              fontWeight: 700,
              color: colors.red,
              letterSpacing: '-0.02em',
              lineHeight: 1.1,
            }}
          >
            {data.title}
          </span>
        </div>
      </div>
      <span style={{ fontSize: '20px', color: colors.textDim, marginBottom: '24px' }}>
        {data.subtitle}
      </span>

      {/* Red divider */}
      <div
        style={{
          display: 'flex',
          width: '100%',
          height: '3px',
          background: `linear-gradient(90deg, ${colors.red}, ${colors.redBright}, ${colors.red}, transparent)`,
          marginBottom: '20px',
        }}
      />

      {/* Table header */}
      <div style={{ display: 'flex', padding: '8px 20px', marginBottom: '4px' }}>
        <span style={{ width: '56px', fontSize: '13px', fontWeight: 700, color: colors.textMuted, letterSpacing: '0.1em' }}>
          #
        </span>
        <span style={{ flex: 1, fontSize: '13px', fontWeight: 700, color: colors.textMuted, letterSpacing: '0.1em' }}>
          TARGET
        </span>
        <span style={{ width: '160px', fontSize: '13px', fontWeight: 700, color: colors.textMuted, letterSpacing: '0.1em' }}>
          SCORE
        </span>
        <span style={{ width: '80px', fontSize: '13px', fontWeight: 700, color: colors.textMuted, letterSpacing: '0.1em', textAlign: 'right' }}>
          ROASTS
        </span>
      </div>

      {/* Entries */}
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: '3px' }}>
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
                padding: '12px 20px',
                gap: '16px',
                background: isTop3 ? 'rgba(21,21,21,0.9)' : (entry.rank % 2 === 0 ? 'rgba(14,14,14,0.7)' : 'transparent'),
                borderLeft: isTop3 ? `4px solid ${colors.red}` : '4px solid transparent',
                borderRadius: '3px',
              }}
            >
              <span
                style={{
                  width: '56px',
                  fontFamily: fonts.slab,
                  fontSize: isTop3 ? '30px' : '24px',
                  fontWeight: 700,
                  color: isTop3 ? colors.red : colors.textMuted,
                }}
              >
                {entry.rank}
              </span>

              <span
                style={{
                  flex: 1,
                  fontSize: '22px',
                  fontWeight: isTop3 ? 700 : 400,
                  color: isTop3 ? colors.text : colors.textDim,
                }}
              >
                {entry.name}
              </span>

              <div style={{ display: 'flex', flexDirection: 'column', width: '160px', gap: '4px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div
                    style={{
                      flex: 1,
                      height: '8px',
                      background: 'rgba(30,30,30,0.8)',
                      borderRadius: '4px',
                      overflow: 'hidden',
                      display: 'flex',
                    }}
                  >
                    <div
                      style={{
                        width: `${barWidth}%`,
                        height: '100%',
                        background: sColor,
                        borderRadius: '4px',
                      }}
                    />
                  </div>
                  <span
                    style={{
                      fontSize: '18px',
                      fontWeight: 600,
                      color: sColor,
                      fontVariantNumeric: 'tabular-nums',
                      width: '38px',
                      textAlign: 'right',
                    }}
                  >
                    {entry.score.toFixed(1)}
                  </span>
                </div>
              </div>

              <span
                style={{
                  width: '80px',
                  textAlign: 'right',
                  fontSize: '20px',
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
          justifyContent: 'flex-end',
          paddingTop: '20px',
          borderTop: `1px solid ${colors.border}`,
          marginTop: '16px',
        }}
      >
        <span style={{ fontSize: '16px', color: colors.textMuted }}>
          0xbeef.wtf
        </span>
      </div>
    </div>
  );
}
