#!/usr/bin/env npx tsx
/**
 * Power Roast Pipeline — maximum quality tweet-mode roast generation.
 *
 * Usage:
 *   npx tsx scripts/power-roast.ts
 *
 * Hardcoded targets below. Generates roasts with:
 *   - roast-power profile (Opus + high effort + Perplexity/WebSearch)
 *   - 5 variants per strategy × 3 strategies = 15 candidates per tweet
 *   - 3 mutations for diversity
 *   - serious evaluation (5-judge panel)
 *   - Sends results to Telegram
 */

import { config } from 'dotenv';
config({ override: true });
config({ path: '.env.production' });

import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDatabase } from '@storage/database.js';
import { LlmLogRepository } from '@storage/repositories/llm-log.repository.js';
import { ClaudeCodeProvider } from '@agent/claude-code.provider.js';
import { ProviderManager } from '@agent/provider-manager.js';
import { RoastEngine } from '@roast/roast-engine.js';
import type { RoastResult } from '@roast/roast-engine.js';
import type { CreativeMemory } from '@common/types/index.js';
import { createFarmLogger } from '../src/farm/logger.js';
import { sendFarmNotification } from '../src/farm/notify.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = resolve(__dirname, '../data/beef.db');

// ---------------------------------------------------------------------------
// Target tweets — hardcoded for this run
// ---------------------------------------------------------------------------

interface TweetTarget {
  url: string;
  tweetId: string;
  authorUsername: string;
  authorName: string;
  authorBio: string;
  authorFollowers: number;
  authorFollowing: number;
  authorTweets: number;
  tweetText: string;
  metrics: { likes: number; rts: number; replies: number; views: number };
}

const TARGETS: TweetTarget[] = [
  {
    url: 'https://x.com/CryptoTice_/status/2036699609179840750',
    tweetId: '2036699609179840750',
    authorUsername: 'CryptoTice_',
    authorName: 'Crypto Tice',
    authorBio: '21 | Turning Charts Into Cash Daily...\n\nNot financial advice DYOR.',
    authorFollowers: 315_361,
    authorFollowing: 145,
    authorTweets: 7_642,
    tweetText: 'Crypto and banks just struck a deal. 🚨\n\nThe war over stablecoin yield is over.\n\nThe CLARITY Act has a new draft. Both sides agreed.\nEarn rewards through activity allowed.\nEarn yield just for holding banned.\n\nThis was the single issue that almost killed the entire bill.',
    metrics: { likes: 341, rts: 71, replies: 23, views: 14_211 },
  },
  {
    url: 'https://x.com/lulupengue/status/2036587206429552722',
    tweetId: '2036587206429552722',
    authorUsername: 'lulupengue',
    authorName: 'lulu',
    authorBio: 'nothing to say',
    authorFollowers: 723,
    authorFollowing: 139,
    authorTweets: 3_480,
    tweetText: 'By the way, $ALGO will flip $XRP',
    metrics: { likes: 47, rts: 5, replies: 1, views: 674 },
  },
  {
    url: 'https://x.com/Justin_Bons/status/2036573980975333451',
    tweetId: '2036573980975333451',
    authorUsername: 'Justin_Bons',
    authorName: 'Justin Bons',
    authorBio: 'Founder & CIO of @CyberCapital Europe\'s Oldest Cryptocurrency Fund, full-time crypto researcher since 2013. My words are my own & are not investment advice.',
    authorFollowers: 65_847,
    authorFollowing: 970,
    authorTweets: 19_244,
    tweetText: 'Crypto is winning:\n\nCollecting Billions of dollars in fees. Do not fall for the lie that crypto\'s usage is fake\n\nIt is impossible to fake large-scale fees on public, decentralized & permissionless blockchains\n\nFees are distributed among validators: So, on-chain usage is all REAL!',
    metrics: { likes: 45, rts: 2, replies: 17, views: 3_419 },
  },
  {
    url: 'https://x.com/HYPERDailyTK/status/2036655345339392100',
    tweetId: '2036655345339392100',
    authorUsername: 'HYPERDailyTK',
    authorName: 'Hyperliquid Daily',
    authorBio: '',
    authorFollowers: 87_769,
    authorFollowing: 167,
    authorTweets: 6_834,
    tweetText: 'Hyperliquid is straight-up DOMINATING the perpetuals game\n\nIts 24-hour open interest just smashed nearly $7B, that\'s almost 4x Aster\'s.\n\nHyperliquid isn\'t just leading… it\'s leaving everyone else in the dust',
    metrics: { likes: 129, rts: 12, replies: 14, views: 8_045 },
  },
];

// ---------------------------------------------------------------------------
// Config — maximum quality
// ---------------------------------------------------------------------------

const VARIANTS_PER_STRATEGY = 2; // 2 × 2 strategies = 4 candidates (mirrors /roasttweet)
const MUTATION_COUNT = 1;
const PROFILE = 'farm-generate' as const; // Opus + high effort + research tools
const EVALUATION_MODE = 'serious' as const; // 5-judge panel — tests M5 judge reform
const EVALUATION_THRESHOLD = 3.0; // Lower than default 3.5 to capture more for selection

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildProfileContext(t: TweetTarget): string {
  return [
    `TARGET TWEET:`,
    `"${t.tweetText}"`,
    ``,
    `Tweet metrics: ${t.metrics.likes} likes, ${t.metrics.rts} RTs, ${t.metrics.replies} replies, ${t.metrics.views} views`,
    ``,
    `AUTHOR PROFILE:`,
    `@${t.authorUsername} (${t.authorName})`,
    `Bio: ${t.authorBio}`,
    `Followers: ${t.authorFollowers.toLocaleString()} | Following: ${t.authorFollowing} | Tweets: ${t.authorTweets.toLocaleString()}`,
  ].join('\n');
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

interface RoastOutput {
  target: TweetTarget;
  result: RoastResult;
}

function formatTelegramMessage(outputs: RoastOutput[]): string {
  const lines: string[] = [];

  lines.push(`<b>TWEET ROAST TEST — M5+M6</b>`);
  lines.push(`<i>Opus + 2 strategies (rubric+adversarial) + 5-judge panel (reformed)</i>`);
  lines.push(`<i>${VARIANTS_PER_STRATEGY} variants × 2 strategies = ${String(VARIANTS_PER_STRATEGY * 2)} candidates/tweet</i>`);
  lines.push(``);
  lines.push(`────────────────────`);

  for (let i = 0; i < outputs.length; i++) {
    const { target, result } = outputs[i]!;
    const best = result.draft.variants[0];
    const evalScore = result.evaluation?.compositeScore;
    const evalVerdict = result.evaluation?.verdict;
    const totalVariants = result.draft.variants.length + result.filtered.length;

    lines.push(``);
    lines.push(`<b>${String(i + 1)}. @${escapeHtml(target.authorUsername)}</b>`);
    lines.push(`<a href="${target.url}">Tweet link</a>`);
    lines.push(``);

    // Original tweet (truncated)
    const tweetPreview = target.tweetText.length > 120
      ? target.tweetText.slice(0, 117) + '...'
      : target.tweetText;
    lines.push(`<i>${escapeHtml(tweetPreview)}</i>`);
    lines.push(``);

    // Best roast
    if (best) {
      lines.push(`<b>BEST ROAST:</b>`);
      lines.push(`<pre>${escapeHtml(best.text)}</pre>`);
      lines.push(``);
      lines.push(
        `Self-score: <code>${best.score.toFixed(1)}</code> | ` +
        `Angle: <code>${escapeHtml(best.angle)}</code> | ` +
        `Chars: <code>${String(best.text.length)}</code>`,
      );
    }

    if (evalScore !== undefined) {
      lines.push(
        `Judge panel: <b>${evalScore.toFixed(1)}</b> (${evalVerdict ?? '?'}) | ` +
        `Variance: <code>${(result.evaluation?.judgeVariance ?? 0).toFixed(2)}</code>`,
      );
      if (result.evaluation?.vetoReasons?.length) {
        lines.push(`Vetoes: <code>${escapeHtml(result.evaluation.vetoReasons.join('; '))}</code>`);
      }
    }

    lines.push(`Candidates: <code>${String(totalVariants)}</code> generated, <code>${String(result.filtered.length)}</code> filtered`);
    lines.push(`Duration: <code>${(result.durationMs / 1000).toFixed(0)}s</code>`);

    // Runner-ups (top 2-3 if available)
    const runners = result.draft.variants.slice(1, 4);
    if (runners.length > 0) {
      lines.push(``);
      lines.push(`<i>Runner-ups:</i>`);
      for (const r of runners) {
        lines.push(`<pre>${escapeHtml(r.text)}</pre>`);
        lines.push(`  <code>${r.score.toFixed(1)}</code> [${escapeHtml(r.angle)}] ${String(r.text.length)}ch`);
      }
    }

    lines.push(``);
    lines.push(`────────────────────`);
  }

  lines.push(``);
  lines.push(`<i>#BeefFarm #powerRoast</i>`);

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const logger = createFarmLogger();
  const db = createDatabase(DB_PATH, logger);
  const llmLog = new LlmLogRepository(db);

  const primary = new ClaudeCodeProvider(logger, llmLog);
  const alerter = { send: (msg: string) => Promise.resolve(logger.warn({ alert: msg }, 'Alert')) };
  const provider = new ProviderManager(primary, null, alerter, logger);

  const engine = new RoastEngine({
    provider,
    logger,
    variantCount: VARIANTS_PER_STRATEGY,
    evaluationMode: EVALUATION_MODE,
    evaluationThreshold: EVALUATION_THRESHOLD,
  });

  console.log(`\n=== POWER ROAST SESSION ===`);
  console.log(`Profile: ${PROFILE} (Opus + high effort + research)`);
  console.log(`Variants: ${String(VARIANTS_PER_STRATEGY)} per strategy × 2 strategies = ${String(VARIANTS_PER_STRATEGY * 2)} candidates`);
  console.log(`Mutations: ${String(MUTATION_COUNT)}`);
  console.log(`Evaluation: ${EVALUATION_MODE} (5-judge panel, threshold ${String(EVALUATION_THRESHOLD)})`);
  console.log(`Targets: ${String(TARGETS.length)}\n`);

  const outputs: RoastOutput[] = [];

  for (const target of TARGETS) {
    console.log(`\n--- Generating for @${target.authorUsername} (${target.tweetId}) ---`);
    console.log(`Tweet: ${target.tweetText.slice(0, 80)}...`);

    const memory: CreativeMemory = {
      fireExamples: [],
      tweetMode: true,
      targetType: 'person',
      profileContext: buildProfileContext(target),
    };

    try {
      const result = await engine.generateRoast(
        target.authorUsername,
        'power-script',
        memory,
        PROFILE,
        VARIANTS_PER_STRATEGY,
        undefined, // no images
        MUTATION_COUNT,
      );

      outputs.push({ target, result });

      const best = result.draft.variants[0];
      console.log(`\n  BEST: "${best?.text ?? 'none'}"`);
      console.log(`  Self-score: ${best?.score.toFixed(1) ?? 'N/A'} | Judge: ${result.evaluation?.compositeScore.toFixed(1) ?? 'N/A'} (${result.evaluation?.verdict ?? 'N/A'})`);
      console.log(`  Total: ${String(result.draft.variants.length + result.filtered.length)} generated, ${String(result.filtered.length)} filtered, ${String(result.draft.variants.length)} passed`);
      console.log(`  Duration: ${(result.durationMs / 1000).toFixed(0)}s`);
    } catch (error) {
      console.error(`  FAILED: ${error instanceof Error ? error.message : String(error)}`);
      logger.error({ err: error, target: target.authorUsername }, 'Power roast failed');
    }
  }

  // --- Send to Telegram ---
  if (outputs.length > 0) {
    const botToken = process.env['TELEGRAM_BOT_TOKEN'];
    const chatId = process.env['TELEGRAM_CHAT_ID'];

    if (botToken && chatId) {
      console.log('\nSending results to Telegram...');
      const message = formatTelegramMessage(outputs);
      try {
        await sendFarmNotification(botToken, chatId, message);
        console.log('Telegram notification sent!');
      } catch (error) {
        console.error(`Telegram send failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    } else {
      console.warn('\nTELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set — printing results only.');
    }
  }

  console.log('\n=== SESSION COMPLETE ===\n');
  db.close();
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
