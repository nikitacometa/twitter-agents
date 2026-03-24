import type { StatsDashboardData } from '../types.js';
import { colors, fonts } from '../theme.js';
import { avatarDataUrl } from '../assets.js';

function StatBox({ value, label, color }: { value: string; label: string; color: string }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        flex: 1,
        padding: '28px 20px',
        borderRight: `1px solid ${colors.border}`,
        background: colors.bgSurface,
      }}
    >
      <span
        style={{
          fontFamily: fonts.slab,
          fontSize: '56px',
          fontWeight: 700,
          color,
          lineHeight: 1.1,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </span>
      <span
        style={{
          fontFamily: fonts.mono,
          fontSize: '16px',
          fontWeight: 700,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color: colors.textMuted,
          marginTop: '10px',
        }}
      >
        {label}
      </span>
    </div>
  );
}

export function StatsDashboard(data: StatsDashboardData): React.ReactElement {
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
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '24px 48px',
          borderBottom: `3px solid ${colors.red}`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          {avatarDataUrl && (
            <img src={avatarDataUrl} width={44} height={44} style={{ borderRadius: '50%' }} />
          )}
          <span
            style={{
              fontFamily: fonts.slab,
              fontSize: '36px',
              fontWeight: 700,
              color: colors.text,
              letterSpacing: '-0.02em',
            }}
          >
            slaughterhouse operations
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '10px',
              height: '10px',
              borderRadius: '50%',
              background: colors.green,
            }}
          />
          <span style={{ fontSize: '18px', fontWeight: 600, color: colors.green }}>
            LIVE
          </span>
        </div>
      </div>

      {/* Stat boxes row */}
      <div
        style={{
          display: 'flex',
          borderBottom: `1px solid ${colors.border}`,
        }}
      >
        <StatBox value={String(data.totalRoasts)} label="total roasts" color={colors.green} />
        <StatBox value={String(data.stockpileSize)} label="stockpile" color={colors.amber} />
        <StatBox value={data.avgQualityScore.toFixed(1)} label="avg quality" color={colors.red} />
        <StatBox value={String(data.projectsAudited)} label="projects" color={colors.text} />
      </div>

      {/* Top targets table */}
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, padding: '24px 48px' }}>
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
          top targets
        </span>

        {/* Table header */}
        <div
          style={{
            display: 'flex',
            padding: '10px 16px',
            borderBottom: `1px solid ${colors.border}`,
            gap: '16px',
          }}
        >
          <span style={{ width: '40px', fontSize: '14px', fontWeight: 700, color: colors.textMuted, letterSpacing: '0.1em' }}>#</span>
          <span style={{ flex: 1, fontSize: '14px', fontWeight: 700, color: colors.textMuted, letterSpacing: '0.1em' }}>TARGET</span>
          <span style={{ width: '100px', fontSize: '14px', fontWeight: 700, color: colors.textMuted, letterSpacing: '0.1em', textAlign: 'right' }}>ROASTS</span>
          <span style={{ width: '100px', fontSize: '14px', fontWeight: 700, color: colors.textMuted, letterSpacing: '0.1em', textAlign: 'right' }}>SCORE</span>
          <span style={{ width: '160px', fontSize: '14px', fontWeight: 700, color: colors.textMuted, letterSpacing: '0.1em', textAlign: 'right' }}>ANGLE</span>
        </div>

        {/* Table rows */}
        {data.topTargets.slice(0, 5).map((target, i) => (
          <div
            key={target.name}
            style={{
              display: 'flex',
              padding: '14px 16px',
              background: i % 2 === 0 ? colors.bgSurface : 'transparent',
              gap: '16px',
              alignItems: 'center',
            }}
          >
            <span style={{ width: '40px', fontSize: '22px', fontWeight: 700, fontFamily: fonts.slab, color: colors.textDim }}>
              {i + 1}
            </span>
            <span style={{ flex: 1, fontSize: '22px', fontWeight: 600, color: colors.text }}>
              {target.name}
            </span>
            <span style={{ width: '100px', fontSize: '22px', color: colors.textDim, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
              {target.roastCount}
            </span>
            <span style={{ width: '100px', fontSize: '22px', fontWeight: 600, color: colors.amber, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
              {target.avgScore.toFixed(1)}
            </span>
            <span style={{ width: '160px', fontSize: '16px', color: colors.textMuted, textAlign: 'right', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              {target.bestAngle}
            </span>
          </div>
        ))}
      </div>

      {/* Bottom bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '16px 48px',
          borderTop: `1px solid ${colors.border}`,
          background: colors.bgSurface,
        }}
      >
        <span style={{ fontSize: '16px', color: colors.textMuted }}>
          uptime: {data.uptime}
        </span>
        <span style={{ fontSize: '16px', color: colors.textMuted }}>
          last roast: {data.lastRoastTime}
        </span>
        <span style={{ fontSize: '18px', fontWeight: 600, color: colors.textDim }}>
          @0xBeefer // 0xbeef.wtf
        </span>
      </div>
    </div>
  );
}
