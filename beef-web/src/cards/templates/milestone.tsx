import type { MilestoneData } from '../types.js';
import { colors, fonts } from '../theme.js';
import { avatarDataUrl } from '../assets.js';

export function Milestone(data: MilestoneData): React.ReactElement {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '1600px',
        height: '900px',
        fontFamily: fonts.mono,
        color: colors.text,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {/* Top thin red line */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: '0',
          left: '0',
          right: '0',
          height: '4px',
          background: `linear-gradient(90deg, transparent, ${colors.red}, ${colors.redBright}, ${colors.red}, transparent)`,
        }}
      />

      {/* Center content */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '12px',
        }}
      >
        {/* Big number / milestone */}
        <span
          style={{
            fontFamily: fonts.slab,
            fontSize: '144px',
            fontWeight: 700,
            color: colors.red,
            lineHeight: 1,
            letterSpacing: '-0.04em',
          }}
        >
          {data.number}
        </span>

        {/* Achievement text */}
        <span
          style={{
            fontFamily: fonts.slab,
            fontSize: '44px',
            fontWeight: 600,
            color: colors.text,
            lineHeight: 1.3,
            textAlign: 'center',
          }}
        >
          {data.achievement}
        </span>

        {/* Supporting text */}
        <span
          style={{
            fontSize: '24px',
            color: colors.textDim,
            lineHeight: 1.5,
            textAlign: 'center',
            maxWidth: '800px',
            marginTop: '12px',
          }}
        >
          {data.supportingText}
        </span>
      </div>

      {/* Avatar + branding */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          marginTop: '48px',
        }}
      >
        {avatarDataUrl && (
          <img src={avatarDataUrl} width={64} height={64} style={{ borderRadius: '50%' }} />
        )}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: '22px', fontWeight: 600, color: colors.text }}>
            @0xBeefer
          </span>
          <span style={{ fontSize: '16px', color: colors.textMuted }}>
            forensic accounting ai
          </span>
        </div>
      </div>

      {/* Bottom thin red line */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          bottom: '0',
          left: '0',
          right: '0',
          height: '4px',
          background: `linear-gradient(90deg, transparent, ${colors.red}, ${colors.redBright}, ${colors.red}, transparent)`,
        }}
      />
    </div>
  );
}
