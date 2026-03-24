import type { NumberCardData } from '../types.js';
import { colors, fonts } from '../theme.js';

export function NumberCard(data: NumberCardData): React.ReactElement {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        width: '1600px',
        height: '900px',
        fontFamily: fonts.mono,
        color: colors.text,
      }}
    >
      {/* Top branding — positioned at top */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: '36px',
          left: '56px',
          fontSize: '20px',
          fontWeight: 700,
          color: colors.red,
        }}
      >
        @0xBeefer
      </div>

      {/* Center overlay panel */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '56px 80px',
          background: 'rgba(10,10,10,0.82)',
          borderRadius: '8px',
          border: `1px solid rgba(204,0,0,0.3)`,
          maxWidth: '900px',
        }}
      >
        {/* Big number */}
        <span
          style={{
            fontFamily: fonts.slab,
            fontSize: '140px',
            fontWeight: 700,
            color: colors.red,
            lineHeight: 1,
            letterSpacing: '-0.04em',
            marginBottom: '12px',
          }}
        >
          {data.number}
        </span>

        {/* Achievement */}
        <span
          style={{
            fontFamily: fonts.slab,
            fontSize: '40px',
            fontWeight: 600,
            color: colors.text,
            lineHeight: 1.2,
            textAlign: 'center',
            marginBottom: '20px',
          }}
        >
          {data.achievement}
        </span>

        {/* Supporting text */}
        <span
          style={{
            fontSize: '22px',
            color: colors.textDim,
            textAlign: 'center',
            lineHeight: 1.5,
            maxWidth: '700px',
          }}
        >
          {data.supportingText}
        </span>
      </div>

      {/* Bottom branding */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          bottom: '36px',
          right: '56px',
          fontSize: '16px',
          color: colors.textMuted,
        }}
      >
        0xbeef.wtf
      </div>
    </div>
  );
}
