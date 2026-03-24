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

// AI art scene backgrounds — loaded as buffers for sharp compositing
export const artScenes = {
  accuse: loadBuffer(join(ART_DIR, 'scene-accuse.png')),
  analyst: loadBuffer(join(ART_DIR, 'scene-analyst.png')),
  arena: loadBuffer(join(ART_DIR, 'scene-arena.png')),
  explosion: loadBuffer(join(ART_DIR, 'scene-explosion.png')),
  present: loadBuffer(join(ART_DIR, 'scene-present.png')),
} as const;
