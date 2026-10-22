import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContracts, usePublicClient } from 'wagmi';
import { toast } from 'sonner';
import { CheckCircle2, XCircle, Loader2, AlertCircle, ChevronDown, ChevronUp, Copy } from 'lucide-react';
import {
  CITY_REGISTRY, DISTRICT_REGISTRY, CITY_MARKETPLACE, LEASE_MANAGER,
  REVENUE_SPLITTER, AD_SLOTS, FEE_CONFIG, TREASURY, STOREFRONTS, EVENT_TICKETS, REFERRAL_VAULT, CITY_PROFILE, ACTIVITY_TRACKER, CITY_PASS,
} from '@/contracts';

const OWNER = '0xb3FfE33BB506d316D4995C8FF5E63d5A742B10C1';
const MERKLE_ROOT = '0x74ab9348cd97bd13f535237f7fb64a06cc2e7416eb5eb68a0eb36242914bf21b';

type ContractRef = { address: `0x${string}`; abi: object[] };
type CheckType = 'address' | 'bool' | 'bytes32';

type WireCall = {
  group: string;
  label: string;
  contract: ContractRef;
  fn: string;
  args: unknown[];
  checkFn: string;
  checkArgs: unknown[];
  checkExpected: string | boolean;
  checkType: CheckType;
};

const WIRE_CALLS: WireCall[] = [
  // CityRegistry
  { group: 'CityRegistry', label: 'setTreasuryContract', contract: CITY_REGISTRY, fn: 'setTreasuryContract', args: [TREASURY.address], checkFn: 'treasuryContract', checkArgs: [], checkExpected: TREASURY.address.toLowerCase(), checkType: 'address' },
  { group: 'CityRegistry', label: 'setFeeConfig', contract: CITY_REGISTRY, fn: 'setFeeConfig', args: [FEE_CONFIG.address], checkFn: 'feeConfig', checkArgs: [], checkExpected: FEE_CONFIG.address.toLowerCase(), checkType: 'address' },
  { group: 'CityRegistry', label: 'setRevenueSplitter', contract: CITY_REGISTRY, fn: 'setRevenueSplitter', args: [REVENUE_SPLITTER.address], checkFn: 'revenueSplitter', checkArgs: [], checkExpected: REVENUE_SPLITTER.address.toLowerCase(), checkType: 'address' },
  { group: 'CityRegistry', label: 'setLeaseManager', contract: CITY_REGISTRY, fn: 'setLeaseManager', args: [LEASE_MANAGER.address], checkFn: 'leaseManager', checkArgs: [], checkExpected: LEASE_MANAGER.address.toLowerCase(), checkType: 'address' },
  { group: 'CityRegistry', label: 'setDistrictRegistry', contract: CITY_REGISTRY, fn: 'setDistrictRegistry', args: [DISTRICT_REGISTRY.address], checkFn: 'districtRegistry', checkArgs: [], checkExpected: DISTRICT_REGISTRY.address.toLowerCase(), checkType: 'address' },
  { group: 'CityRegistry', label: 'setMerkleRoot', contract: CITY_REGISTRY, fn: 'setMerkleRoot', args: [MERKLE_ROOT], checkFn: 'merkleRoot', checkArgs: [], checkExpected: MERKLE_ROOT.toLowerCase(), checkType: 'bytes32' },
  // DistrictRegistry
  { group: 'DistrictRegistry', label: 'setCityRegistry', contract: DISTRICT_REGISTRY, fn: 'setCityRegistry', args: [CITY_REGISTRY.address], checkFn: 'cityRegistry', checkArgs: [], checkExpected: CITY_REGISTRY.address.toLowerCase(), checkType: 'address' },
  { group: 'DistrictRegistry', label: 'setFeeConfig', contract: DISTRICT_REGISTRY, fn: 'setFeeConfig', args: [FEE_CONFIG.address], checkFn: 'feeConfig', checkArgs: [], checkExpected: FEE_CONFIG.address.toLowerCase(), checkType: 'address' },
  { group: 'DistrictRegistry', label: 'setTreasury', contract: DISTRICT_REGISTRY, fn: 'setTreasury', args: [TREASURY.address], checkFn: 'treasuryContract', checkArgs: [], checkExpected: TREASURY.address.toLowerCase(), checkType: 'address' },
  { group: 'DistrictRegistry', label: 'setRevenueSplitter', contract: DISTRICT_REGISTRY, fn: 'setRevenueSplitter', args: [REVENUE_SPLITTER.address], checkFn: 'revenueSplitter', checkArgs: [], checkExpected: REVENUE_SPLITTER.address.toLowerCase(), checkType: 'address' },
  { group: 'DistrictRegistry', label: 'setLeaseManager', contract: DISTRICT_REGISTRY, fn: 'setLeaseManager', args: [LEASE_MANAGER.address], checkFn: 'leaseManager', checkArgs: [], checkExpected: LEASE_MANAGER.address.toLowerCase(), checkType: 'address' },
  // RevenueSplitter
  { group: 'RevenueSplitter', label: 'setTreasuryContract', contract: REVENUE_SPLITTER, fn: 'setTreasuryContract', args: [TREASURY.address], checkFn: 'treasuryContract', checkArgs: [], checkExpected: TREASURY.address.toLowerCase(), checkType: 'address' },
  { group: 'RevenueSplitter', label: 'setFeeConfig', contract: REVENUE_SPLITTER, fn: 'setFeeConfig', args: [FEE_CONFIG.address], checkFn: 'feeConfig', checkArgs: [], checkExpected: FEE_CONFIG.address.toLowerCase(), checkType: 'address' },
  { group: 'RevenueSplitter', label: 'setCityRegistry', contract: REVENUE_SPLITTER, fn: 'setCityRegistry', args: [CITY_REGISTRY.address], checkFn: 'cityRegistry', checkArgs: [], checkExpected: CITY_REGISTRY.address.toLowerCase(), checkType: 'address' },
  { group: 'RevenueSplitter', label: 'setDistrictRegistry', contract: REVENUE_SPLITTER, fn: 'setDistrictRegistry', args: [DISTRICT_REGISTRY.address], checkFn: 'districtRegistry', checkArgs: [], checkExpected: DISTRICT_REGISTRY.address.toLowerCase(), checkType: 'address' },
  // Treasury depositors
  { group: 'Treasury', label: 'setDepositor(CityRegistry)', contract: TREASURY, fn: 'setDepositor', args: [CITY_REGISTRY.address, true], checkFn: 'isDepositor', checkArgs: [CITY_REGISTRY.address], checkExpected: true, checkType: 'bool' },
  { group: 'Treasury', label: 'setDepositor(DistrictRegistry)', contract: TREASURY, fn: 'setDepositor', args: [DISTRICT_REGISTRY.address, true], checkFn: 'isDepositor', checkArgs: [DISTRICT_REGISTRY.address], checkExpected: true, checkType: 'bool' },
  { group: 'Treasury', label: 'setDepositor(RevenueSplitter)', contract: TREASURY, fn: 'setDepositor', args: [REVENUE_SPLITTER.address, true], checkFn: 'isDepositor', checkArgs: [REVENUE_SPLITTER.address], checkExpected: true, checkType: 'bool' },
  { group: 'Treasury', label: 'setDepositor(CityMarketplace)', contract: TREASURY, fn: 'setDepositor', args: [CITY_MARKETPLACE.address, true], checkFn: 'isDepositor', checkArgs: [CITY_MARKETPLACE.address], checkExpected: true, checkType: 'bool' },
  { group: 'Treasury', label: 'setDepositor(LeaseManager)', contract: TREASURY, fn: 'setDepositor', args: [LEASE_MANAGER.address, true], checkFn: 'isDepositor', checkArgs: [LEASE_MANAGER.address], checkExpected: true, checkType: 'bool' },
  // CityMarketplace
  { group: 'CityMarketplace', label: 'setTreasuryContract', contract: CITY_MARKETPLACE, fn: 'setTreasuryContract', args: [TREASURY.address], checkFn: 'treasuryContract', checkArgs: [], checkExpected: TREASURY.address.toLowerCase(), checkType: 'address' },
  { group: 'CityMarketplace', label: 'setFeeConfig', contract: CITY_MARKETPLACE, fn: 'setFeeConfig', args: [FEE_CONFIG.address], checkFn: 'feeConfig', checkArgs: [], checkExpected: FEE_CONFIG.address.toLowerCase(), checkType: 'address' },
  { group: 'CityMarketplace', label: 'setApprovedNFT(CityRegistry)', contract: CITY_MARKETPLACE, fn: 'setApprovedNFT', args: [CITY_REGISTRY.address, true], checkFn: 'approvedNFTs', checkArgs: [CITY_REGISTRY.address], checkExpected: true, checkType: 'bool' },
  { group: 'CityMarketplace', label: 'setApprovedNFT(DistrictRegistry)', contract: CITY_MARKETPLACE, fn: 'setApprovedNFT', args: [DISTRICT_REGISTRY.address, true], checkFn: 'approvedNFTs', checkArgs: [DISTRICT_REGISTRY.address], checkExpected: true, checkType: 'bool' },
  { group: 'CityMarketplace', label: 'setDistrictRegistry', contract: CITY_MARKETPLACE, fn: 'setDistrictRegistry', args: [DISTRICT_REGISTRY.address], checkFn: 'districtRegistry', checkArgs: [], checkExpected: DISTRICT_REGISTRY.address.toLowerCase(), checkType: 'address' },
  { group: 'CityMarketplace', label: 'setReferralVault', contract: CITY_MARKETPLACE, fn: 'setReferralVault', args: [REFERRAL_VAULT.address], checkFn: 'referralVault', checkArgs: [], checkExpected: REFERRAL_VAULT.address.toLowerCase(), checkType: 'address' },
  // LeaseManager
  { group: 'LeaseManager', label: 'setFeeConfig', contract: LEASE_MANAGER, fn: 'setFeeConfig', args: [FEE_CONFIG.address], checkFn: 'feeConfig', checkArgs: [], checkExpected: FEE_CONFIG.address.toLowerCase(), checkType: 'address' },
  { group: 'LeaseManager', label: 'setTreasuryContract', contract: LEASE_MANAGER, fn: 'setTreasuryContract', args: [TREASURY.address], checkFn: 'treasuryContract', checkArgs: [], checkExpected: TREASURY.address.toLowerCase(), checkType: 'address' },
  { group: 'LeaseManager', label: 'setApprovedNFT(CityRegistry)', contract: LEASE_MANAGER, fn: 'setApprovedNFT', args: [CITY_REGISTRY.address, true], checkFn: 'approvedNFTs', checkArgs: [CITY_REGISTRY.address], checkExpected: true, checkType: 'bool' },
  { group: 'LeaseManager', label: 'setApprovedNFT(DistrictRegistry)', contract: LEASE_MANAGER, fn: 'setApprovedNFT', args: [DISTRICT_REGISTRY.address, true], checkFn: 'approvedNFTs', checkArgs: [DISTRICT_REGISTRY.address], checkExpected: true, checkType: 'bool' },
  // AdSlots
  { group: 'AdSlots', label: 'setCityRegistry', contract: AD_SLOTS, fn: 'setCityRegistry', args: [CITY_REGISTRY.address], checkFn: 'cityRegistry', checkArgs: [], checkExpected: CITY_REGISTRY.address.toLowerCase(), checkType: 'address' },
  { group: 'AdSlots', label: 'setDistrictRegistry', contract: AD_SLOTS, fn: 'setDistrictRegistry', args: [DISTRICT_REGISTRY.address], checkFn: 'districtRegistry', checkArgs: [], checkExpected: DISTRICT_REGISTRY.address.toLowerCase(), checkType: 'address' },
  { group: 'AdSlots', label: 'setRevenueSplitter', contract: AD_SLOTS, fn: 'setRevenueSplitter', args: [REVENUE_SPLITTER.address], checkFn: 'revenueSplitter', checkArgs: [], checkExpected: REVENUE_SPLITTER.address.toLowerCase(), checkType: 'address' },
  // Storefronts
  { group: 'Storefronts', label: 'setRevenueSplitter', contract: STOREFRONTS, fn: 'setRevenueSplitter', args: [REVENUE_SPLITTER.address], checkFn: 'revenueSplitter', checkArgs: [], checkExpected: REVENUE_SPLITTER.address.toLowerCase(), checkType: 'address' },
  { group: 'Storefronts', label: 'setDistrictRegistry', contract: STOREFRONTS, fn: 'setDistrictRegistry', args: [DISTRICT_REGISTRY.address], checkFn: 'districtRegistry', checkArgs: [], checkExpected: DISTRICT_REGISTRY.address.toLowerCase(), checkType: 'address' },
  { group: 'Storefronts', label: 'setCityRegistry', contract: STOREFRONTS, fn: 'setCityRegistry', args: [CITY_REGISTRY.address], checkFn: 'cityRegistry', checkArgs: [], checkExpected: CITY_REGISTRY.address.toLowerCase(), checkType: 'address' },
  // EventTickets
  { group: 'EventTickets', label: 'setRevenueSplitter', contract: EVENT_TICKETS, fn: 'setRevenueSplitter', args: [REVENUE_SPLITTER.address], checkFn: 'revenueSplitter', checkArgs: [], checkExpected: REVENUE_SPLITTER.address.toLowerCase(), checkType: 'address' },
  { group: 'EventTickets', label: 'setCityRegistry', contract: EVENT_TICKETS, fn: 'setCityRegistry', args: [CITY_REGISTRY.address], checkFn: 'cityRegistry', checkArgs: [], checkExpected: CITY_REGISTRY.address.toLowerCase(), checkType: 'address' },
  { group: 'EventTickets', label: 'setDistrictRegistry', contract: EVENT_TICKETS, fn: 'setDistrictRegistry', args: [DISTRICT_REGISTRY.address], checkFn: 'districtRegistry', checkArgs: [], checkExpected: DISTRICT_REGISTRY.address.toLowerCase(), checkType: 'address' },
  // ReferralVault — authorize both registries to call creditCommission
  { group: 'ReferralVault', label: 'setRegistry(CityRegistry, true)', contract: REFERRAL_VAULT, fn: 'setRegistry', args: [CITY_REGISTRY.address, true], checkFn: 'isRegistry', checkArgs: [CITY_REGISTRY.address], checkExpected: true, checkType: 'bool' },
  { group: 'ReferralVault', label: 'setRegistry(DistrictRegistry, true)', contract: REFERRAL_VAULT, fn: 'setRegistry', args: [DISTRICT_REGISTRY.address, true], checkFn: 'isRegistry', checkArgs: [DISTRICT_REGISTRY.address], checkExpected: true, checkType: 'bool' },
  // CityRegistry — wire ReferralVault
  { group: 'CityRegistry', label: 'setReferralVault', contract: CITY_REGISTRY, fn: 'setReferralVault', args: [REFERRAL_VAULT.address], checkFn: 'referralVault', checkArgs: [], checkExpected: REFERRAL_VAULT.address.toLowerCase(), checkType: 'address' },
  // DistrictRegistry — wire ReferralVault
  { group: 'DistrictRegistry', label: 'setReferralVault', contract: DISTRICT_REGISTRY, fn: 'setReferralVault', args: [REFERRAL_VAULT.address], checkFn: 'referralVault', checkArgs: [], checkExpected: REFERRAL_VAULT.address.toLowerCase(), checkType: 'address' },
  // ActivityTracker — authorize all revenue-generating contracts
  { group: 'ActivityTracker', label: 'setApprovedTracker(AdSlots)', contract: ACTIVITY_TRACKER, fn: 'setApprovedTracker', args: [AD_SLOTS.address, true], checkFn: 'approvedTrackers', checkArgs: [AD_SLOTS.address], checkExpected: true, checkType: 'bool' },
  { group: 'ActivityTracker', label: 'setApprovedTracker(Storefronts)', contract: ACTIVITY_TRACKER, fn: 'setApprovedTracker', args: [STOREFRONTS.address, true], checkFn: 'approvedTrackers', checkArgs: [STOREFRONTS.address], checkExpected: true, checkType: 'bool' },
  { group: 'ActivityTracker', label: 'setApprovedTracker(EventTickets)', contract: ACTIVITY_TRACKER, fn: 'setApprovedTracker', args: [EVENT_TICKETS.address, true], checkFn: 'approvedTrackers', checkArgs: [EVENT_TICKETS.address], checkExpected: true, checkType: 'bool' },
  { group: 'ActivityTracker', label: 'setApprovedTracker(LeaseManager)', contract: ACTIVITY_TRACKER, fn: 'setApprovedTracker', args: [LEASE_MANAGER.address, true], checkFn: 'approvedTrackers', checkArgs: [LEASE_MANAGER.address], checkExpected: true, checkType: 'bool' },
  // CityProfile — approve both NFT registries
  { group: 'CityProfile', label: 'setApprovedNFT(CityRegistry)', contract: CITY_PROFILE, fn: 'setApprovedNFT', args: [CITY_REGISTRY.address, true], checkFn: 'approvedNFTs', checkArgs: [CITY_REGISTRY.address], checkExpected: true, checkType: 'bool' },
  { group: 'CityProfile', label: 'setApprovedNFT(DistrictRegistry)', contract: CITY_PROFILE, fn: 'setApprovedNFT', args: [DISTRICT_REGISTRY.address, true], checkFn: 'approvedNFTs', checkArgs: [DISTRICT_REGISTRY.address], checkExpected: true, checkType: 'bool' },
  // CityPass — wire registries and treasury
  { group: 'CityPass', label: 'setCityRegistry', contract: CITY_PASS, fn: 'setCityRegistry', args: [CITY_REGISTRY.address], checkFn: 'cityRegistry', checkArgs: [], checkExpected: CITY_REGISTRY.address.toLowerCase(), checkType: 'address' },
  { group: 'CityPass', label: 'setDistrictRegistry', contract: CITY_PASS, fn: 'setDistrictRegistry', args: [DISTRICT_REGISTRY.address], checkFn: 'districtRegistry', checkArgs: [], checkExpected: DISTRICT_REGISTRY.address.toLowerCase(), checkType: 'address' },
  { group: 'CityPass', label: 'setTreasury', contract: CITY_PASS, fn: 'setTreasury', args: [TREASURY.address], checkFn: 'treasury', checkArgs: [], checkExpected: TREASURY.address.toLowerCase(), checkType: 'address' },
  { group: 'CityPass', label: 'setRevenueSplitter', contract: CITY_PASS, fn: 'setRevenueSplitter', args: [REVENUE_SPLITTER.address], checkFn: 'revenueSplitter', checkArgs: [], checkExpected: REVENUE_SPLITTER.address.toLowerCase(), checkType: 'address' },
];

// Verify panel items reuse the same check config from WIRE_CALLS plus some extra read-only slots
type VerifyItem = {
  label: string;
  contract: ContractRef;
  fn: string;
  args: unknown[];
  expected: string | boolean;
  type: CheckType;
};

const VERIFY_ITEMS: VerifyItem[] = [
  { label: 'CityRegistry.treasuryContract', contract: CITY_REGISTRY, fn: 'treasuryContract', args: [], expected: TREASURY.address.toLowerCase(), type: 'address' },
  { label: 'CityRegistry.feeConfig', contract: CITY_REGISTRY, fn: 'feeConfig', args: [], expected: FEE_CONFIG.address.toLowerCase(), type: 'address' },
  { label: 'CityRegistry.revenueSplitter', contract: CITY_REGISTRY, fn: 'revenueSplitter', args: [], expected: REVENUE_SPLITTER.address.toLowerCase(), type: 'address' },
  { label: 'CityRegistry.leaseManager', contract: CITY_REGISTRY, fn: 'leaseManager', args: [], expected: LEASE_MANAGER.address.toLowerCase(), type: 'address' },
  { label: 'CityRegistry.districtRegistry', contract: CITY_REGISTRY, fn: 'districtRegistry', args: [], expected: DISTRICT_REGISTRY.address.toLowerCase(), type: 'address' },
  { label: 'CityRegistry.merkleRoot', contract: CITY_REGISTRY, fn: 'merkleRoot', args: [], expected: MERKLE_ROOT.toLowerCase(), type: 'bytes32' },
  { label: 'DistrictRegistry.cityRegistry', contract: DISTRICT_REGISTRY, fn: 'cityRegistry', args: [], expected: CITY_REGISTRY.address.toLowerCase(), type: 'address' },
  { label: 'DistrictRegistry.feeConfig', contract: DISTRICT_REGISTRY, fn: 'feeConfig', args: [], expected: FEE_CONFIG.address.toLowerCase(), type: 'address' },
  { label: 'DistrictRegistry.treasuryContract', contract: DISTRICT_REGISTRY, fn: 'treasuryContract', args: [], expected: TREASURY.address.toLowerCase(), type: 'address' },
  { label: 'DistrictRegistry.revenueSplitter', contract: DISTRICT_REGISTRY, fn: 'revenueSplitter', args: [], expected: REVENUE_SPLITTER.address.toLowerCase(), type: 'address' },
  { label: 'DistrictRegistry.leaseManager', contract: DISTRICT_REGISTRY, fn: 'leaseManager', args: [], expected: LEASE_MANAGER.address.toLowerCase(), type: 'address' },
  { label: 'RevenueSplitter.treasuryContract', contract: REVENUE_SPLITTER, fn: 'treasuryContract', args: [], expected: TREASURY.address.toLowerCase(), type: 'address' },
  { label: 'RevenueSplitter.feeConfig', contract: REVENUE_SPLITTER, fn: 'feeConfig', args: [], expected: FEE_CONFIG.address.toLowerCase(), type: 'address' },
  { label: 'RevenueSplitter.cityRegistry', contract: REVENUE_SPLITTER, fn: 'cityRegistry', args: [], expected: CITY_REGISTRY.address.toLowerCase(), type: 'address' },
  { label: 'RevenueSplitter.districtRegistry', contract: REVENUE_SPLITTER, fn: 'districtRegistry', args: [], expected: DISTRICT_REGISTRY.address.toLowerCase(), type: 'address' },
  { label: 'Treasury.isDepositor(CityRegistry)', contract: TREASURY, fn: 'isDepositor', args: [CITY_REGISTRY.address], expected: true, type: 'bool' },
  { label: 'Treasury.isDepositor(DistrictRegistry)', contract: TREASURY, fn: 'isDepositor', args: [DISTRICT_REGISTRY.address], expected: true, type: 'bool' },
  { label: 'Treasury.isDepositor(RevenueSplitter)', contract: TREASURY, fn: 'isDepositor', args: [REVENUE_SPLITTER.address], expected: true, type: 'bool' },
  { label: 'Treasury.isDepositor(CityMarketplace)', contract: TREASURY, fn: 'isDepositor', args: [CITY_MARKETPLACE.address], expected: true, type: 'bool' },
  { label: 'Treasury.isDepositor(LeaseManager)', contract: TREASURY, fn: 'isDepositor', args: [LEASE_MANAGER.address], expected: true, type: 'bool' },
  { label: 'CityMarketplace.treasury', contract: CITY_MARKETPLACE, fn: 'treasury', args: [], expected: TREASURY.address.toLowerCase(), type: 'address' },
  { label: 'CityMarketplace.treasuryContract', contract: CITY_MARKETPLACE, fn: 'treasuryContract', args: [], expected: TREASURY.address.toLowerCase(), type: 'address' },
  { label: 'CityMarketplace.feeConfig', contract: CITY_MARKETPLACE, fn: 'feeConfig', args: [], expected: FEE_CONFIG.address.toLowerCase(), type: 'address' },
  { label: 'CityMarketplace.approvedNFTs(CityRegistry)', contract: CITY_MARKETPLACE, fn: 'approvedNFTs', args: [CITY_REGISTRY.address], expected: true, type: 'bool' },
  { label: 'CityMarketplace.approvedNFTs(DistrictRegistry)', contract: CITY_MARKETPLACE, fn: 'approvedNFTs', args: [DISTRICT_REGISTRY.address], expected: true, type: 'bool' },
  { label: 'CityMarketplace.districtRegistry', contract: CITY_MARKETPLACE, fn: 'districtRegistry', args: [], expected: DISTRICT_REGISTRY.address.toLowerCase(), type: 'address' },
  { label: 'CityMarketplace.referralVault', contract: CITY_MARKETPLACE, fn: 'referralVault', args: [], expected: REFERRAL_VAULT.address.toLowerCase(), type: 'address' },
  { label: 'LeaseManager.treasury', contract: LEASE_MANAGER, fn: 'treasury', args: [], expected: OWNER.toLowerCase(), type: 'address' },
  { label: 'LeaseManager.feeConfig', contract: LEASE_MANAGER, fn: 'feeConfig', args: [], expected: FEE_CONFIG.address.toLowerCase(), type: 'address' },
  { label: 'LeaseManager.treasuryContract', contract: LEASE_MANAGER, fn: 'treasuryContract', args: [], expected: TREASURY.address.toLowerCase(), type: 'address' },
  { label: 'LeaseManager.approvedNFTs(CityRegistry)', contract: LEASE_MANAGER, fn: 'approvedNFTs', args: [CITY_REGISTRY.address], expected: true, type: 'bool' },
  { label: 'LeaseManager.approvedNFTs(DistrictRegistry)', contract: LEASE_MANAGER, fn: 'approvedNFTs', args: [DISTRICT_REGISTRY.address], expected: true, type: 'bool' },
  { label: 'AdSlots.treasury', contract: AD_SLOTS, fn: 'treasury', args: [], expected: OWNER.toLowerCase(), type: 'address' },
  { label: 'AdSlots.cityRegistry', contract: AD_SLOTS, fn: 'cityRegistry', args: [], expected: CITY_REGISTRY.address.toLowerCase(), type: 'address' },
  { label: 'AdSlots.districtRegistry', contract: AD_SLOTS, fn: 'districtRegistry', args: [], expected: DISTRICT_REGISTRY.address.toLowerCase(), type: 'address' },
  { label: 'AdSlots.revenueSplitter', contract: AD_SLOTS, fn: 'revenueSplitter', args: [], expected: REVENUE_SPLITTER.address.toLowerCase(), type: 'address' },
  { label: 'Storefronts.revenueSplitter', contract: STOREFRONTS, fn: 'revenueSplitter', args: [], expected: REVENUE_SPLITTER.address.toLowerCase(), type: 'address' },
  { label: 'Storefronts.districtRegistry', contract: STOREFRONTS, fn: 'districtRegistry', args: [], expected: DISTRICT_REGISTRY.address.toLowerCase(), type: 'address' },
  { label: 'Storefronts.cityRegistry', contract: STOREFRONTS, fn: 'cityRegistry', args: [], expected: CITY_REGISTRY.address.toLowerCase(), type: 'address' },
  { label: 'EventTickets.revenueSplitter', contract: EVENT_TICKETS, fn: 'revenueSplitter', args: [], expected: REVENUE_SPLITTER.address.toLowerCase(), type: 'address' },
  { label: 'EventTickets.cityRegistry', contract: EVENT_TICKETS, fn: 'cityRegistry', args: [], expected: CITY_REGISTRY.address.toLowerCase(), type: 'address' },
  { label: 'EventTickets.districtRegistry', contract: EVENT_TICKETS, fn: 'districtRegistry', args: [], expected: DISTRICT_REGISTRY.address.toLowerCase(), type: 'address' },
  { label: 'ReferralVault.isRegistry(CityRegistry)', contract: REFERRAL_VAULT, fn: 'isRegistry', args: [CITY_REGISTRY.address], expected: true, type: 'bool' },
  { label: 'ReferralVault.isRegistry(DistrictRegistry)', contract: REFERRAL_VAULT, fn: 'isRegistry', args: [DISTRICT_REGISTRY.address], expected: true, type: 'bool' },
  { label: 'ActivityTracker.approvedTrackers(AdSlots)', contract: ACTIVITY_TRACKER, fn: 'approvedTrackers', args: [AD_SLOTS.address], expected: true, type: 'bool' },
  { label: 'ActivityTracker.approvedTrackers(Storefronts)', contract: ACTIVITY_TRACKER, fn: 'approvedTrackers', args: [STOREFRONTS.address], expected: true, type: 'bool' },
  { label: 'ActivityTracker.approvedTrackers(EventTickets)', contract: ACTIVITY_TRACKER, fn: 'approvedTrackers', args: [EVENT_TICKETS.address], expected: true, type: 'bool' },
  { label: 'ActivityTracker.approvedTrackers(LeaseManager)', contract: ACTIVITY_TRACKER, fn: 'approvedTrackers', args: [LEASE_MANAGER.address], expected: true, type: 'bool' },
  { label: 'CityRegistry.referralVault', contract: CITY_REGISTRY, fn: 'referralVault', args: [], expected: REFERRAL_VAULT.address.toLowerCase(), type: 'address' },
  { label: 'DistrictRegistry.referralVault', contract: DISTRICT_REGISTRY, fn: 'referralVault', args: [], expected: REFERRAL_VAULT.address.toLowerCase(), type: 'address' },
  { label: 'CityProfile.approvedNFTs(CityRegistry)', contract: CITY_PROFILE, fn: 'approvedNFTs', args: [CITY_REGISTRY.address], expected: true, type: 'bool' },
  { label: 'CityProfile.approvedNFTs(DistrictRegistry)', contract: CITY_PROFILE, fn: 'approvedNFTs', args: [DISTRICT_REGISTRY.address], expected: true, type: 'bool' },
  { label: 'CityPass.cityRegistry', contract: CITY_PASS, fn: 'cityRegistry', args: [], expected: CITY_REGISTRY.address.toLowerCase(), type: 'address' },
  { label: 'CityPass.districtRegistry', contract: CITY_PASS, fn: 'districtRegistry', args: [], expected: DISTRICT_REGISTRY.address.toLowerCase(), type: 'address' },
  { label: 'CityPass.treasury', contract: CITY_PASS, fn: 'treasury', args: [], expected: TREASURY.address.toLowerCase(), type: 'address' },
  { label: 'CityPass.revenueSplitter', contract: CITY_PASS, fn: 'revenueSplitter', args: [], expected: REVENUE_SPLITTER.address.toLowerCase(), type: 'address' },
];

// ── Helpers ────────────────────────────────────────────────────────────────
function normalise(val: unknown, type: CheckType): string | boolean {
  if (type === 'bool') return val === true;
  if (typeof val === 'string') return val.toLowerCase();
  return String(val).toLowerCase();
}
function matches(actual: unknown, expected: string | boolean, type: CheckType): boolean {
  return normalise(actual, type) === expected;
}
function shorten(v: string) { return v.slice(0, 10) + '…' + v.slice(-6); }

// ── CopyAddress ─────────────────────────────────────────────────────────────
function CopyAddress({ value }: { value: string }) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const copy = useCallback(() => {
    void navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [value]);
  return (
    <span className="inline-flex items-center gap-1">
      <button onClick={() => setExpanded(e => !e)} className="font-mono text-xs text-slate-300 hover:text-white transition-colors">
        {expanded ? value : shorten(value)}
      </button>
      <button onClick={copy} title="Copy" className="text-slate-500 hover:text-slate-200 transition-colors">
        {copied ? <CheckCircle2 className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
      </button>
    </span>
  );
}

// ── VerifyPanel — sequential reads to avoid RPC rate limits ────────────────
function VerifyPanel() {
  const publicClient = usePublicClient();
  type SlotResult = { status: 'success'; result: unknown } | { status: 'failure'; error: string };
  const [results, setResults] = useState<SlotResult[]>([]);
  const [progress, setProgress] = useState(0);
  const [reading, setReading] = useState(false);
  const readingRef = useRef(false);

  const runReads = useCallback(async () => {
    if (!publicClient || readingRef.current) return;
    readingRef.current = true;
    setReading(true);
    setProgress(0);
    const out: SlotResult[] = [];
    for (let i = 0; i < VERIFY_ITEMS.length; i++) {
      const item = VERIFY_ITEMS[i];
      try {
        const result = await publicClient.readContract({
          address: item.contract.address,
          abi: item.contract.abi as never[],
          functionName: item.fn,
          args: item.args as never[],
        });
        out.push({ status: 'success', result });
      } catch (e) {
        const msg = e instanceof Error ? e.message.slice(0, 120) : String(e).slice(0, 120);
        out.push({ status: 'failure', error: msg });
      }
      setProgress(i + 1);
      await new Promise(r => setTimeout(r, 150));
    }
    setResults(out);
    setReading(false);
    readingRef.current = false;
  }, [publicClient]);

  useEffect(() => { void runReads(); }, [runReads]);

  const allLoaded = !reading && results.length === VERIFY_ITEMS.length;
  const passing = allLoaded
    ? results.filter((r, i) => r.status === 'success' && matches((r).result, VERIFY_ITEMS[i].expected, VERIFY_ITEMS[i].type)).length
    : 0;
  const total = VERIFY_ITEMS.length;

  const merkleIdx = VERIFY_ITEMS.findIndex(v => v.fn === 'merkleRoot');
  const merkleOnChain = merkleIdx >= 0 && results[merkleIdx]?.status === 'success' ? String(results[merkleIdx].result) : null;
  const groups = [...new Set(VERIFY_ITEMS.map(v => v.label.split('.')[0]))];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className={`text-sm font-semibold px-3 py-1 rounded-full ${
          reading ? 'bg-slate-700 text-slate-400'
          : passing === total ? 'bg-green-500/20 text-green-400'
          : 'bg-red-500/20 text-red-400'
        }`}>
          {reading ? `Reading… (${progress}/${total})` : `${passing} of ${total} checks passing`}
        </div>
        <button onClick={() => void runReads()} disabled={reading}
          className="text-xs text-slate-400 hover:text-white border border-slate-700 rounded px-2 py-1 transition-colors disabled:opacity-40">
          Re-read chain
        </button>
      </div>

      {merkleOnChain && (
        <div className="bg-slate-800 rounded-lg p-3 space-y-1">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Merkle Root</div>
          <div className="flex items-start gap-2 text-xs">
            <span className="text-slate-500 w-12 flex-shrink-0">file</span>
            <span className="font-mono text-slate-300 break-all">{MERKLE_ROOT}</span>
          </div>
          <div className="flex items-start gap-2 text-xs">
            <span className="text-slate-500 w-12 flex-shrink-0">chain</span>
            <span className="font-mono text-slate-300 break-all">{merkleOnChain}</span>
          </div>
          <div className={`text-xs font-bold mt-1 ${merkleOnChain.toLowerCase() === MERKLE_ROOT.toLowerCase() ? 'text-green-400' : 'text-red-400'}`}>
            {merkleOnChain.toLowerCase() === MERKLE_ROOT.toLowerCase() ? '✓ MATCH' : '✗ MISMATCH'}
          </div>
        </div>
      )}

      {groups.map(group => {
        const groupItems = VERIFY_ITEMS.map((item, i) => ({ item, i })).filter(({ item }) => item.label.startsWith(group + '.'));
        return (
          <div key={group} className="bg-slate-800/50 rounded-lg overflow-hidden">
            <div className="px-3 py-2 bg-slate-700/50 text-xs font-semibold text-slate-300">{group}</div>
            <div className="divide-y divide-slate-700/50">
              {groupItems.map(({ item, i }) => {
                const res = results[i] as { status: 'success'; result: unknown } | { status: 'failure'; error: string } | undefined;
                const loading = !res;
                const isError = res?.status === 'failure';
                const ok = res?.status === 'success' && matches(res.result, item.expected, item.type);
                const wrong = res?.status === 'success' && !ok;
                const actual = res?.status === 'success' ? res.result : null;
                const fn = item.label.split('.').slice(1).join('.');
                return (
                  <div key={item.label} className="flex items-center justify-between px-3 py-2 text-xs">
                    <span className="text-slate-400 font-mono">{fn}</span>
                    <div className="flex items-center gap-2">
                      {loading && <Loader2 className="w-3 h-3 animate-spin text-slate-500" />}
                      {isError && <span className="text-red-400 flex items-center gap-1 max-w-xs truncate" title={(res).error}><XCircle className="w-3 h-3" /> {(res).error.slice(0,60)}</span>}
                      {ok && (
                        <span className="text-green-400 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          {item.type === 'bool' ? 'true' : <CopyAddress value={String(actual)} />}
                        </span>
                      )}
                      {wrong && (
                        <span className="text-red-400 flex items-center gap-1">
                          <XCircle className="w-3 h-3" />
                          {item.type === 'bool' ? String(actual) : <CopyAddress value={String(actual)} />}
                          <span className="text-slate-500 ml-1">(expected <CopyAddress value={String(item.expected)} />)</span>
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── WiringRow ──────────────────────────────────────────────────────────────
function WiringRow({ call, index, isCurrent, isDone, isAlreadySet, onDone }: {
  call: WireCall; index: number; isCurrent: boolean; isDone: boolean; isAlreadySet: boolean; onDone: () => void;
}) {
  const { writeContract, data: txHash, isPending, error: writeError, reset } = useWriteContract();
  const { isLoading: isConfirming } = useWaitForTransactionReceipt({ hash: txHash });

  // Advance as soon as tx is submitted — Arc Testnet receipts can be slow
  useEffect(() => {
    if (txHash && isCurrent) {
      const t = setTimeout(() => onDone(), 1500);
      return () => clearTimeout(t);
    }
  }, [txHash, isCurrent, onDone]);

  const send = useCallback(() => {
    writeContract({
      address: call.contract.address,
      abi: call.contract.abi as never[],
      functionName: call.fn,
      args: call.args as never[],
    });
  }, [call, writeContract]);

  const label = `${call.group}.${call.label}`;

  if (isDone || isAlreadySet) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 text-xs">
        <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />
        <span className="text-slate-400 font-mono">{label}</span>
        <span className="ml-auto text-green-500 text-xs">{isAlreadySet && !isDone ? 'already set' : 'done'}</span>
      </div>
    );
  }

  return (
    <div className={`flex flex-col gap-1 px-3 py-2 ${isCurrent ? 'bg-slate-700/50' : ''}`}>
      <div className="flex items-center gap-2 text-xs">
        <span className="text-slate-500 w-5 text-right flex-shrink-0">{index + 1}.</span>
        <span className={`font-mono ${isCurrent ? 'text-white' : 'text-slate-500'}`}>{label}</span>
        {isCurrent && !isPending && !isConfirming && !txHash && (
          <button onClick={send} className="ml-auto px-3 py-1 bg-yellow-500 hover:bg-yellow-400 text-black text-xs font-semibold rounded transition-colors">
            Send
          </button>
        )}
        {isPending && <span className="ml-auto text-xs text-slate-400 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Confirm in wallet…</span>}
        {txHash && !isPending && <span className="ml-auto text-xs text-green-400 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Submitted</span>}
        {writeError && (
          <span className="ml-auto flex items-center gap-1 text-red-400">
            <AlertCircle className="w-3 h-3" />
            <button onClick={reset} className="underline text-xs">Retry</button>
          </span>
        )}
      </div>
      {txHash && (
        <a href={`https://explorer.testnet.arc.io/tx/${txHash}`} target="_blank" rel="noreferrer"
          className="text-xs text-blue-400 hover:underline ml-7 font-mono">{txHash.slice(0, 18)}…</a>
      )}
    </div>
  );
}

// ── Admin Backfill — mint districts for legacy cities ─────────────────────
// Cities claimed on old CityRegistry v2 need their districts minted once.
// Add any legacy city here: { cityId, tier (1–6), ownerAddress }
const BACKFILL_CITIES = [
  { cityId: 1n, tier: 6, label: 'les Escaldes (cityId=1, tier=6)', owner: '0xBa8132759933F513b5AD4f2aD5DdEFC38dd388f3' as `0x${string}` },
  { cityId: 2n, tier: 6, label: 'Andorra la Vella (cityId=2, tier=6)', owner: '0xBa8132759933F513b5AD4f2aD5DdEFC38dd388f3' as `0x${string}` },
  { cityId: 8n, tier: 6, label: 'Dibba Al-Fujairah (cityId=8, tier=6)', owner: '0xb3FfE33BB506d316D4995C8FF5E63d5A742B10C1' as `0x${string}` },
];

function BackfillRow({ cityId, tier, label, owner }: { cityId: bigint; tier: number; label: string; owner: `0x${string}` }) {
  const { writeContract, data: txHash, isPending, error: writeError, reset } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash: txHash });

  // Check if already minted (balanceOf owner should be > 0 for this cityId's districts)
  const { data: balData } = useReadContracts({
    contracts: [{ address: DISTRICT_REGISTRY.address, abi: DISTRICT_REGISTRY.abi as never[], functionName: 'balanceOf', args: [owner] }],
  });
  const balance = balData?.[0]?.status === 'success' ? Number(balData[0].result) : null;
  const districtCounts: Record<number, number> = { 1: 24, 2: 16, 3: 12, 4: 8, 5: 6, 6: 4 };
  const expectedCount = districtCounts[tier] ?? 0;

  const send = useCallback(() => {
    writeContract({
      address: DISTRICT_REGISTRY.address,
      abi: DISTRICT_REGISTRY.abi as never[],
      functionName: 'mintBatchAdmin',
      args: [cityId, tier, owner],
    });
  }, [cityId, tier, owner, writeContract]);

  const alreadyMinted = (balance !== null && balance >= expectedCount) || isConfirmed || !!txHash;

  return (
    <div className="flex flex-col gap-1 px-3 py-2">
      <div className="flex items-center gap-2 text-xs">
        <span className="font-mono text-slate-300 flex-1">{label}</span>
        <span className="text-slate-500">→ {owner.slice(0, 8)}…</span>
        {alreadyMinted && <span className="text-green-400 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> minted</span>}
        {!alreadyMinted && !isPending && !isConfirming && !isConfirmed && (
          <button onClick={send} className="px-3 py-1 bg-yellow-500 hover:bg-yellow-400 text-black text-xs font-semibold rounded transition-colors">
            Mint Districts
          </button>
        )}
        {isPending && <span className="text-slate-400 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Confirm…</span>}
        {isConfirming && <span className="text-slate-400 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Confirming…</span>}
        {isConfirmed && <span className="text-green-400 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> done</span>}
        {writeError && <button onClick={reset} className="text-red-400 underline text-xs">Retry</button>}
      </div>
      {txHash && (
        <a href={`https://explorer.testnet.arc.io/tx/${txHash}`} target="_blank" rel="noreferrer"
          className="text-xs text-blue-400 hover:underline ml-0 font-mono">{txHash.slice(0, 18)}…</a>
      )}
    </div>
  );
}

function BackfillPanel() {
  return (
    <div className="space-y-3">
      <div className="bg-slate-900 rounded-lg border border-yellow-500/30 overflow-hidden">
        <div className="px-3 py-2 bg-yellow-500/10 text-xs font-semibold text-yellow-400 uppercase tracking-wide">
          Admin Backfill — Legacy Cities
        </div>
        <p className="px-3 py-2 text-xs text-slate-400">
          Cities claimed on the old CityRegistry v2 before districts-on-mint was added. Call <code className="font-mono bg-slate-800 px-1 rounded">mintBatchAdmin</code> to mint their districts now.
        </p>
        <div className="divide-y divide-slate-800">
          {BACKFILL_CITIES.map(c => (
            <BackfillRow key={String(c.cityId)} {...c} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── ContractSetup (main) ───────────────────────────────────────────────────
export default function ContractSetup() {
  const { address } = useAccount();
  const LS_KEY = 'cityonchain_setup_v1';
  const [started, setStarted] = useState(() => {
    try { const s = JSON.parse(localStorage.getItem(LS_KEY) ?? '{}') as Record<string, unknown>; return s['started'] === true; } catch { return false; }
  });
  const [doneSteps, setDoneSteps] = useState<Set<number>>(() => {
    try { const s = JSON.parse(localStorage.getItem(LS_KEY) ?? '{}') as Record<string, unknown>; const d = s['done']; return new Set<number>(Array.isArray(d) ? (d as number[]) : []); } catch { return new Set(); }
  });
  const [showVerify, setShowVerify] = useState(false);

  // Persist wiring progress across refreshes
  useEffect(() => {
    try { localStorage.setItem(LS_KEY, JSON.stringify({ started, done: [...doneSteps] })); } catch { /* ignore */ }
  }, [started, doneSteps]);

  const resetProgress = useCallback(() => {
    try { localStorage.removeItem(LS_KEY); } catch { /* ignore */ }
    setStarted(false);
    setDoneSteps(new Set());
  }, []);

  // Single batch read for all pre-checks — one multicall, no per-hook instances
  const { data: preCheckData, isFetching: preCheckLoading } = useReadContracts({
    contracts: WIRE_CALLS.map(c => ({
      address: c.contract.address,
      abi: c.contract.abi as never[],
      functionName: c.checkFn,
      args: c.checkArgs as never[],
    })),
  });

  // Derive alreadySet during render — no setState, no effect
  const alreadySet = useMemo(() => {
    const s = new Set<number>();
    if (!preCheckData || preCheckData.length !== WIRE_CALLS.length) return s;
    preCheckData.forEach((res, i) => {
      if (res.status === 'success' && matches(res.result, WIRE_CALLS[i].checkExpected, WIRE_CALLS[i].checkType)) {
        s.add(i);
      }
    });
    return s;
  }, [preCheckData]);

  const handleDone = useCallback((idx: number) => {
    setDoneSteps(prev => { const s = new Set(prev); s.add(idx); return s; });
    toast.success(`${WIRE_CALLS[idx].group}.${WIRE_CALLS[idx].label} confirmed`);
  }, []);

  const isOwner = address?.toLowerCase() === OWNER.toLowerCase();
  const allDone = WIRE_CALLS.every((_, i) => doneSteps.has(i) || alreadySet.has(i));
  const pendingCount = WIRE_CALLS.filter((_, i) => !doneSteps.has(i) && !alreadySet.has(i)).length;
  const preCheckDone = !preCheckLoading && !!preCheckData;
  const groups = [...new Set(WIRE_CALLS.map(c => c.group))];

  // Derive currentStep: first index that is neither done nor already-set
  const currentStep = WIRE_CALLS.findIndex((_, i) => !doneSteps.has(i) && !alreadySet.has(i));

  if (!address) return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <p className="text-slate-400">Connect your wallet to use the Setup page.</p>
    </div>
  );

  if (!isOwner) return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <div className="text-center space-y-2">
        <AlertCircle className="w-8 h-8 text-red-400 mx-auto" />
        <p className="text-slate-300">Setup is restricted to the contract owner.</p>
        <p className="text-xs text-slate-500 font-mono">{OWNER}</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="max-w-2xl mx-auto px-4 py-10 space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Contract Setup</h1>
          <p className="text-sm text-slate-400 mt-1">Wire all contracts from the owner wallet. Each call requires one wallet confirmation.</p>
          <div className="flex items-center justify-between mt-1">
            <p className="text-xs text-slate-500">
              {preCheckLoading ? 'Reading on-chain state…'
                : `${pendingCount} of ${WIRE_CALLS.length} calls pending`}
            </p>
            {(started || doneSteps.size > 0) && (
              <button onClick={resetProgress} className="text-xs text-slate-600 hover:text-slate-400 underline">Reset progress</button>
            )}
          </div>
        </div>

        {preCheckDone && !allDone && !started && pendingCount > 0 && (
          <button onClick={() => setStarted(true)}
            className="w-full py-3 bg-yellow-500 hover:bg-yellow-400 text-black font-bold rounded-lg transition-colors">
            Start Wiring ({pendingCount} calls)
          </button>
        )}

        <div className="space-y-2">
          {groups.map(group => {
            const groupCalls = WIRE_CALLS.map((c, i) => ({ c, i })).filter(({ c }) => c.group === group);
            return (
              <div key={group} className="bg-slate-900 rounded-lg border border-slate-800 overflow-hidden">
                <div className="px-3 py-2 bg-slate-800/60 text-xs font-semibold text-slate-300 uppercase tracking-wide">{group}</div>
                <div className="divide-y divide-slate-800">
                  {groupCalls.map(({ c, i }) => (
                    <WiringRow
                      key={`${c.group}-${c.label}`}
                      call={c} index={i}
                      isCurrent={started && i === currentStep}
                      isDone={doneSteps.has(i)}
                      isAlreadySet={alreadySet.has(i)}
                      onDone={() => handleDone(i)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {allDone && (
          <div className="bg-green-500/10 border border-green-500/30 rounded-lg px-4 py-3 text-green-400 font-semibold text-sm flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5" />
            All {WIRE_CALLS.length} calls wired.
          </div>
        )}

        <div className="space-y-3">
          <button onClick={() => setShowVerify(v => !v)}
            className="w-full flex items-center justify-between px-4 py-3 bg-slate-900 border border-slate-800 rounded-lg text-sm font-semibold hover:bg-slate-800 transition-colors">
            <span>Verify All Slots (live chain read)</span>
            {showVerify ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          {showVerify && <VerifyPanel />}
        </div>

        <BackfillPanel />
      </div>
    </div>
  );
}
