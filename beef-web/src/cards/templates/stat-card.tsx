import type { StatCardData } from '../types.js';
import { colors, fonts } from '../theme.js';
import { avatarDataUrl } from '../assets.js';

export function StatCard(data: StatCardData): React.ReactElement {
  const stats = data.stats.slice(0, 4);
  const isTwoCol = stats.length >= 3;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '1600px',
        height: '900px',
        fontFamily: fonts.mono,
        color: colors.text,
        padding: '56px 64px',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          {avatarDataUrl && (
            <img src={avatarDataUrl} width={40} height={40} style={{ borderRadius: '50%' }} />
          )}
          <span
            style={{
              fontSize: '18px',
              fontWeight: 700,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: colors.textMuted,
            }}
          >
            forensic data
          </span>
        </div>
        <span
          style={{
            fontFamily: fonts.slab,
            fontSize: '18px',
            fontWeight: 700,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: colors.red,
            border: `2px solid ${colors.red}`,
            padding: '4px 14px',
            opacity: 0.8,
          }}
        >
          evidence
        </span>
      </div>

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

      {/* Target name */}
      <span
        style={{
          fontFamily: fonts.slab,
          fontSize: '48px',
          fontWeight: 700,
          color: colors.text,
          lineHeight: 1.1,
          marginBottom: '40px',
        }}
      >
        {data.targetName}
      </span>

      {/* Stats grid */}
      <div
        style={{
          display: 'flex',
          flex: 1,
          flexWrap: 'wrap',
          gap: '0px',
        }}
      >
        {stats.map((stat, i) => {
          const isHighlight = stat.highlight ?? i === 0;
          return (
            <div
              key={i}
              style={{
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                width: isTwoCol ? '50%' : `${100 / stats.length}%`,
                padding: '28px 32px',
                borderRight: (isTwoCol ? (i % 2 === 0) : i < stats.length - 1) ? `1px solid ${colors.border}` : 'none',
                borderBottom: isTwoCol && i < 2 ? `1px solid ${colors.border}` : 'none',
              }}
            >
              <span
                style={{
                  fontFamily: fonts.slab,
                  fontSize: isHighlight ? '80px' : '64px',
                  fontWeight: 700,
                  color: isHighlight ? colors.red : colors.redBright,
                  lineHeight: 1,
                  letterSpacing: '-0.02em',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {stat.value}
              </span>
              <span
                style={{
                  fontSize: '20px',
                  fontWeight: 600,
                  color: colors.textDim,
                  marginTop: '12px',
                  lineHeight: 1.4,
                  maxWidth: '500px',
                }}
              >
                {stat.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Source text if present */}
      {data.sourceText && (
        <div
          style={{
            display: 'flex',
            padding: '16px 0',
            borderTop: `1px solid ${colors.border}`,
            marginTop: '16px',
          }}
        >
          <span
            style={{
              fontSize: '18px',
              color: colors.textMuted,
              lineHeight: 1.5,
              fontStyle: 'italic',
            }}
          >
            &quot;{data.sourceText}&quot;
          </span>
        </div>
      )}

      {/* Branding */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          alignItems: 'center',
          gap: '12px',
          marginTop: '8px',
        }}
      >
        <span style={{ fontSize: '18px', fontWeight: 600, color: colors.textDim }}>
          @0xBeefer
        </span>
        <span style={{ fontSize: '16px', color: colors.textMuted }}>
          0xbeef.wtf
        </span>
      </div>
    </div>
  );
}
