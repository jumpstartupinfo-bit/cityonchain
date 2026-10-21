/**
 * useReferral — reads and writes the ReferralVault for the connected wallet.
 *
 * Returns:
 *   isRegistered    — whether this wallet has called registerReferrer()
 *   myReferrer      — the referrer address this wallet registered (zero = none)
 *   pendingAmount   — unclaimed USDC commission (raw bigint)
 *   refetchPending  — manually re-read pending balance
 *   register(referrer) — call registerReferrer; returns tx hash
 *   claim()         — call claim(); returns tx hash
 *   registerPending / registerConfirming / registerSuccess / registerHash
 *   claimPending    / claimConfirming    / claimSuccess    / claimHash
 */
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from 'wagmi';
import { REFERRAL_VAULT, CHAIN_ID } from '../contracts';

export function useReferral() {
  const { address } = useAccount();

  // ── Reads ──────────────────────────────────────────────────────────────────
  const { data: isRegistered, refetch: refetchReg } = useReadContract({
    address: REFERRAL_VAULT.address,
    abi: REFERRAL_VAULT.abi,
    functionName: 'registered',
    args: [address ?? '0x0000000000000000000000000000000000000000'],
    chainId: CHAIN_ID,
    query: { enabled: !!address },
  });

  const { data: myReferrer } = useReadContract({
    address: REFERRAL_VAULT.address,
    abi: REFERRAL_VAULT.abi,
    functionName: 'referrerOf',
    args: [address ?? '0x0000000000000000000000000000000000000000'],
    chainId: CHAIN_ID,
    query: { enabled: !!address && !!isRegistered },
  });

  const { data: pendingRaw, refetch: refetchPending } = useReadContract({
    address: REFERRAL_VAULT.address,
    abi: REFERRAL_VAULT.abi,
    functionName: 'pendingFor',
    args: [address ?? '0x0000000000000000000000000000000000000000'],
    chainId: CHAIN_ID,
    query: { enabled: !!address },
  });

  // ── Register ───────────────────────────────────────────────────────────────
  const {
    writeContract: doRegister,
    data: registerHash,
    isPending: registerPending,
    reset: resetRegister,
  } = useWriteContract();

  const { isLoading: registerConfirming, isSuccess: registerSuccess } =
    useWaitForTransactionReceipt({ hash: registerHash });

  function register(referrer: `0x${string}`) {
    doRegister({
      address: REFERRAL_VAULT.address,
      abi: REFERRAL_VAULT.abi,
      functionName: 'registerReferrer',
      args: [referrer],
      chainId: CHAIN_ID,
    });
  }

  // ── Claim ──────────────────────────────────────────────────────────────────
  const {
    writeContract: doClaim,
    data: claimHash,
    isPending: claimPending,
    reset: resetClaim,
  } = useWriteContract();

  const { isLoading: claimConfirming, isSuccess: claimSuccess } =
    useWaitForTransactionReceipt({ hash: claimHash });

  function claim() {
    doClaim({
      address: REFERRAL_VAULT.address,
      abi: REFERRAL_VAULT.abi,
      functionName: 'claim',
      args: [],
      chainId: CHAIN_ID,
    });
  }

  return {
    isRegistered: (isRegistered as boolean | undefined) ?? false,
    myReferrer: (myReferrer as `0x${string}` | undefined) ?? '0x0000000000000000000000000000000000000000',
    pendingAmount: (pendingRaw as bigint | undefined) ?? 0n,
    refetchPending,
    refetchReg,
    register,
    registerHash,
    registerPending,
    registerConfirming,
    registerSuccess,
    resetRegister,
    claim,
    claimHash,
    claimPending,
    claimConfirming,
    claimSuccess,
    resetClaim,
  };
}
