import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import sharp from 'sharp';
import { satoriFonts } from './fonts.js';
import { sizes } from './theme.js';
import { artScenes } from './assets.js';
import type { CardData } from './types.js';

import { RoastCard } from './templates/roast-card.js';
import { StatsOverview } from './templates/stats-overview.js';
import { Leaderboard } from './templates/leaderboard.js';
import { NumberCard } from './templates/number-card.js';
import { StatDuo } from './templates/stat-duo.js';
import { StatQuad } from './templates/stat-quad.js';

interface GenerateOptions {
  format?: 'jpeg' | 'png';
  quality?: number;
}

export async function generateCard(
  card: CardData,
  options: GenerateOptions = {},
): Promise<Buffer> {
  const { format = 'jpeg', quality = 90 } = options;

  const { element, width, height, artBg, artOpacity = 1.0 } = resolveTemplate(card);

  // 1. Render JSX → SVG via satori
  const svg = await satori(element, {
    width,
    height,
    fonts: satoriFonts,
  });

  // 2. SVG → PNG via resvg
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: width },
  });
  const rendered = resvg.render();
  const dataPng = rendered.asPng();

  // 3. Composite with art background and add border frame
  let output: Buffer;

  if (artBg) {
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

  // 4. Add red border frame for light/dark theme compatibility
  output = await addBorderFrame(output, width, height, format, quality);

  return output;
}

async function addBorderFrame(
  input: Buffer,
  width: number,
  height: number,
  format: 'jpeg' | 'png',
  quality: number,
): Promise<Buffer> {
  const borderWidth = 3;
  const borderColor = { r: 204, g: 0, b: 0, alpha: 0.6 };

  // Create a border overlay as SVG
  const borderSvg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <rect x="0" y="0" width="${width}" height="${height}"
      fill="none"
      stroke="rgba(${borderColor.r},${borderColor.g},${borderColor.b},${borderColor.alpha})"
      stroke-width="${borderWidth * 2}" />
  </svg>`;

  return sharp(input)
    .composite([{ input: Buffer.from(borderSvg), blend: 'over' }])
    .toFormat(format, format === 'jpeg' ? { quality, progressive: true } : {})
    .toBuffer();
}

interface TemplateResult {
  element: React.ReactElement;
  width: number;
  height: number;
  artBg: Buffer | null;
  artOpacity?: number;
}

function resolveTemplate(card: CardData): TemplateResult {
  switch (card.type) {
    case 'roast':
      return {
        element: RoastCard(card.data),
        width: sizes.card.width,
        height: sizes.card.height,
        artBg: artScenes.accuse,
        artOpacity: 0.7,
      };
    case 'stats-overview':
      return {
        element: StatsOverview(card.data),
        width: sizes.card.width,
        height: sizes.card.height,
        artBg: artScenes.analyst,
        artOpacity: 0.7,
      };
    case 'leaderboard':
      return {
        element: Leaderboard(card.data),
        width: sizes.square.width,
        height: sizes.square.height,
        artBg: artScenes.arena,
        artOpacity: 0.3,
      };
    case 'number-card':
      return {
        element: NumberCard(card.data),
        width: sizes.card.width,
        height: sizes.card.height,
        artBg: artScenes.explosion,
        artOpacity: 0.8,
      };
    case 'stat-duo':
      return {
        element: StatDuo(card.data),
        width: sizes.square.width,
        height: sizes.square.height,
        artBg: artScenes.present,
        artOpacity: 0.3,
      };
    case 'stat-quad':
      return {
        element: StatQuad(card.data),
        width: sizes.card.width,
        height: sizes.card.height,
        artBg: artScenes.analyst,
        artOpacity: 0.6,
      };
  }
}
