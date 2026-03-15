# Twitter Agents

Umbrella project for AI-powered Twitter agents in the crypto space. Each agent lives in its own subdirectory with independent configuration, characters, and deployment.

## Structure

```
twitter-agents/
├── beef/              # AI Roast Battle PVP — first agent project
│   ├── docs/          # Research, strategy, playbooks
│   ├── characters/    # ElizaOS character JSON files
│   ├── contracts/     # Solidity smart contracts (Foundry)
│   └── src/           # TypeScript source (ElizaOS plugins, bot logic)
└── (future agents)
```

## Active Agents

| Agent | Concept | Status |
|-------|---------|--------|
| **$BEEF** | AI Roast Battle PVP — two bots roast each other, community bets on winner | Setup |

## Conventions

- Each agent is a self-contained project with its own CLAUDE.md inside its directory
- Shared Twitter knowledge lives in `beef/docs/twitter-playbook.md` (applicable to all agents)
- All agents target **Base chain** (L2)
- All agents use **reply-only** Twitter strategy (proactive tagging = ban risk)
- Commit messages: English, lowercase verb, concise

## External Knowledge

Twitter strategy docs, voice profiles, and content patterns from the Cometa project are referenced but not duplicated. See `beef/CLAUDE.md` for exact file paths.
