// Chain facts for CityOnChain — Arc Testnet (5042002) and Arc Mainnet (5042)

export const ARC_TESTNET_ID = 5042002;
export const ARC_MAINNET_ID = 5042;

// Active chain — driven by VITE_CHAIN env var
export const CHAIN_ID: number =
  import.meta.env.VITE_CHAIN === 'mainnet' ? ARC_MAINNET_ID : ARC_TESTNET_ID;

type ChainInfo = {
  id: number;
  name: string;
  rpcUrls: string[];
  blockExplorer: string;
  explorerBase: string; // alias for blockExplorer
  nativeCurrency: { name: string; symbol: string; decimals: number };
};

const CHAINS: Record<number, ChainInfo> = {
  [ARC_TESTNET_ID]: {
    id: ARC_TESTNET_ID,
    name: 'Arc Testnet',
    rpcUrls: ['https://rpc.testnet.arc.io'],
    blockExplorer: 'https://explorer.testnet.arc.io',
    explorerBase: 'https://explorer.testnet.arc.io',
    nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  },
  [ARC_MAINNET_ID]: {
    id: ARC_MAINNET_ID,
    name: 'Arc',
    rpcUrls: ['https://rpc.arc.io'],
    blockExplorer: 'https://explorer.arc.io',
    explorerBase: 'https://explorer.arc.io',
    nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  },
};

export function getChain(chainId?: number): ChainInfo {
  return CHAINS[chainId ?? CHAIN_ID] ?? CHAINS[ARC_TESTNET_ID];
}

export function requireChain(chainId?: number): ChainInfo {
  const c = CHAINS[chainId ?? CHAIN_ID];
  if (!c) throw new Error(`Unknown chain: ${chainId}`);
  return c;
}

/** Build a transaction explorer URL. chainId comes first to match call sites. */
export function buildTxExplorerUrl(chainId: number, txHash: string): string {
  const chain = getChain(chainId);
  return `${chain.explorerBase}/tx/${txHash}`;
}

export function buildAddressExplorerUrl(chainId: number, address: string): string {
  const chain = getChain(chainId);
  return `${chain.explorerBase}/address/${address}`;
}
