import type { RoastCardData } from '../types.js';
import { colors, fonts, scoreToVerdict, verdictColor, targetTypeColor } from '../theme.js';

export function RoastCard(data: RoastCardData): React.ReactElement {
  const verdict = scoreToVerdict(data.qualityScore);
  const vColor = verdictColor(verdict);
  const typeColor = targetTypeColor(data.targetType);
  const ts = data.timestamp ?? new Date().toISOString().split('T')[0];

  const textLen = data.roastText.length;
  const roastFontSize = textLen > 220 ? '26px' : textLen > 160 ? '30px' : '34px';

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
      {/* Left side — transparent, art shows through */}
      <div style={{ display: 'flex', width: '640px', height: '900px' }} />

      {/* Right side — dark overlay panel */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: '960px',
          height: '900px',
          padding: '48px 56px',
          background: colors.overlay,
        }}
      >
        {/* Header bar */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '16px',
          }}
        >
          <span
            style={{
              fontSize: '20px',
              fontWeight: 700,
              color: colors.red,
            }}
          >
            @0xBeefer
          </span>

          <div
            style={{
              display: 'flex',
              fontFamily: fonts.slab,
              fontSize: '16px',
              fontWeight: 700,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: colors.red,
              border: `2px solid ${colors.red}`,
              padding: '4px 14px',
              opacity: 0.8,
            }}
          >
            audited
          </div>
        </div>

        {/* Red divider */}
        <div
          style={{
            display: 'flex',
            width: '100%',
            height: '2px',
            background: `linear-gradient(90deg, ${colors.red}, ${colors.redBright}, transparent)`,
            marginBottom: '36px',
          }}
        />

        {/* Target name + type badge */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '16px', marginBottom: '12px' }}>
          <span
            style={{
              fontFamily: fonts.slab,
              fontSize: '52px',
              fontWeight: 700,
              color: colors.text,
              lineHeight: 1.1,
            }}
          >
            {data.targetName}
          </span>
          <span
            style={{
              fontSize: '14px',
              fontWeight: 700,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: typeColor,
              border: `2px solid ${typeColor}`,
              padding: '3px 10px',
              borderRadius: '3px',
            }}
          >
            {data.targetType}
          </span>
        </div>

        {/* Roast text */}
        <div
          style={{
            display: 'flex',
            flex: 1,
            alignItems: 'center',
          }}
        >
          <span
            style={{
              fontSize: roastFontSize,
              lineHeight: 1.5,
              color: colors.text,
            }}
          >
            {data.roastText}
          </span>
        </div>

        {/* Bottom divider */}
        <div
          style={{
            display: 'flex',
            width: '100%',
            height: '2px',
            background: `linear-gradient(90deg, transparent, ${colors.red}40, transparent)`,
            marginBottom: '20px',
          }}
        />

        {/* Bottom bar — verdict + branding */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <span
              style={{
                fontSize: '18px',
                fontWeight: 700,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: vColor,
                border: `2px solid ${vColor}`,
                padding: '5px 16px',
                borderRadius: '3px',
              }}
            >
              {verdict}
            </span>
            <span
              style={{
                fontFamily: fonts.slab,
                fontSize: '28px',
                fontWeight: 700,
                color: vColor,
              }}
            >
              {data.qualityScore.toFixed(1)}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '16px', color: colors.textDim }}>
              {ts}
            </span>
            <span style={{ fontSize: '16px', color: colors.textMuted }}>
              0xbeef.wtf
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
