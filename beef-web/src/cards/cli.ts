#!/usr/bin/env tsx
import { writeFileSync } from 'node:fs';
import { generateCard } from './generator.js';
import type { CardType, CardData } from './types.js';

const VALID_TYPES = ['roast', 'stats-overview', 'leaderboard', 'number-card', 'stat-duo', 'stat-quad'] as const;

async function main() {
  const args = process.argv.slice(2);

  const typeIdx = args.indexOf('--type');
  const dataIdx = args.indexOf('--data');
  const outputIdx = args.indexOf('--output');
  const formatIdx = args.indexOf('--format');

  if (typeIdx === -1 || dataIdx === -1) {
    console.error('Usage: tsx src/cards/cli.ts --type <type> --data <json> [--output <file>] [--format jpeg|png]');
    console.error(`Types: ${VALID_TYPES.join(', ')}`);
    process.exit(1);
  }

  const type = args[typeIdx + 1] as CardType;
  if (!VALID_TYPES.includes(type as typeof VALID_TYPES[number])) {
    console.error(`Invalid type: ${type}. Valid: ${VALID_TYPES.join(', ')}`);
    process.exit(1);
  }

  let dataJson: string;
  const rawData = args[dataIdx + 1];
  if (rawData === '-') {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) {
      chunks.push(chunk as Buffer);
    }
    dataJson = Buffer.concat(chunks).toString('utf-8');
  } else {
    dataJson = rawData ?? '{}';
  }

  const data = JSON.parse(dataJson);
  const format = (formatIdx !== -1 ? args[formatIdx + 1] : 'jpeg') as 'jpeg' | 'png';
  const outputPath = outputIdx !== -1 ? args[outputIdx + 1] : undefined;

  const card: CardData = { type, data } as CardData;
  const buffer = await generateCard(card, { format });

  if (outputPath) {
    writeFileSync(outputPath, buffer);
    console.log(`Generated ${type} card → ${outputPath} (${(buffer.length / 1024).toFixed(0)}KB)`);
  } else {
    process.stdout.write(buffer);
  }
}

main().catch((err) => {
  console.error('Card generation failed:', err);
  process.exit(1);
});
