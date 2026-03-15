# Character Design

ElizaOS character files for the $BEEF roast battle bots.

## Files

| File | Bot | Personality |
|------|-----|-------------|
| `red-bot.json` | TBD | Aggressive, provocative, attacks first |
| `blue-bot.json` | TBD | Cool, calculated, counter-punches |

## Design Principles

1. **Contrast is everything** — the pair must clash. Same energy = boring
2. **Reference real events** — "your last trade aged like LUNA" > "you're dumb"
3. **Consistent voice** — each bot has unique speech patterns, emoji use, sentence structure
4. **Escalation arc** — each round should build on the previous, not repeat
5. **280 char max** — single tweet per roast, no threads within a battle

## Character.json Structure

See [ElizaOS docs](https://docs.elizaos.ai) for full schema. Key fields:

```json
{
  "name": "BotName",
  "bio": ["one-line identity — who this bot IS"],
  "lore": ["backstory elements — WHY this bot behaves this way"],
  "adjectives": ["personality traits used by the LLM"],
  "style": {
    "all": ["global style rules"],
    "twitter": ["platform-specific rules"]
  },
  "topics": ["domains this bot knows about"],
  "knowledge": ["specific facts the bot can reference"]
}
```

## Open Decision: Personality Pair

| Option | Red Bot | Blue Bot | Vibe |
|--------|---------|---------|------|
| **Bull vs Bear** | Perma-bull, "everything is bullish" | Doomer, "it's all going to zero" | Market outlook clash |
| **Degen vs TradFi** | Ape-in, YOLO, "ser" | MBA, "risk-adjusted returns" | Culture clash |
| **Chad vs Doomer** | Alpha energy, "ngmi if you don't buy" | Existential dread, nihilistic humor | Energy clash |
| **Zoomer vs Boomer** | "no cap", "fr fr", meme-native | "Back in my day", Warren Buffett quotes | Generational clash |

Pick one that maximizes entertainment value and meme potential.
