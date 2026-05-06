# Vulcan Custom Webhook — Founding Characters + Pets

Custom webhook for Vulcan (Premint) to verify NFT holders on Arbitrum One.

Contract: `0x990eb28e378659b93a29d46ff41f08dc6316dd98`

## Endpoints

- `/api/verify-founding` — Founding Character holders (tokenId >= 104097)
- `/api/verify-pet` — Pet holders (tokenId 100001 → 104096)

## Setup

1. Set env var `ARBITRUM_RPC_URL` in Vercel (Alchemy/Infura HTTPS endpoint)
2. Deploy
3. Paste `https://YOUR-PROJECT.vercel.app/api/verify-founding` in Vulcan
