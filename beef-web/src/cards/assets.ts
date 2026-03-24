import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ART_DIR = join(__dirname, 'art');
const BEEF_ASSETS = join(__dirname, '../../../beef/assets');

function loadAsBase64(filePath: string, mime: string): string | null {
  if (!existsSync(filePath)) return null;
  const buf = readFileSync(filePath);
  return `data:${mime};base64,${buf.toString('base64')}`;
}

function loadBuffer(filePath: string): Buffer | null {
  if (!existsSync(filePath)) return null;
  return readFileSync(filePath);
}

// Bot avatar — loaded once
export const avatarDataUrl = loadAsBase64(
  join(BEEF_ASSETS, 'avatar_0xbeefer.png'),
  'image/png',
);

// AI art backgrounds — loaded as buffers for sharp compositing
export const artBackgrounds = {
  fireBg1: loadBuffer(join(ART_DIR, 'fire-bg-1.png')),
  fireBg2: loadBuffer(join(ART_DIR, 'fire-bg-2.png')),
  smokeDark: loadBuffer(join(ART_DIR, 'smoke-dark.png')),
  emberScatter: loadBuffer(join(ART_DIR, 'ember-scatter.png')),
  grillMarks: loadBuffer(join(ART_DIR, 'grill-marks.png')),
  skullCorner: loadBuffer(join(ART_DIR, 'skull-corner.png')),
  characterPresenting: loadBuffer(join(ART_DIR, 'character-presenting.png')),
  characterStats: loadBuffer(join(ART_DIR, 'character-stats.png')),
  fireDramatic: loadBuffer(join(ART_DIR, 'fire-dramatic.png')),
  dataGrid: loadBuffer(join(ART_DIR, 'data-grid.png')),
} as const;

// Pick a random art variant
export function randomFireBg(): Buffer | null {
  const variants = [artBackgrounds.fireBg1, artBackgrounds.fireBg2].filter(Boolean) as Buffer[];
  if (variants.length === 0) return null;
  return variants[Math.floor(Math.random() * variants.length)] ?? null;
}
