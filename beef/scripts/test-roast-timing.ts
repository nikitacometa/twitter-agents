/**
 * Test script to measure actual roast generation timing.
 * Builds the exact same prompts as the bot and runs claude CLI.
 *
 * Usage: npx tsx scripts/test-roast-timing.ts [target]
 */

import { spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCharacter } from '../src/roast/character.loader.js';
import { buildRoastPrompt, buildNoResearchPrompt } from '../src/roast/prompt-builder.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const characterPath = resolve(__dirname, '../characters/beef-bot.json');

const target = process.argv[2] ?? 'opensea';
const character = loadCharacter(characterPath);

const ENV = {
  ...process.env,
  CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
  CLAUDE_CODE_DISABLE_CLAUDE_MDS: '1',
  CLAUDE_CODE_DISABLE_GIT_INSTRUCTIONS: '1',
  CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1',
};

function runClaude(
  label: string,
  prompt: string,
  opts: { model: string; effort: string; maxTurns: number; tools?: string[]; timeoutMs: number },
): Promise<void> {
  return new Promise((res) => {
    const args = [
      '-p', prompt,
      '--model', opts.model,
      '--effort', opts.effort,
      '--output-format', 'json',
      '--max-turns', String(opts.maxTurns),
      '--no-session-persistence',
    ];

    if (opts.tools && opts.tools.length > 0) {
      args.push('--allowedTools', opts.tools.join(','));
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(`${label}`);
    console.log(`Model: ${opts.model} | Effort: ${opts.effort} | MaxTurns: ${opts.maxTurns}`);
    console.log(`Tools: ${opts.tools?.join(', ') ?? 'none'}`);
    console.log(`Prompt length: ${prompt.length} chars`);
    console.log(`Timeout: ${opts.timeoutMs}ms`);
    console.log(`${'='.repeat(60)}`);

    const start = Date.now();

    const child = spawn('claude', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: ENV,
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });

    const timer = setTimeout(() => { child.kill('SIGTERM'); }, opts.timeoutMs);

    child.on('close', (code, signal) => {
      clearTimeout(timer);
      const elapsed = Date.now() - start;

      if (signal) {
        console.log(`FAILED (KILLED by ${signal}) after ${elapsed}ms`);
        if (stderr) console.log(`stderr: ${stderr.slice(0, 200)}`);
      } else if (code !== 0) {
        console.log(`FAILED (exit code ${String(code)}) after ${elapsed}ms`);
        if (stderr) console.log(`stderr: ${stderr.slice(0, 200)}`);
      } else {
        try {
          const parsed = JSON.parse(stdout.trim());
          console.log(`SUCCESS in ${elapsed}ms (API: ${parsed.duration_ms ?? '?'}ms, turns: ${parsed.num_turns ?? '?'})`);
          const result = parsed.result as string;
          const jsonMatch = result?.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const data = JSON.parse(jsonMatch[0]) as { variants?: Array<{ angle: string; text: string; score: number }> };
            for (const v of data.variants ?? []) {
              console.log(`  [${v.angle}] (${String(v.text.length)} chars, score ${String(v.score)}): ${v.text.slice(0, 100)}...`);
            }
          }
        } catch {
          console.log(`SUCCESS in ${elapsed}ms (raw: ${stdout.slice(0, 200)})`);
        }
      }

      res();
    });
  });
}

async function main(): Promise<void> {
  console.log(`Target: "${target}"`);
  console.log(`Character: ${character.meta.name} v${character.version}`);

  // Build full prompts
  const researchPrompt = buildRoastPrompt(target, character, 3);
  const quickPrompt = buildNoResearchPrompt(target, character, 3);

  console.log(`\nResearch prompt: ${researchPrompt.length} chars (~${Math.round(researchPrompt.length / 4)} tokens)`);
  console.log(`Quick prompt: ${quickPrompt.length} chars (~${Math.round(quickPrompt.length / 4)} tokens)`);

  const mode = process.argv[3] ?? 'all';

  if (mode === 'save') {
    const { writeFileSync } = await import('node:fs');
    writeFileSync('/tmp/beef-quick-prompt.txt', quickPrompt);
    writeFileSync('/tmp/beef-research-prompt.txt', researchPrompt);
    console.log('Saved prompts to /tmp/beef-quick-prompt.txt and /tmp/beef-research-prompt.txt');
    return;
  }

  if (mode === 'quick' || mode === 'all') {
    await runClaude('TEST: roast-quick (sonnet, low, 1 turn, no tools)', quickPrompt, {
      model: 'sonnet',
      effort: 'low',
      maxTurns: 1,
      timeoutMs: 90_000,
    });
  }

  if (mode === 'research' || mode === 'all') {
    await runClaude('TEST: roast-research (sonnet, medium, 5 turns, WebSearch)', researchPrompt, {
      model: 'sonnet',
      effort: 'medium',
      maxTurns: 5,
      tools: ['WebSearch'],
      timeoutMs: 180_000,
    });
  }

  console.log('\nDone.');
}

main().catch(console.error);
