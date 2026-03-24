import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import sharp from 'sharp';
import { satoriFonts } from './fonts.js';
import { sizes } from './theme.js';
import { randomFireBg, artBackgrounds } from './assets.js';
import type { CardData } from './types.js';

import { RoastCard } from './templates/roast-card.js';
import { KillReport } from './templates/kill-report.js';
import { StatsDashboard } from './templates/stats-dashboard.js';
import { Leaderboard } from './templates/leaderboard.js';
import { Milestone } from './templates/milestone.js';

interface GenerateOptions {
  format?: 'jpeg' | 'png';
  quality?: number;
}

export async function generateCard(
  card: CardData,
  options: GenerateOptions = {},
): Promise<Buffer> {
  const { format = 'jpeg', quality = 90 } = options;

  // 1. Select template and dimensions
  const { element, width, height, artBg, artOpacity = 1.0 } = resolveTemplate(card);

  // 2. Render JSX → SVG via satori
  const svg = await satori(element, {
    width,
    height,
    fonts: satoriFonts,
  });

  // 3. SVG → PNG via resvg
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: width },
  });
  const rendered = resvg.render();
  const dataPng = rendered.asPng();

  // 4. Composite with art background (if available) and optimize
  let output: Buffer;

  if (artBg) {
    // Reduce art opacity by darkening it toward black
    const artLayer = await sharp(artBg)
      .resize(width, height, { fit: 'cover' })
      .modulate({ brightness: artOpacity })
      .toBuffer();

    output = await sharp(artLayer)
      .composite([{ input: dataPng, blend: 'over' }])
      .toFormat(format, format === 'jpeg' ? { quality, progressive: true } : {})
      .toBuffer();
  } else {
    output = await sharp(dataPng)
      .toFormat(format, format === 'jpeg' ? { quality, progressive: true } : {})
      .toBuffer();
  }

  return output;
}

interface TemplateResult {
  element: React.ReactElement;
  width: number;
  height: number;
  artBg: Buffer | null;
  artOpacity?: number; // 0-1, default 1.0
}

function resolveTemplate(card: CardData): TemplateResult {
  switch (card.type) {
    case 'roast':
      return {
        element: RoastCard(card.data),
        width: sizes.card.width,
        height: sizes.card.height,
        artBg: randomFireBg(),
        artOpacity: 0.6,
      };
    case 'kill-report':
      return {
        element: KillReport(card.data),
        width: sizes.card.width,
        height: sizes.card.height,
        artBg: artBackgrounds.emberScatter,
        artOpacity: 0.5,
      };
    case 'stats':
      return {
        element: StatsDashboard(card.data),
        width: sizes.card.width,
        height: sizes.card.height,
        artBg: artBackgrounds.smokeDark,
        artOpacity: 0.4,
      };
    case 'leaderboard':
      return {
        element: Leaderboard(card.data),
        width: sizes.square.width,
        height: sizes.square.height,
        artBg: artBackgrounds.emberScatter,
        artOpacity: 0.15,
      };
    case 'milestone':
      return {
        element: Milestone(card.data),
        width: sizes.card.width,
        height: sizes.card.height,
        artBg: randomFireBg(),
        artOpacity: 0.7,
      };
  }
}
