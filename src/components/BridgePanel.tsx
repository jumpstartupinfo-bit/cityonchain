import { useState, useCallback } from 'react';
import { useAccount, useChainId, useSwitchChain, useBalance } from 'wagmi';
import { AppKit } from '@circle-fin/app-kit';
type BridgeChainIdentifier = string;
interface BridgeStep { name: string; txHash?: string; explorerUrl?: string; }
interface BridgeResponse { state: string; steps?: BridgeStep[]; }
interface AppKitBridge {
  bridge(opts: { from: { adapter: unknown; chain: string }; to: { adapter: unknown; chain: string }; amount: string }): Promise<BridgeResponse>;
}
import { createViemAdapterFromProvider } from '@circle-fin/adapter-viem-v2';
import type { EIP1193Provider } from 'viem';
import { ArrowRight, ArrowLeftRight, ExternalLink, CheckCircle, Loader2, AlertCircle } from 'lucide-react';

import { formatUsdc } from '@/onchain-money';

const appKit = new AppKit() as unknown as AppKitBridge;

// Source chains users can bridge FROM to Arc
const SOURCE_CHAINS: { name: string; kitChain: BridgeChainIdentifier; chainId: number; emoji: string; label: string }[] = [
  { name: 'Ethereum',  kitChain: 'Ethereum',  chainId: 1,        emoji: '⟠',  label: 'Ethereum Mainnet' },
  { name: 'Base',      kitChain: 'Base',       chainId: 8453,     emoji: '🔵', label: 'Base' },
  { name: 'Arbitrum',  kitChain: 'Arbitrum',   chainId: 42161,    emoji: '🔷', label: 'Arbitrum One' },
  { name: 'Polygon',   kitChain: 'Polygon',    chainId: 137,      emoji: '🟣', label: 'Polygon' },
  { name: 'Avalanche', kitChain: 'Avalanche',  chainId: 43114,    emoji: '🔺', label: 'Avalanche C-Chain' },
];

const DEST_CHAIN = { kitChain: 'Arc' as BridgeChainIdentifier, label: 'Arc Mainnet' };
const DEST_CHAIN_TESTNET = { kitChain: 'Arc_Testnet' as BridgeChainIdentifier, label: 'Arc Testnet' };

// Determine destination based on VITE_CHAIN env
const IS_MAINNET = import.meta.env.VITE_CHAIN === 'mainnet';
const destination = IS_MAINNET ? DEST_CHAIN : DEST_CHAIN_TESTNET;

const QUICK_AMOUNTS = ['10', '25', '50', '100', '250'];

type Phase = 'idle' | 'switching' | 'approving' | 'burning' | 'attesting' | 'minting' | 'done' | 'error';

const PHASE_LABELS: Record<Phase, string> = {
  idle: 'Bridge USDC',
  switching: 'Switching network…',
  approving: 'Approving USDC…',
  burning: 'Burning on source chain…',
  attesting: 'Waiting for attestation…',
  minting: 'Minting on Arc…',
  done: 'Bridge complete!',
  error: 'Something went wrong',
};

interface BridgeResult {
  txHash?: string;
  explorerUrl?: string;
  amount: string;
  sourceChain: string;
}

export default function BridgePanel() {
  const { address, connector, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();

  const [selectedSource, setSelectedSource] = useState<typeof SOURCE_CHAINS[number]>(SOURCE_CHAINS[1]); // Base
  const [amount, setAmount] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState('');
  const [result, setResult] = useState<BridgeResult | null>(null);

  // Balance on connected chain (USDC ERC-20)
  const USDC_ADDRESSES: Record<number, `0x${string}`> = {
    1:      '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    8453:   '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    42161:  '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
    137:    '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
    43114:  '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E',
  };
  const usdcOnSource = USDC_ADDRESSES[selectedSource.chainId];
  const { data: balData } = useBalance({
    address,
    token: usdcOnSource,
    chainId: selectedSource.chainId,
    query: { enabled: !!address && !!usdcOnSource, staleTime: 30_000 },
  });

  const usdcBalance = balData ? formatUsdc(balData.value) : '—';

  const handleBridge = useCallback(async () => {
    if (!connector || !address || !amount) return;
    setError('');
    setResult(null);

    try {
      // 1. Switch to source chain if needed
      if (chainId !== selectedSource.chainId) {
        setPhase('switching');
        await switchChainAsync({ chainId: selectedSource.chainId });
      }

      const provider = (await connector.getProvider()) as EIP1193Provider;
      const adapter = await createViemAdapterFromProvider({ provider });

      setPhase('approving');
      const bridgeResult = await appKit.bridge({
        from: { adapter, chain: selectedSource.kitChain },
        to:   { adapter, chain: destination.kitChain },
        amount,
      });

      // Find mint step for explorer link
      const mintStep = bridgeResult.steps?.find(s => s.name === 'mint');

      setPhase('done');
      setResult({
        txHash: mintStep?.txHash,
        explorerUrl: mintStep?.explorerUrl,
        amount,
        sourceChain: selectedSource.label,
      });
    } catch (e) {
      setPhase('error');
      const msg = e instanceof Error ? e.message : String(e);
      // Parse friendly messages
      if (msg.includes('User rejected') || msg.includes('user rejected')) {
        setError('Transaction cancelled.');
      } else if (msg.includes('insufficient') || msg.includes('balance')) {
        setError('Insufficient USDC balance on source chain.');
      } else if (msg.includes('allowance')) {
        setError('Approval failed — please try again.');
      } else {
        setError(msg.length > 120 ? msg.slice(0, 120) + '…' : msg);
      }
    }
  }, [connector, address, amount, chainId, selectedSource, switchChainAsync]);

  const reset = () => {
    setPhase('idle');
    setError('');
    setResult(null);
  };

  const isActive = phase !== 'idle' && phase !== 'done' && phase !== 'error';
  const canBridge = isConnected && !!amount && parseFloat(amount) > 0 && !isActive;

  return (
    <div className="max-w-lg mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-stone-900 tracking-tight">Bridge USDC to Arc</h1>
        <p className="text-sm text-stone-500 mt-1">
          Move USDC from any major chain to {destination.label} in ~20 seconds.
        </p>
      </div>

      {/* Success state */}
      {phase === 'done' && result && (
        <div className="bg-green-50 border border-green-200 rounded-2xl p-6 space-y-3">
          <div className="flex items-center gap-2 text-green-700 font-medium">
            <CheckCircle className="w-5 h-5" />
            {result.amount} USDC bridged to Arc!
          </div>
          <p className="text-sm text-green-600">
            Bridged from {result.sourceChain} → {destination.label}
          </p>
          {result.explorerUrl && (
            <a
              href={result.explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-green-700 underline"
            >
              View on explorer <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
          <button
            onClick={reset}
            className="mt-2 text-sm text-green-700 underline"
          >
            Bridge more
          </button>
        </div>
      )}

      {phase !== 'done' && (
        <div className="bg-white border border-stone-200 rounded-2xl overflow-hidden shadow-sm">
          {/* Source chain selector */}
          <div className="p-5 border-b border-stone-100">
            <p className="text-xs font-medium text-stone-400 uppercase tracking-wider mb-3">From</p>
            <div className="grid grid-cols-5 gap-2">
              {SOURCE_CHAINS.map(chain => (
                <button
                  key={chain.chainId}
                  onClick={() => { setSelectedSource(chain); reset(); }}
                  className={`flex flex-col items-center gap-1.5 p-2.5 rounded-xl border transition-all ${
                    selectedSource.chainId === chain.chainId
                      ? 'border-amber-400 bg-amber-50'
                      : 'border-stone-200 bg-stone-50 hover:border-stone-300'
                  }`}
                >
                  <span className="text-2xl leading-none">{chain.emoji}</span>
                  <span className="text-[10px] font-medium text-stone-600">{chain.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Destination (fixed) */}
          <div className="px-5 py-4 border-b border-stone-100 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-stone-400 uppercase tracking-wider mb-1">To</p>
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 bg-amber-100 rounded-full flex items-center justify-center">
                  <span className="text-xs font-bold text-amber-700">A</span>
                </div>
                <span className="font-medium text-stone-800">{destination.label}</span>
              </div>
            </div>
            <ArrowLeftRight className="w-4 h-4 text-stone-300" />
          </div>

          {/* Amount input */}
          <div className="p-5 space-y-3">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-medium text-stone-400 uppercase tracking-wider">Amount</p>
              {address && (
                <button
                  className="text-xs text-amber-600 hover:text-amber-700"
                  onClick={() => {
                    if (balData) setAmount((Number(balData.value) / 10 ** balData.decimals).toFixed(2));
                  }}
                >
                  Balance: {usdcBalance} USDC
                </button>
              )}
            </div>
            <div className="relative">
              <input
                type="number"
                min="0"
                step="any"
                placeholder="0.00"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                disabled={isActive}
                className="w-full text-2xl font-semibold bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 pr-20 text-stone-900 placeholder-stone-300 focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100 disabled:opacity-60"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-medium text-stone-400">USDC</span>
            </div>

            {/* Quick amounts */}
            <div className="flex gap-2 flex-wrap">
              {QUICK_AMOUNTS.map(q => (
                <button
                  key={q}
                  onClick={() => setAmount(q)}
                  disabled={isActive}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${
                    amount === q
                      ? 'bg-amber-500 text-white border-amber-500'
                      : 'bg-stone-50 text-stone-600 border-stone-200 hover:border-amber-300'
                  }`}
                >
                  ${q}
                </button>
              ))}
            </div>
          </div>

          {/* Bridge CTA */}
          <div className="px-5 pb-5 space-y-3">
            {/* Info row */}
            {amount && parseFloat(amount) > 0 && (
              <div className="flex items-center justify-between text-xs text-stone-500 bg-stone-50 rounded-xl px-3 py-2">
                <span>{selectedSource.name} → {destination.label}</span>
                <span className="flex items-center gap-1">
                  <ArrowRight className="w-3 h-3" />
                  ~20 seconds · CCTP Fast
                </span>
              </div>
            )}

            {!isConnected ? (
              <div className="text-sm text-stone-500 text-center py-2">
                Connect your wallet to bridge
              </div>
            ) : (
              <button
                onClick={() => { void handleBridge(); }}
                disabled={!canBridge}
                className="w-full py-3.5 rounded-xl font-semibold text-sm transition-all bg-stone-900 text-white hover:bg-stone-800 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isActive ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {PHASE_LABELS[phase]}
                  </>
                ) : (
                  <>
                    Bridge {amount ? `${amount} USDC` : 'USDC'} to Arc
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            )}

            {phase === 'error' && error && (
              <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2.5">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                {error}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Progress steps (active) */}
      {isActive && (
        <div className="bg-white border border-stone-200 rounded-2xl p-5 space-y-3">
          <p className="text-xs font-medium text-stone-400 uppercase tracking-wider">Progress</p>
          {(['approving', 'burning', 'attesting', 'minting'] as Phase[]).map(step => {
            const steps: Phase[] = ['approving', 'burning', 'attesting', 'minting'];
            const currentIdx = steps.indexOf(phase);
            const stepIdx = steps.indexOf(step);
            const isDone = stepIdx < currentIdx;
            const isNow = stepIdx === currentIdx;
            return (
              <div key={step} className={`flex items-center gap-3 text-sm ${isDone ? 'text-green-600' : isNow ? 'text-stone-800' : 'text-stone-300'}`}>
                {isDone ? (
                  <CheckCircle className="w-4 h-4 text-green-500" />
                ) : isNow ? (
                  <Loader2 className="w-4 h-4 animate-spin text-amber-500" />
                ) : (
                  <div className="w-4 h-4 rounded-full border border-stone-200" />
                )}
                <span className={isNow ? 'font-medium' : ''}>{PHASE_LABELS[step]}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Info footer */}
      <p className="text-xs text-stone-400 text-center leading-relaxed">
        Powered by Circle CCTP · USDC is burned on the source chain and minted on Arc.
        Gas fees are paid in USDC on Arc.
      </p>
    </div>
  );
}
