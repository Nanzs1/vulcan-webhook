// lib/verifier.js
// Shared logic for Vulcan webhook endpoints.
// Used by both /api/verify-founding and /api/verify-pet.

import { createPublicClient, http, getAddress } from 'viem';
import { arbitrum } from 'viem/chains';

export const CONTRACT_ADDRESS = '0x990eb28e378659b93a29d46ff41f08dc6316dd98';

const RPC_URL = process.env.ARBITRUM_RPC_URL;

// Optional fixed thresholds (override live getBaseTokenIds lookup).
// Useful if the contract ever stops exposing getBaseTokenIds.
const FIXED_NFTS_BASE_ID = process.env.FIXED_NFTS_BASE_ID
  ? BigInt(process.env.FIXED_NFTS_BASE_ID)
  : null;
const FIXED_EGGS_BASE_ID = process.env.FIXED_EGGS_BASE_ID
  ? BigInt(process.env.FIXED_EGGS_BASE_ID)
  : null;

// ============================================================
// ABI (only the functions we use, from TokensFacet)
// ============================================================
export const TOKENS_FACET_ABI = [
  {
    name: 'tokensByAccount',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256[]' }],
  },
  {
    name: 'getBaseTokenIds',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      { name: 'seedPetsBaseId', type: 'uint64' },
      { name: 'resourcesBaseId', type: 'uint64' },
      { name: 'fungiblesBaseId', type: 'uint64' },
      { name: 'nftsBaseId', type: 'uint64' },
      { name: 'eggsBaseId', type: 'uint64' },
    ],
  },
];

export const client = createPublicClient({
  chain: arbitrum,
  transport: http(RPC_URL),
});

// ============================================================
// Cache thresholds for 5 minutes
// ============================================================
let baseIdsCache = { value: null, expiresAt: 0 };

export async function getBaseIds() {
  const now = Date.now();
  if (baseIdsCache.value && baseIdsCache.expiresAt > now) {
    return baseIdsCache.value;
  }

  const result = await client.readContract({
    address: CONTRACT_ADDRESS,
    abi: TOKENS_FACET_ABI,
    functionName: 'getBaseTokenIds',
  });

  let seedPetsBaseId = BigInt(result.seedPetsBaseId ?? result[0]);
  let resourcesBaseId = BigInt(result.resourcesBaseId ?? result[1]);
  let fungiblesBaseId = BigInt(result.fungiblesBaseId ?? result[2]);
  let nftsBaseId = BigInt(result.nftsBaseId ?? result[3]);
  let eggsBaseId = BigInt(result.eggsBaseId ?? result[4]);

  if (FIXED_NFTS_BASE_ID !== null) nftsBaseId = FIXED_NFTS_BASE_ID;
  if (FIXED_EGGS_BASE_ID !== null) eggsBaseId = FIXED_EGGS_BASE_ID;

  const value = { seedPetsBaseId, resourcesBaseId, fungiblesBaseId, nftsBaseId, eggsBaseId };
  baseIdsCache = { value, expiresAt: now + 5 * 60 * 1000 };
  return value;
}

export async function getWalletTokens(wallet) {
  const owner = getAddress(wallet);
  const tokenIds = await client.readContract({
    address: CONTRACT_ADDRESS,
    abi: TOKENS_FACET_ABI,
    functionName: 'tokensByAccount',
    args: [owner],
  });
  return tokenIds || [];
}

export function isFoundingCharacter(tokenId, baseIds) {
  return BigInt(tokenId) >= baseIds.nftsBaseId;
}

export function isPet(tokenId, baseIds) {
  const id = BigInt(tokenId);
  // Pets are seedPets in the contract: range [seedPetsBaseId, resourcesBaseId)
  // i.e. tokenId 1 → 4999
  return id >= baseIds.seedPetsBaseId && id < baseIds.resourcesBaseId;
}

export async function walletHasMatchingToken(wallet, predicate) {
  const baseIds = await getBaseIds();
  const tokens = await getWalletTokens(wallet);
  if (tokens.length === 0) return false;
  for (const id of tokens) {
    if (predicate(id, baseIds)) return true;
  }
  return false;
}

// ============================================================
// HTTP handler factory
// ============================================================
export function createHandler({ predicate, label }) {
  return async function handler(req, res) {
    const SHARED_SECRET = process.env.WEBHOOK_SECRET;

    if (req.method === 'GET') {
      try {
        const baseIds = await getBaseIds();
        return res.status(200).json({
          ok: true,
          contract: CONTRACT_ADDRESS,
          chain: 'arbitrum',
          checking: label,
          thresholds: {
            eggsBaseId: baseIds.eggsBaseId.toString(),
            nftsBaseId: baseIds.nftsBaseId.toString(),
          },
        });
      } catch (e) {
        return res.status(500).json({ ok: false, error: e.message });
      }
    }

    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    if (SHARED_SECRET) {
      const provided = req.headers['x-webhook-secret'];
      if (provided !== SHARED_SECRET) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
    }

    try {
      const body = req.body || {};
      let wallets = [];
      if (body.wallet) wallets = [body.wallet];
      else if (Array.isArray(body.wallets)) wallets = body.wallets;
      else return res.status(400).json({ error: 'Missing wallet(s)' });

      let anyQualifies = false;
      let anyChecked = false;

      for (const w of wallets) {
        try {
          const qualifies = await walletHasMatchingToken(w, predicate);
          anyChecked = true;
          if (qualifies) {
            anyQualifies = true;
            break;
          }
        } catch (e) {
          console.error(`[${label}] Error checking ${w}:`, e.message);
        }
      }

      if (!anyChecked) {
        return res.status(404).json({ success: false, error: 'Wallet check failed' });
      }

      return res.status(200).json({ success: anyQualifies });
    } catch (e) {
      console.error(`[${label}] Handler error:`, e);
      return res.status(500).json({ error: 'Internal error' });
    }
  };
}
