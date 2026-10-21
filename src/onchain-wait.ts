// Transaction wait utilities for CityOnChain
import { createPublicClient, http } from 'viem';
import { getChain, CHAIN_ID } from './onchain-facts';

/** Wait for a transaction receipt with a timeout */
export async function waitForReceipt(
  txHash: `0x${string}`,
  chainId = CHAIN_ID,
  timeoutMs = 30_000,
): Promise<{ status: 'success' | 'reverted'; blockNumber: bigint }> {
  const chain = getChain(chainId);
  const client = createPublicClient({ transport: http(chain.rpcUrls[0]) });

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const receipt = await client.getTransactionReceipt({ hash: txHash });
      if (receipt) {
        return { status: receipt.status, blockNumber: receipt.blockNumber };
      }
    } catch {
      // not mined yet
    }
    await new Promise(r => setTimeout(r, 2000));
  }
  throw new Error(`Transaction ${txHash} not confirmed within ${timeoutMs}ms`);
}
