# Interactive Bot Simulation via Playwright

You are orchestrating a live simulation of the $BEEF Twitter roast bot.
The goal: visually test **real bot components** (MentionHandler, RoastEngine, ContentFilter, TwitterClient) through a browser so the user can see exactly what happens.

## Architecture

- **Playwright MCP** opens a real browser (twitter.com) — visual feedback layer
- **`scripts/simulate.ts`** calls actual bot code — the real execution layer
- You are the orchestrator — connecting visual + execution

Every command below uses the REAL bot code, same as production.

## Phase 1: Setup

1. Open Playwright browser (headed mode): navigate to `https://twitter.com`
2. Tell the user: "Log in as @BeefThis. Tell me when you're done."
3. Wait for user confirmation
4. Navigate to `https://twitter.com/notifications` to verify login works
5. Take a screenshot and show the user their notifications

## Phase 2: Mention Scan

1. Run the real MentionHandler:
   ```bash
   cd /Users/nikitagorokhov/dev/twitter-agents/beef && npx tsx scripts/simulate.ts mentions
   ```
2. Parse the output — each mention has: tweetId, author, text, classification (roast_request/challenge/reply)
3. Show the user a summary: "Found N mentions. Here are the ones worth responding to:"
4. For each interesting mention (roast_request or bare mention), navigate Playwright to `https://twitter.com/i/status/<tweetId>` and take a screenshot
5. Ask user: "Which one should we roast? Or provide a custom target."

## Phase 3: Roast Generation

1. Take the selected target (mention text, parent tweet, or custom target name)
2. Generate roast using the real RoastEngine:
   ```bash
   cd /Users/nikitagorokhov/dev/twitter-agents/beef && npx tsx scripts/simulate.ts roast "<target>"
   ```
3. This runs the full 3×3 multi-strategy pipeline (rubric + persona + adversarial × 3 variants each)
4. Parse the output — show all variants with scores and angles
5. Test each variant through the real ContentFilter:
   ```bash
   cd /Users/nikitagorokhov/dev/twitter-agents/beef && npx tsx scripts/simulate.ts filter "<variant text>"
   ```
6. Present to user: "Here are the top 3 variants. The best scoring one is marked ★. Want to post it?"

## Phase 4: Posting (with approval)

**ALWAYS ask for explicit user approval before posting.**

1. If the user approves a variant:
   - For a mention reply:
     ```bash
     cd /Users/nikitagorokhov/dev/twitter-agents/beef && npx tsx scripts/simulate.ts reply <tweetId> "<roast text>"
     ```
   - For a standalone roast:
     ```bash
     cd /Users/nikitagorokhov/dev/twitter-agents/beef && npx tsx scripts/simulate.ts post "<roast text>"
     ```
2. After posting, navigate Playwright to the tweet URL from the output
3. Take a screenshot showing the posted tweet
4. Report: tweet URL, character count, whether it was dry-run or live

## Phase 5: Evaluation

After each cycle, report what was tested:

| Component | Status | Notes |
|-----------|--------|-------|
| TwitterClient.getMentions() | OK/FAIL | {mention count, any errors} |
| MentionHandler.classifyMention() | OK/FAIL | {classification accuracy} |
| RoastEngine (3×3 multi-strategy) | OK/FAIL | {strategies succeeded, variant count, timing} |
| ContentFilter | OK/FAIL | {pass/fail counts, filter reasons} |
| TwitterClient.postTweet/replyToTweet | OK/FAIL | {dry-run or live, tweet ID} |

Ask the user: "Want to do another cycle, or are we done?"

## Important Notes

- DRY_RUN is controlled by `.env` — if `DRY_RUN=true`, posts return fake IDs (safe for testing)
- The `roast` command takes 30-90 seconds (3 parallel LLM calls via Claude Code CLI)
- If any component fails, report the error clearly — this IS the testing
- All commands run from: `cd /Users/nikitagorokhov/dev/twitter-agents/beef`
- The simulation script uses the same DB, same config, same providers as the production bot
