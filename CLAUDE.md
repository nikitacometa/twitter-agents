# Twitter Agents

Umbrella project for AI-powered Twitter agents in the crypto space. Each agent lives in its own subdirectory with independent configuration, characters, and deployment.

## Structure

```
twitter-agents/
├── beef/              # $BEEF — AI Crypto Roast Bot (backend)
│   ├── docs/          # Research, strategy, playbooks
│   ├── characters/    # Bot personality configuration
│   ├── contracts/     # Solidity smart contracts (Foundry) — future
│   └── src/           # TypeScript source (custom stack)
├── beef-web/          # $BEEF — Web presence (landing pages + future app)
│   ├── public/        # Static landing pages (0xbeef.wtf)
│   └── docs/          # Design briefs and references
└── (future agents)
```

## Active Agents

| Agent | Concept | Status |
|-------|---------|--------|
| **$BEEF** | AI roast bot — roasts crypto projects, burn-to-request, community accountability | Setup |
| **$BEEF Web** | Landing pages and web app for $BEEF — [0xbeef.wtf](https://0xbeef.wtf) | Live |

## Conventions

- Each agent is a self-contained project with its own CLAUDE.md inside its directory
- Shared Twitter knowledge lives in `beef/docs/twitter-playbook.md` (applicable to all agents)
- All agents target **Base chain** (L2)
- All agents use **reply-only** Twitter strategy (proactive tagging = ban risk)
- Commit messages: English, lowercase verb, concise

## External Knowledge

Twitter strategy docs, voice profiles, and content patterns from the Cometa project are referenced but not duplicated. See `beef/CLAUDE.md` for exact file paths.
