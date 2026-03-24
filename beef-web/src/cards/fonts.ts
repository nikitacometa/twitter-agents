import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FONTS_DIR = join(__dirname, '../../assets/fonts');

function loadFont(file: string): Buffer {
  return readFileSync(join(FONTS_DIR, file));
}

// Loaded once at module init — reused across all satori calls
export const satoriFonts = [
  {
    name: 'IBM Plex Mono',
    data: loadFont('IBMPlexMono-Regular.ttf'),
    weight: 400 as const,
    style: 'normal' as const,
  },
  {
    name: 'IBM Plex Mono',
    data: loadFont('IBMPlexMono-SemiBold.ttf'),
    weight: 600 as const,
    style: 'normal' as const,
  },
  {
    name: 'IBM Plex Mono',
    data: loadFont('IBMPlexMono-Bold.ttf'),
    weight: 700 as const,
    style: 'normal' as const,
  },
  {
    name: 'Zilla Slab',
    data: loadFont('ZillaSlab-Medium.ttf'),
    weight: 500 as const,
    style: 'normal' as const,
  },
  {
    name: 'Zilla Slab',
    data: loadFont('ZillaSlab-SemiBold.ttf'),
    weight: 600 as const,
    style: 'normal' as const,
  },
  {
    name: 'Zilla Slab',
    data: loadFont('ZillaSlab-Bold.ttf'),
    weight: 700 as const,
    style: 'normal' as const,
  },
];
