#!/usr/bin/env npx tsx
/**
 * Codex Roast Test — generate roasts via Codex (GPT-5.4), evaluate with Sonnet.
 *
 * Usage:
 *   npx tsx scripts/codex-roast-test.ts
 *
 * Same pipeline as /roasttweet but with CodexProvider as generator.
 * Sends results to Telegram with CODEX label for blind comparison.
 */

import { config } from 'dotenv';
config({ override: true });
config({ path: '.env.production' });

import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDatabase } from '@storage/database.js';
import { LlmLogRepository } from '@storage/repositories/llm-log.repository.js';
import { CodexProvider } from '@agent/codex.provider.js';
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
// Target tweets
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
    url: 'https://x.com/MerlijnTrader/status/2036714709068456042',
    tweetId: '2036714709068456042',
    authorUsername: 'MerlijnTrader',
    authorName: 'Merlijn The Trader',
    authorBio: 'Sharing as a Bitcoin & Altcoin trader my unfiltered life',
    authorFollowers: 421_608,
    authorFollowing: 243,
    authorTweets: 54_227,
    tweetText: 'INSIGHTS:\n\nThe CLARITY Act just solved the stablecoin debate.\n\nEarn yield through activity. Not just holding.\nBanks agreed. Crypto agreed. Done.\n\nOne question remains: what counts as "activity"?\nThat battle will define the next cycle.\n\nSmart money is already positioning',
    metrics: { likes: 228, rts: 55, replies: 13, views: 23_578 },
  },
  {
    url: 'https://x.com/ETH_Daily/status/2036716684120334359',
    tweetId: '2036716684120334359',
    authorUsername: 'ETH_Daily',
    authorName: 'Ethereum Daily',
    authorBio: '#Ethereum #ETH #Layer2 Guides.',
    authorFollowers: 102_953,
    authorFollowing: 504,
    authorTweets: 14_103,
    tweetText: 'BlackRock didn\'t launch its iShares Staked Ethereum Trust (ETHB) by chance. The March 12, 2026 debut of the staking-enabled Ethereum ETF—weeks before the latest CLARITY Act draft—signals foresight into a major regulatory pivot.\n\nIf passed, the Clarity Act will ban passive yields',
    metrics: { likes: 67, rts: 7, replies: 7, views: 2_698 },
  },
  {
    url: 'https://x.com/ryandcrypto/status/2036525960120639778',
    tweetId: '2036525960120639778',
    authorUsername: 'ryandcrypto',
    authorName: 'ryandcrypto',
    authorBio: 'dm: https://t.co/HwCoKdoF9r',
    authorFollowers: 233_461,
    authorFollowing: 3_840,
    authorTweets: 25_188,
    tweetText: 'Old airdrops created generational wealth..\n\n- Hyperliquid → $5k–1M+\n- Pudgy Penguins → $10k–$500k+\n- Starknet → $1k–$360k+\n- Portal → $50k–$350k\n- Blur → $20k–$300k+\n- Jupiter → $2k–$246k+\n- ApeCoin → $80k–$200k+\n- GMRX → $10k–$75k+\n- ENS → $10k–$50k\n- LooksRare →',
    metrics: { likes: 163, rts: 9, replies: 45, views: 18_589 },
  },
  {
    url: 'https://x.com/DamiDefi/status/2036723769063141495',
    tweetId: '2036723769063141495',
    authorUsername: 'DamiDefi',
    authorName: 'Dami-Defi',
    authorBio: 'Former marketing lead at global Top 100 company. Crypto since 2018. Sharing strategies that actually work. @bitget Partner.',
    authorFollowers: 92_471,
    authorFollowing: 617,
    authorTweets: 30_468,
    tweetText: 'I don\'t want another chain.\nI don\'t want every protocol to launch a token.\nI don\'t want more promises about the future of finance.\n\nI want sending money to feel easy.\nI want swaps that don\'t feel risky.\nI want wallets that don\'t confuse people.',
    metrics: { likes: 100, rts: 10, replies: 5, views: 7_935 },
  },
];

// ---------------------------------------------------------------------------
// Config — mirrors /roasttweet pipeline
// ---------------------------------------------------------------------------

const VARIANTS_PER_STRATEGY = 2; // 2 × 2 strategies = 4 candidates
const MUTATION_COUNT = 1;
const PROFILE = 'farm-generate' as const;
const EVALUATION_MODE = 'serious' as const;
const EVALUATION_THRESHOLD = 3.0;

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

  lines.push(`<b>CODEX ROAST TEST — GPT-5.4</b>`);
  lines.push(`<i>Codex generates, Sonnet evaluates (5-judge panel)</i>`);
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

    const tweetPreview = target.tweetText.length > 120
      ? target.tweetText.slice(0, 117) + '...'
      : target.tweetText;
    lines.push(`<i>${escapeHtml(tweetPreview)}</i>`);
    lines.push(``);

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
  lines.push(`<i>#BeefFarm #codexTest</i>`);

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const logger = createFarmLogger();
  const db = createDatabase(DB_PATH, logger);
  const llmLog = new LlmLogRepository(db);

  // Codex for generation, Claude (Sonnet) for evaluation
  const codex = new CodexProvider(logger, llmLog);
  const claude = new ClaudeCodeProvider(logger, llmLog);
  const alerter = { send: (msg: string) => Promise.resolve(logger.warn({ alert: msg }, 'Alert')) };
  const generatorProvider = new ProviderManager(codex, [], alerter, logger);
  const evaluatorProvider = new ProviderManager(claude, [], alerter, logger);

  const engine = new RoastEngine({
    provider: generatorProvider,
    evaluationProvider: evaluatorProvider,
    logger,
    variantCount: VARIANTS_PER_STRATEGY,
    evaluationMode: EVALUATION_MODE,
    evaluationThreshold: EVALUATION_THRESHOLD,
  });

  console.log(`\n=== CODEX ROAST TEST ===`);
  console.log(`Generator: Codex CLI (GPT-5.4) with web_search`);
  console.log(`Evaluator: Sonnet (5-judge panel)`);
  console.log(`Variants: ${String(VARIANTS_PER_STRATEGY)} per strategy × 2 strategies = ${String(VARIANTS_PER_STRATEGY * 2)} candidates`);
  console.log(`Mutations: ${String(MUTATION_COUNT)}`);
  console.log(`Evaluation: ${EVALUATION_MODE} (threshold ${String(EVALUATION_THRESHOLD)})`);
  console.log(`Targets: ${String(TARGETS.length)}\n`);

  const outputs: RoastOutput[] = [];

  for (const target of TARGETS) {
    console.log(`\n--- Generating via CODEX for @${target.authorUsername} (${target.tweetId}) ---`);
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
        'codex-test',
        memory,
        PROFILE,
        VARIANTS_PER_STRATEGY,
        undefined,
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
      logger.error({ err: error, target: target.authorUsername }, 'Codex roast failed');
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

  console.log('\n=== CODEX TEST COMPLETE ===\n');
  db.close();
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
