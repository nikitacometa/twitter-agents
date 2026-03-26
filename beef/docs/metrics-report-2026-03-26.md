# Metrics Report — @0xBeefer — 2026-03-26

Full analytics report based on Twitter API v2 live data. Sync: 2026-03-26 18:34 UTC.

## Account Overview

| Metric | Previous (tweet-log) | Current (API) | Delta |
|---|---|---|---|
| Tweets | 8 | 121 | +113 |
| Followers | 2 | 26 | +24 (12x) |
| Impressions | 117 | 13,378 | +13,261 (114x) |
| Likes | 4 | 113 | +109 |
| Following | 3 | 90 | +87 |
| Avg ER | — | 3.76% | — |

## Key Findings

### 1. Reply-Guy Strategy Works

Replies outperform originals on both reach and engagement:

| Type | Count | Avg Imp | Avg ER |
|---|---|---|---|
| Replies | 103 | 120 | 4.07% |
| Original | 18 | 55 | 2.00% |

Replies get 2x impressions and 2x ER. With only 26 followers, feed-based reach is minimal — replies piggyback on target account audiences.

### 2. 46% of Tweets Are Dead (Zero Engagement)

| ER Bucket | Count | % | Avg Imp |
|---|---|---|---|
| 0% (zero engagement) | 56 | 46% | 48 |
| 0-1% | 13 | 11% | 582 |
| 1-3% | 15 | 12% | 128 |
| 3-5% | 10 | 8% | 68 |
| 5-10% | 8 | 7% | 29 |
| 10%+ | 18 | 15% | 16 |

Nearly half of all tweets receive zero likes, replies, or retweets despite getting impressions (avg 48). Root cause: replies to low-value accounts (spam, <50 followers) and poor timing.

### 3. Inverse Impressions-ER Correlation

| Impressions | Count | Avg ER |
|---|---|---|
| 500+ | 5 | 0.74% |
| 301-500 | 8 | 0.36% |
| 101-300 | 16 | 0.99% |
| 51-100 | 17 | 1.84% |
| 11-50 | 56 | 5.17% |
| 1-10 | 18 | 5.96% |

Classic new-account pattern. Twitter shows replies to target account audiences, but those audiences don't convert to engagement for an unknown bot. High ER only comes from direct interactions with known accounts.

### 4. ER Declining as Volume Increases

| Date | Tweets | Avg ER |
|---|---|---|
| Mar 22 | 9 | 7.74% |
| Mar 24 | 28 | 6.59% |
| Mar 25 | 37 | 2.72% |
| Mar 26 | 33 | 1.79% |

Clear trend: quality dilution. At 9 tweets/day, the bot picks good targets. At 33-37/day, it starts hitting low-value accounts to fill volume.

### 5. Target Selection — Winners and Losers

**High ROI targets:**

| Target | Tweets | Avg Imp | ER | Why |
|---|---|---|---|---|
| @WatcherGuru | 1 | 695 | 1.73% | Major news account, hot topic (Circle IPO), 12 likes |
| @NikitaCometa | 10 | 248 | 7.07% | Co-founder's audience, genuine engagement |
| @JohnnyCash4243 | 8 | 33 | 9.24% | Direct conversation, high reciprocal engagement |
| @Cointelegraph | 5 | 53 | 4.37% | News authority, roasts land well |

**Wasted effort:**

| Target | Tweets | Avg Imp | ER | Problem |
|---|---|---|---|---|
| @CryptoTice_ | 2 | 529 | 0.14% | Huge reach, zero conversion |
| @coinbureau | 2 | 380 | 0.17% | Same — audience ignores reply-guys |
| @HYPERDailyTK | 2 | 260 | 0.12% | Shill audience, no engagement |
| Spam accounts | ~15 | 6 | 0.0% | @danileone84, @Viviek4real1, @LeethalEmbrace, etc. |

### 6. Optimal Posting Parameters

**Time (UTC):**
- Best: 22:00 (14.3% ER), 18:00 (11.4% ER), 14:00 (9.1% ER)
- Worst: 04:00-07:00 (0% ER across 7 tweets)
- US evening (17:00-22:00 EST = 22:00-03:00 UTC) is prime time

**Day of week:**
- Best: Sunday (7.74% ER, 272 avg imp), Tuesday (6.59%)
- Worst: Thursday (1.79%), Saturday (3.12%)

**Tweet length:**
- Sweet spot: 80-140 chars (149 avg imp, 4.28% ER)
- Avoid: 200+ chars (0.35% ER)

### 7. Suppression Signals

3 tweets with anomalously low impressions (possible reply filtering):
- `@AIonBase_` — 0 impressions after 24h (full suppress)
- `@barkmeta` — 2 imp after 48h
- `@NikitaCometa @TortugaOracle` — 2 imp after 72h

Not a mass shadowban (other tweets perform normally). Likely per-reply filtering on specific accounts.

### 8. Winning Roast Patterns

**Quote-flip** (take a number from their tweet, flip it):
- @WatcherGuru: "$299 to $103. circle proved the only thing you can't stabilize..." — 695 imp, 12 likes
- @cryptorover: "$5.9M — roughly 1% of ark's circle position..." — 34 imp, 5 likes

**Hypocrisy/contradiction** (catch them contradicting themselves):
- @SatoshiFlipper: "march 3 you posted 'easy 3x' to $250 solana, march 25 sol is $92.12" — 33% ER
- @zachxbt: "called circle a 'bad actor' for not freezing in january, then 'liable' for freezing..." — good reach

**Absurd comparison** (real numbers + absurd analogy):
- Algorand: "won a turing award... built a chain where 97% of holders have zero knowledge of what PROFIT looks like" — 183 imp, 8 likes
- CZ: "prison sentence returned 94,000%" — 65 imp
- Cardano: "$149K last year on a $9.7B market cap. the IRS would classify this as a hobby" — 34 imp

## Recommendations

### Immediate (next session)

1. **Reduce volume to 15-20 replies/day + 3-5 originals.** Current 33-37/day is diluting quality. ER halved when volume doubled.

2. **Add minimum follower filter for targets.** Suggest 500+ followers minimum. 15+ tweets went to spam accounts (<50 followers) with 0 engagement each.

3. **Shift posting schedule.** Concentrate activity at 12:00-14:00 and 18:00-22:00 UTC. Disable 04:00-07:00 UTC entirely.

4. **Pin the Algorand tweet** (183 imp, 8 likes, 4.92% ER) instead of current pin (146 imp). Or create a new killer original.

### Strategic (this week)

5. **Prioritize news account replies.** One quality reply on @WatcherGuru = 695 imp, 12 likes. That's more than 10 replies on medium accounts combined. Add @whale_alert, @DefiLlama, @tier10k to priority monitoring.

6. **Double down on quote-flip pattern.** Consistently highest engagement. The bot should have explicit "grab their number, flip it" instructions in the prompt.

7. **Start follow-back growth loop.** Follow crypto reply-guy accounts (they follow back frequently). Current 26 followers limits organic original tweet reach.

8. **Track ER trend weekly.** If ER continues declining below 1.5%, the bot may be approaching spam classification territory.

### Monitoring

9. **Watch suppression count.** Currently 3 tweets. If it grows beyond 5%, investigate shadowban.

10. **API budget is healthy.** 323/10,000 (3.2%). Can afford daily syncs for the rest of the month.
