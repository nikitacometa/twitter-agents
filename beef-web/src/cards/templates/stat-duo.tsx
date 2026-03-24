import type { StatDuoData } from '../types.js';
import { colors, fonts } from '../theme.js';

export function StatDuo(data: StatDuoData): React.ReactElement {
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
          audit data
        </span>
      </div>

      {/* Red divider */}
      <div
        style={{
          display: 'flex',
          width: '100%',
          height: '3px',
          background: `linear-gradient(90deg, ${colors.red}, ${colors.redBright}, transparent)`,
          marginBottom: '32px',
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
            marginBottom: '40px',
          }}
        >
          {data.targetName}
        </span>
      )}

      {/* Two stat panels */}
      <div
        style={{
          display: 'flex',
          flex: 1,
          gap: '0px',
        }}
      >
        {data.stats.map((stat, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              flex: 1,
              padding: '40px 36px',
              borderRight: i === 0 ? `1px solid ${colors.border}` : 'none',
            }}
          >
            <span
              style={{
                fontFamily: fonts.slab,
                fontSize: '88px',
                fontWeight: 700,
                color: colors.red,
                lineHeight: 1,
                marginBottom: '16px',
              }}
            >
              {stat.value}
            </span>
            <span
              style={{
                fontSize: '22px',
                color: colors.textDim,
                lineHeight: 1.4,
              }}
            >
              {stat.label}
            </span>
          </div>
        ))}
      </div>

      {/* Source text */}
      {data.sourceText && (
        <div
          style={{
            display: 'flex',
            borderTop: `1px solid ${colors.border}`,
            paddingTop: '24px',
            marginTop: '16px',
          }}
        >
          <span
            style={{
              fontSize: '20px',
              color: colors.textMuted,
              fontStyle: 'italic',
              lineHeight: 1.5,
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
          paddingTop: '20px',
        }}
      >
        <span style={{ fontSize: '16px', color: colors.textMuted }}>
          0xbeef.wtf
        </span>
      </div>
    </div>
  );
}
