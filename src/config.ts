/**
 * wagmi configuration
 * Built with Arc Studio — https://studio.arc.io
 *
 * Chain selection: set VITE_CHAIN=mainnet for Arc Mainnet, defaults to Arc Testnet.
 */

import { http, createConfig, fallback } from 'wagmi'
import { mainnet } from 'wagmi/chains'
import { arcTestnet, arc } from 'viem/chains'
import { injected } from 'wagmi/connectors'
import { registerChain } from './tracing'

// VITE_CHAIN=mainnet → Arc Mainnet (chainId 5042); anything else → Arc Testnet (chainId 5042002)
const isMainnet = import.meta.env['VITE_CHAIN'] === 'mainnet';
export const activeChain = isMainnet ? arc : arcTestnet;

// Pre-register chain RPC URLs so trace events show correct chain names immediately
registerChain(activeChain.id, activeChain.rpcUrls.default.http[0])

// Public Arc RPC endpoints — no API keys required.
// Wagmi's fallback() transport tries each in order on failure.
const arcTransport = isMainnet
  ? fallback([
      http('https://rpc.mainnet.arc.io'),
      http('https://rpc.blockdaemon.mainnet.arc.io'),
    ])
  : fallback([
      http('https://rpc.testnet.arc.io'),
      http('https://rpc.blockdaemon.testnet.arc.io'),
    ])

export { arcTestnet, arc }

export const config = createConfig({
  chains: [activeChain, mainnet], // mainnet needed for ENS resolution
  connectors: [injected()],
  transports: {
    // Provide transports for both Arc chain IDs so TypeScript is satisfied
    // regardless of which is active; only the active one is used at runtime.
    [arcTestnet.id]: isMainnet ? http() : arcTransport,
    [arc.id]: isMainnet ? arcTransport : http(),
    [mainnet.id]: http(), // ENS resolution uses mainnet
  },
})
