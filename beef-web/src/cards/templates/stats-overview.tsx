import type { StatsOverviewData } from '../types.js';
import { colors, fonts } from '../theme.js';

export function StatsOverview(data: StatsOverviewData): React.ReactElement {
  const targets = data.topTargets.slice(0, 6);

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
            stats report
          </span>
        </div>

        {/* Red divider */}
        <div
          style={{
            display: 'flex',
            width: '100%',
            height: '3px',
            background: `linear-gradient(90deg, ${colors.red}, ${colors.redBright}, transparent)`,
            marginBottom: '40px',
          }}
        />

        {/* Stats row — 3 big numbers */}
        <div style={{ display: 'flex', gap: '32px', marginBottom: '40px' }}>
          {/* Total Roasts */}
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
            <span
              style={{
                fontSize: '14px',
                fontWeight: 700,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: colors.textMuted,
                marginBottom: '8px',
              }}
            >
              total roasts
            </span>
            <span
              style={{
                fontFamily: fonts.slab,
                fontSize: '64px',
                fontWeight: 700,
                color: colors.red,
                lineHeight: 1,
              }}
            >
              {data.totalRoasts.toLocaleString()}
            </span>
          </div>

          {/* Avg Quality */}
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
            <span
              style={{
                fontSize: '14px',
                fontWeight: 700,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: colors.textMuted,
                marginBottom: '8px',
              }}
            >
              avg quality
            </span>
            <span
              style={{
                fontFamily: fonts.slab,
                fontSize: '64px',
                fontWeight: 700,
                color: colors.amber,
                lineHeight: 1,
              }}
            >
              {data.avgQualityScore.toFixed(1)}
            </span>
          </div>

          {/* Projects Audited */}
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
            <span
              style={{
                fontSize: '14px',
                fontWeight: 700,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: colors.textMuted,
                marginBottom: '8px',
              }}
            >
              projects
            </span>
            <span
              style={{
                fontFamily: fonts.slab,
                fontSize: '64px',
                fontWeight: 700,
                color: colors.green,
                lineHeight: 1,
              }}
            >
              {data.projectsAudited}
            </span>
          </div>
        </div>

        {/* Divider */}
        <div
          style={{
            display: 'flex',
            width: '100%',
            height: '1px',
            background: colors.border,
            marginBottom: '28px',
          }}
        />

        {/* Top victims */}
        <span
          style={{
            fontSize: '14px',
            fontWeight: 700,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: colors.textMuted,
            marginBottom: '16px',
          }}
        >
          top victims
        </span>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 }}>
          {targets.map((t, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '8px 16px',
                background: i < 3 ? colors.bgElevated : 'transparent',
                borderLeft: i < 3 ? `3px solid ${colors.red}` : '3px solid transparent',
                borderRadius: '3px',
              }}
            >
              <span
                style={{
                  fontFamily: fonts.slab,
                  fontSize: '22px',
                  fontWeight: 700,
                  color: i < 3 ? colors.red : colors.textMuted,
                  width: '36px',
                }}
              >
                {i + 1}
              </span>
              <span
                style={{
                  fontSize: '22px',
                  fontWeight: i < 3 ? 700 : 400,
                  color: i < 3 ? colors.text : colors.textDim,
                  flex: 1,
                }}
              >
                {t.name}
              </span>
              <span
                style={{
                  fontSize: '20px',
                  fontWeight: 600,
                  color: colors.textDim,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {t.count} roasts
              </span>
            </div>
          ))}
        </div>

        {/* Bottom branding */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            paddingTop: '16px',
            borderTop: `1px solid ${colors.border}`,
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
