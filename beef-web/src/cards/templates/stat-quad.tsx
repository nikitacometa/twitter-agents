import type { StatQuadData } from '../types.js';
import { colors, fonts } from '../theme.js';

export function StatQuad(data: StatQuadData): React.ReactElement {
  return (
    <div
      style={{
        display: 'flex',
        width: '1600px',
        height: '900px',
        fontFamily: fonts.mono,
        color: colors.text,
      }}
    >
      {/* Left side — transparent for art */}
      <div style={{ display: 'flex', width: '640px', height: '900px' }} />

      {/* Right panel */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: '960px',
          height: '900px',
          padding: '48px 52px',
          background: colors.overlay,
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '16px',
          }}
        >
          <span style={{ fontSize: '20px', fontWeight: 700, color: colors.red }}>
            @0xBeefer
          </span>
          <span
            style={{
              fontSize: '14px',
              fontWeight: 700,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: colors.textMuted,
            }}
          >
            forensic data
          </span>
        </div>

        {/* Red divider */}
        <div
          style={{
            display: 'flex',
            width: '100%',
            height: '2px',
            background: `linear-gradient(90deg, ${colors.red}, ${colors.redBright}, transparent)`,
            marginBottom: '28px',
          }}
        />

        {/* Target name */}
        {data.targetName && (
          <span
            style={{
              fontFamily: fonts.slab,
              fontSize: '44px',
              fontWeight: 700,
              color: colors.text,
              lineHeight: 1.1,
              marginBottom: '32px',
            }}
          >
            {data.targetName}
          </span>
        )}

        {/* 2x2 Grid */}
        <div style={{ display: 'flex', flex: 1, flexDirection: 'column' }}>
          {/* Top row */}
          <div style={{ display: 'flex', flex: 1 }}>
            {data.stats.slice(0, 2).map((stat, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                  flex: 1,
                  padding: '20px 24px',
                  borderRight: i === 0 ? `1px solid ${colors.border}` : 'none',
                  borderBottom: `1px solid ${colors.border}`,
                }}
              >
                <span
                  style={{
                    fontFamily: fonts.slab,
                    fontSize: '64px',
                    fontWeight: 700,
                    color: colors.red,
                    lineHeight: 1,
                    marginBottom: '10px',
                  }}
                >
                  {stat.value}
                </span>
                <span style={{ fontSize: '18px', color: colors.textDim, lineHeight: 1.3 }}>
                  {stat.label}
                </span>
              </div>
            ))}
          </div>

          {/* Bottom row */}
          <div style={{ display: 'flex', flex: 1 }}>
            {data.stats.slice(2, 4).map((stat, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                  flex: 1,
                  padding: '20px 24px',
                  borderRight: i === 0 ? `1px solid ${colors.border}` : 'none',
                }}
              >
                <span
                  style={{
                    fontFamily: fonts.slab,
                    fontSize: '64px',
                    fontWeight: 700,
                    color: colors.redBright,
                    lineHeight: 1,
                    marginBottom: '10px',
                  }}
                >
                  {stat.value}
                </span>
                <span style={{ fontSize: '18px', color: colors.textDim, lineHeight: 1.3 }}>
                  {stat.label}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Source text */}
        {data.sourceText && (
          <div
            style={{
              display: 'flex',
              borderTop: `1px solid ${colors.border}`,
              paddingTop: '16px',
              marginTop: '8px',
            }}
          >
            <span
              style={{
                fontSize: '18px',
                color: colors.textMuted,
                fontStyle: 'italic',
                lineHeight: 1.4,
              }}
            >
              &ldquo;{data.sourceText}&rdquo;
            </span>
          </div>
        )}

        {/* Bottom branding */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            paddingTop: '12px',
          }}
        >
          <span style={{ fontSize: '16px', color: colors.textMuted }}>
            0xbeef.wtf
          </span>
        </div>
      </div>
    </div>
  );
}
