# Base Chain Integration Guide

Исследование по пяти направлениям: Bankr token launch, burn-to-roast mechanics, ERC-8004, viem implementation, Snapshot voting. Данные по состоянию на март 2026.

---

## 1. Bankr Token Launch

### Как работает технически

Bankr использует **Doppler protocol** поверх Uniswap V4 для деплоя токенов. Clanker (предшественник, ныне часть Farcaster) работал на V3 — Bankr перешёл на V4.

**Флоу деплоя через API:**

```
POST https://api.bankr.bot/token-launches/deploy
X-API-Key: <read-write key from bankr.bot/api>
Content-Type: application/json

{
  "tokenName": "BEEF",
  "tokenSymbol": "BEEF",
  "description": "AI that roasts your bags. Burn $BEEF to aim it.",
  "image": "https://ipfs.io/ipfs/<cid>",
  "tweetUrl": "https://x.com/BeefThis/status/...",
  "feeRecipient": {
    "xHandle": "BeefThis"
  },
  "simulateOnly": false
}
```

**Ответ (201 Created):**
```json
{
  "success": true,
  "tokenAddress": "0x...",
  "poolId": "0x...",
  "txHash": "0x...",
  "activityId": "...",
  "chain": "base",
  "feeDistribution": {}
}
```

### Параметры токена

- Supply: **100 billion** (фиксированный, non-mintable)
- Pool: Uniswap V4 на Base
- Gas: **спонсирован** Bankr в рамках лимита (50 деплоев/24h, 100 для Bankr Club)
- `simulateOnly: true` — вернёт предсказанный адрес без broadcast (полезно для preregistration)

### Структура fee (1.2% swap fee на каждом свапе)

| Получатель | Доля | % от каждого свапа |
|-----------|------|-------------------|
| Creator (ваш wallet/X handle) | 57% | ~0.684% |
| Bankr | 36.1% | ~0.433% |
| Bankr Ecosystem | 1.9% | ~0.023% |
| Protocol (Doppler) | 5% | ~0.060% |

**Важно:** цифра 0.684% в CLAUDE.md — это именно creator share (57% от 1.2%). Деньги идут на `feeRecipient`, который можно задать как X handle, Farcaster handle, ENS или конкретный wallet address.

### Лимиты и ограничения

- Стандарт: 50 деплоев/24h
- Bankr Club: 100 деплоев/24h
- Bankr деплоит только на Base (основная сеть)
- API key нужен с правами "Agent API access enabled"

### Инициация через Twitter упоминание

Bankr поддерживает Twitter-triggered деплой (бот читает упоминания @bankrbot). Для программного деплоя — использовать REST API напрямую. Twitter-упоминание — UX для end-user, не для программного запуска.

---

## 2. Burn-to-Roast Mechanics

### Две архитектуры детектирования

#### Вариант A: Transfer to dead address (простой)

Пользователь делает `transfer(0x000...dead, amount)` со своего кошелька. Нет отдельного контракта.

**Плюсы:** нулевая сложность, любой кошелёк поддерживает, нет риска уязвимостей.
**Минусы:** нельзя attach arbitrary data к burn (цель роуста). Нужен отдельный механизм передачи цели (например, tweet с хэшем транзакции).

#### Вариант B: Custom burn contract (рекомендован)

Contrat принимает `burnToRoast(uint256 amount, string calldata target)`, вызывает `transferFrom` для pull токенов, сжигает их, emits `BurnRequest(address indexed burner, uint256 amount, string target, uint256 requestId)`.

**Плюсы:** target передаётся on-chain атомарно с burn, удобно индексировать.
**Минусы:** требует approve + отдельный деплой (≈$5-20 на Base), аудит желателен.

### Детектирование через viem (WebSocket, рекомендован)

```typescript
import { createPublicClient, webSocket, parseAbiItem } from 'viem';
import { base } from 'viem/chains';

const DEAD_ADDRESS = '0x000000000000000000000000000000000000dead';
const BEEF_TOKEN = '0x...'; // после деплоя через Bankr

// Вариант A: transfer to dead address
const client = createPublicClient({
  chain: base,
  transport: webSocket('wss://base-mainnet.g.alchemy.com/v2/<key>'),
});

const unwatch = client.watchContractEvent({
  address: BEEF_TOKEN,
  abi: [parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)')],
  eventName: 'Transfer',
  args: { to: DEAD_ADDRESS },
  onLogs: async (logs) => {
    for (const log of logs) {
      const { from, value } = log.args;
      await handleBurnRequest({ burner: from, amount: value, txHash: log.transactionHash });
    }
  },
  onError: (error) => {
    logger.error({ err: error }, 'burn watcher error');
  },
});
```

```typescript
// Вариант B: custom contract event
const BURN_CONTRACT_ABI = [
  parseAbiItem('event BurnRequest(address indexed burner, uint256 amount, string target, uint256 requestId)'),
] as const;

const unwatch = client.watchContractEvent({
  address: BURN_CONTRACT_ADDRESS,
  abi: BURN_CONTRACT_ABI,
  eventName: 'BurnRequest',
  onLogs: async (logs) => {
    for (const log of logs) {
      const { burner, amount, target, requestId } = log.args;
      await queueRoastRequest({ burner, amount, target, requestId });
    }
  },
});
```

### Polling как fallback (HTTP transport)

Если WebSocket недоступен (базовый free tier):

```typescript
// HTTP transport — автоматически переключается на polling
const client = createPublicClient({
  chain: base,
  transport: http('https://mainnet.base.org'),
});

// pollingInterval по умолчанию 4 секунды на Base
client.watchContractEvent({
  ...params,
  poll: true,
  pollingInterval: 4_000,
});
```

### Webhook-провайдеры для Base

#### Alchemy (рекомендован для старта)

- **Address Activity Webhook** — отслеживает все ERC-20/721/1155 transfers по адресу
- Free tier: **300M CU/месяц**, 330 CUP/sec, базовые webhooks включены
- PAYG: ~$0.40-0.45 per million CU
- Поддерживает до **100,000 адресов** на один webhook
- Настройка: Dashboard → Webhooks → Create → Address Activity → Base Mainnet

Пример payload:
```json
{
  "type": "ADDRESS_ACTIVITY",
  "activity": [{
    "fromAddress": "0x...",
    "toAddress": "0x000000000000000000000000000000000000dead",
    "value": 1000000,
    "asset": "BEEF",
    "category": "token",
    "rawContract": {
      "address": "0x...",
      "rawValue": "0x...",
      "decimals": 18
    }
  }]
}
```

#### QuickNode Streams

- Поддерживает JavaScript-фильтры на стороне сервера (меньше трафика)
- Стартовый план: **$49/месяц**, 20M API credits
- Подходит при высокой частоте событий (>10K burns/день)
- Streams потребляет кредиты пропорционально числу обработанных блоков

#### Moralis Streams

- ERC-20 Transfer logs декодируются **бесплатно** (0 CU на decoded logs)
- Charged: 10 CU за каждый confirmed record в webhook
- Поддерживает фильтрацию по конкретному `to` address
- **Важно:** уточнить актуальный статус поддержки Base Mainnet — в документации 2025 упоминались Ethereum/Polygon/Avalanche/BNB как основные сети

#### Итоговый выбор

| Провайдер | Лучший сценарий | Стоимость старт |
|-----------|----------------|-----------------|
| Alchemy Address Activity | Старт, <1K burns/день | $0 (free tier) |
| QuickNode Streams | Масштаб, custom фильтры | $49/месяц |
| viem WebSocket напрямую | Полный контроль, нет зависимостей | Только RPC cost |

**Для $BEEF на старте:** Alchemy free tier + viem WebSocket достаточно.

---

## 3. ERC-8004 (Trustless Agents)

### Концепция

ERC-8004 — стандарт для on-chain identity AI агентов. Identity Registry — ERC-721 с URIStorage: каждый агент получает NFT (agentId), который резолвится в IPFS/HTTPS файл с метаданными агента. Portable, transferable, censorship-resistant.

### Deployed contracts на Base

| Сеть | IdentityRegistry | ReputationRegistry |
|------|-----------------|-------------------|
| **Base Mainnet** | `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` | `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63` |
| **Base Sepolia** | `0x8004A818BFB912233c491871b3d84c89A494BD9e` | `0x8004B663056A597Dffe9eCcC1965A193B7388713` |

Контракты задеплоены на 40+ сетей, включая Ethereum, Arbitrum, Optimism, Polygon, Avalanche.

### Интерфейс регистрации

```solidity
struct MetadataEntry {
    string metadataKey;
    bytes metadataValue;
}

// Три перегрузки register():
function register() external returns (uint256 agentId)
function register(string agentURI) external returns (uint256 agentId)
function register(string agentURI, MetadataEntry[] calldata metadata) external returns (uint256 agentId)

// Post-registration updates:
function setAgentURI(uint256 agentId, string calldata newURI) external
function setAgentWallet(uint256 agentId, address newWallet, uint256 deadline, bytes calldata signature) external
function setMetadata(uint256 agentId, string key, bytes value) external
```

### Регистрация агента через viem

```typescript
import { createWalletClient, createPublicClient, http, parseAbi } from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

const IDENTITY_REGISTRY = '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432';
const ERC8004_ABI = parseAbi([
  'function register(string agentURI) external returns (uint256 agentId)',
  'function setMetadata(uint256 agentId, string metadataKey, bytes metadataValue) external',
  'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)',
]);

const account = privateKeyToAccount(process.env.BOT_PRIVATE_KEY as `0x${string}`);
const walletClient = createWalletClient({ account, chain: base, transport: http(RPC_URL) });
const publicClient = createPublicClient({ chain: base, transport: http(RPC_URL) });

// agentURI — IPFS или HTTPS JSON с описанием агента
const agentURI = 'ipfs://QmBeefBotMetadata...';

const { request } = await publicClient.simulateContract({
  address: IDENTITY_REGISTRY,
  abi: ERC8004_ABI,
  functionName: 'register',
  args: [agentURI],
  account,
});

const txHash = await walletClient.writeContract(request);
const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

// agentId — из Transfer event в receipt
const transferLog = receipt.logs.find((log) => log.topics[0] === /* Transfer topic */);
const agentId = BigInt(transferLog?.topics[3] ?? '0x0');
```

### Agent metadata JSON (agentURI content)

```json
{
  "name": "$BEEF Roast Bot",
  "description": "AI that roasts crypto projects. Burn $BEEF to aim it.",
  "version": "1.0.0",
  "agent_type": "roast_bot",
  "twitter": "https://x.com/BeefThis",
  "token": "0x...",
  "chain": "eip155:8453",
  "capabilities": ["roast_generation", "burn_to_request", "accountability_voting"]
}
```

### Стоимость

Регистрация — одна транзакция на Base. Газ на Base: ~$0.01-0.10 в зависимости от сетевой нагрузки.

---

## 4. viem Implementation Patterns

### Setup клиентов

```typescript
// src/chain/base-client.ts
import { createPublicClient, createWalletClient, webSocket, http, fallback } from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

const RPC_HTTP = process.env.BASE_RPC_URL ?? 'https://mainnet.base.org';
const RPC_WSS = process.env.BASE_WSS_URL; // опционально

// publicClient с fallback: WSS → HTTP
export const publicClient = createPublicClient({
  chain: base,
  transport: RPC_WSS
    ? fallback([webSocket(RPC_WSS), http(RPC_HTTP)])
    : http(RPC_HTTP),
});

// walletClient для отправки транзакций (ERC-8004, будущий burn contract деплой)
export const botAccount = privateKeyToAccount(
  process.env.BOT_PRIVATE_KEY as `0x${string}`,
);
export const walletClient = createWalletClient({
  account: botAccount,
  chain: base,
  transport: http(RPC_HTTP),
});
```

### Чтение баланса ERC-20

```typescript
import { erc20Abi } from 'viem';

async function getBeefBalance(address: `0x${string}`): Promise<bigint> {
  return publicClient.readContract({
    address: BEEF_TOKEN_ADDRESS,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [address],
  });
}
```

### Watch Transfer events (burns)

```typescript
import { parseAbiItem } from 'viem';

const DEAD_ADDRESS = '0x000000000000000000000000000000000000dead' as const;

export function watchBurns(
  tokenAddress: `0x${string}`,
  onBurn: (burner: `0x${string}`, amount: bigint, txHash: `0x${string}`) => Promise<void>,
): () => void {
  return publicClient.watchContractEvent({
    address: tokenAddress,
    abi: [parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)')],
    eventName: 'Transfer',
    args: { to: DEAD_ADDRESS },
    onLogs: async (logs) => {
      for (const log of logs) {
        if (log.args.from && log.args.value && log.transactionHash) {
          await onBurn(log.args.from, log.args.value, log.transactionHash);
        }
      }
    },
    onError: (error) => {
      logger.error({ err: error }, 'burn watcher error — will retry');
    },
  });
}
```

### Gas estimation и sendTransaction

```typescript
async function sendContractTx<const TAbi extends Abi>(params: {
  address: `0x${string}`;
  abi: TAbi;
  functionName: string;
  args: unknown[];
}): Promise<`0x${string}`> {
  const { request } = await publicClient.simulateContract({
    ...params,
    account: botAccount,
  });

  // Gas на Base типично: baseFee ~0.001 gwei + priority fee ~0.001 gwei
  const hash = await walletClient.writeContract(request);
  return hash;
}
```

### RPC провайдеры для Base

| Провайдер | Public endpoint | Free tier | WSS | Рекомендация |
|-----------|----------------|-----------|-----|--------------|
| **Base public** | `https://mainnet.base.org` | Unlimited (rate-limited) | Нет | Dev/тест только |
| **Alchemy** | `https://base-mainnet.g.alchemy.com/v2/<key>` | 300M CU/мес | `wss://...` | **Старт** |
| **QuickNode** | Персональный endpoint | $49/мес | Да | Масштаб |
| **Ankr** | `https://rpc.ankr.com/base` | 30K req/день | Нет | Backup |
| **Chainstack** | Персональный endpoint | 3M req/мес | Да | Archive nodes |
| **dRPC** | `https://base.drpc.org` | от $10/мес flat | Да | Альтернатива |

**Для env.validation.ts** добавить:

```typescript
BASE_RPC_URL: z.string().url().default('https://mainnet.base.org'),
BASE_WSS_URL: z.string().url().optional(),
BOT_PRIVATE_KEY: z.string().regex(/^0x[0-9a-fA-F]{64}$/).optional(),
BANKR_API_KEY: z.string().optional(),
BEEF_TOKEN_ADDRESS: z.string().regex(/^0x[0-9a-fA-F]{40}$/).optional(),
ERC8004_AGENT_ID: z.coerce.bigint().optional(),
```

---

## 5. Snapshot.org Voting Integration

### Setup

```bash
pnpm add @snapshot-labs/snapshot.js
```

### Создание Snapshot Space

Space создаётся через UI на snapshot.org → Connect wallet (bot wallet) → Create space. Настройки:

- Network: Base (ID: `8453`)
- Token: указать адрес `$BEEF` после деплоя
- Voting strategy: `erc20-balance-of` — голосование пропорционально балансу
- Proposal threshold: минимум $BEEF для создания предложения

### Создание proposal программно

```typescript
import snapshot from '@snapshot-labs/snapshot.js';
import { Wallet } from '@ethersproject/wallet';

const hub = 'https://hub.snapshot.org';
const client = new snapshot.Client712(hub);

// Для Node.js — ethers Wallet (snapshot.js требует ethers-совместимый signer)
const signer = new Wallet(process.env.BOT_PRIVATE_KEY!);

async function createChallenge(params: {
  roastId: string;
  roastContent: string;
  falseClaimDescription: string;
  evidenceUrl: string;
  snapshotBlock: number;
}): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  const receipt = await client.proposal(signer, signer.address, {
    space: 'beef-roast.eth', // ваш Snapshot space ENS
    type: 'single-choice',
    title: `Challenge: Roast #${params.roastId}`,
    body: `**False claim:** ${params.falseClaimDescription}\n\n**Evidence:** ${params.evidenceUrl}\n\n**Original roast:** ${params.roastContent}`,
    choices: ['Invalid (burn challenger stake)', 'Valid (reward challenger)'],
    start: now + 3600,       // через 1 час
    end: now + 3600 + 86400, // 24 часа голосования
    snapshot: params.snapshotBlock,
    plugins: JSON.stringify({}),
    labels: ['challenge', `roast-${params.roastId}`],
    privacy: '',
    app: 'beef-roast-bot',
  });

  return receipt.id;
}
```

### Проверка результатов голосования

```typescript
const SNAPSHOT_GRAPHQL = 'https://hub.snapshot.org/graphql';

async function getProposalResult(proposalId: string) {
  const query = `
    query GetProposal($id: String!) {
      proposal(id: $id) {
        id
        state
        scores        # [score_choice_1, score_choice_2]
        scores_total
        votes
        end
        choices
      }
    }
  `;

  const res = await fetch(SNAPSHOT_GRAPHQL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables: { id: proposalId } }),
  });

  const { data } = await res.json() as { data: { proposal: SnapshotProposal } };
  return data.proposal;
}

// Интерпретация результата
// choices[0] = "Invalid" (challenger loses), choices[1] = "Valid" (challenger wins)
// scores[1] > scores[0] → challenge valid → reward challenger
function isChallengeValid(proposal: SnapshotProposal): boolean {
  return proposal.state === 'closed' && proposal.scores[1] > proposal.scores[0];
}
```

### Rate limits и API key

- Snapshot GraphQL: 60 req/min без ключа
- Для production запросить API key через docs.snapshot.box/tools/api
- Endpoint демо-стенда: `https://testnet.hub.snapshot.org/graphql`

---

## Порядок реализации

1. **Сейчас (до token launch):** Зарегистрировать ERC-8004 identity на Base Sepolia. Стоит $0.01 газа — сразу получаем нарратив.
2. **День 0 (launch):** Задеплоить токен через Bankr API с `simulateOnly: true` → получить адрес → затем реальный деплой. Добавить `BEEF_TOKEN_ADDRESS` в env.
3. **День 1-7 (мониторинг):** Запустить viem `watchContractEvent` на Transfer → dead address. Alchemy free tier достаточно.
4. **День 14+ (burn contract):** Деплоить custom BurnRequest контракт через Foundry. Переключить watcher на `BurnRequest` event — получаем on-chain target.
5. **Snapshot:** Создать space сразу после token launch. Первый challenge можно создать вручную через UI — программный путь нужен с week 3+.

---

*Источники: [Bankr docs](https://docs.bankr.bot), [ERC-8004 contracts repo](https://github.com/erc-8004/erc-8004-contracts), [EIP-8004 spec](https://eips.ethereum.org/EIPS/eip-8004), [viem watchContractEvent](https://rc.viem.sh/docs/contract/watchContractEvent.html), [Alchemy Address Activity Webhook](https://www.alchemy.com/docs/reference/address-activity-webhook), [Snapshot.js docs](https://docs.snapshot.box/snapshot.js), [Base node providers](https://docs.base.org/base-chain/tools/node-providers), [Clanker protocol](https://clanker.world/about)*
