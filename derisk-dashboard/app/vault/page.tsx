'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { fetchVaultState } from '@/utils/casper';
import { fetchAuditTrail, AuditLog } from '@/utils/casper-server';
import { Header } from '@/app/components/dashboard/Header';
import { StatusCards } from '@/app/components/dashboard/StatusCards';
import { VaultForm } from '@/app/components/dashboard/VaultForm';
import { SentinelFeed } from '@/app/components/dashboard/SentinelFeed';
import * as CasperSDK_Raw from 'casper-js-sdk';

// Robust runtime check to handle variations in production bundling environments
const sdkTarget = (CasperSDK_Raw as any).default || CasperSDK_Raw;

const { 
  CLPublicKey, 
  DeployUtil, 
  RuntimeArgs, 
  CLValueBuilder, 
  decodeBase16, 
  CasperClient 
} = sdkTarget as any;

const REFRESH_SECONDS = 10;

export default function VaultDashboard() {
  /* ── Protocol state (from real Casper RPC — read-only) ── */
  const [vaultState, setVaultState] = useState({ rate: 5, isHalted: false });
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);

  /* ── Header refresh countdown ── */
  const [seconds, setSeconds] = useState(REFRESH_SECONDS);
  const [syncing, setSyncing] = useState(false);

  /* ── Casper Wallet adapter (unchanged from original vault/page.tsx) ── */
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [isWalletInstalled, setIsWalletInstalled] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);

  /* ──────────────────────────────────────────────── */
  /* Data loading — calls the existing fetchVaultState and fetchAuditTrail */
  /* ──────────────────────────────────────────────── */
  const loadData = useCallback(async () => {
    const [state, logs] = await Promise.all([
      fetchVaultState(),
      fetchAuditTrail(),
    ]);
    setVaultState(state);
    setAuditLogs(logs);
  }, []);

  /* Auto-refresh every REFRESH_SECONDS */
  useEffect(() => {
    loadData();
    const t = setInterval(() => {
      setSeconds((s) => {
        if (s <= 1) {
          loadData();
          return REFRESH_SECONDS;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [loadData]);

  const sync = () => {
    setSyncing(true);
    setSeconds(REFRESH_SECONDS);
    loadData().finally(() => setTimeout(() => setSyncing(false), 600));
  };

  /* ──────────────────────────────────────────────── */
  /* Casper Wallet detection + event listeners        */
  /* Exact same logic as the original vault/page.tsx  */
  /* ──────────────────────────────────────────────── */
  useEffect(() => {
    let attempts = 0;
    const check = setInterval(async () => {
      attempts++;
      if (typeof window !== 'undefined' && (window as any).CasperWalletProvider) {
        setIsWalletInstalled(true);
        clearInterval(check);
        try {
          const provider = (window as any).CasperWalletProvider();
          const isConnected = await provider.isConnected();
          if (isConnected) {
            const key = await provider.getActivePublicKey();
            if (key) setWalletAddress(key);
          }
        } catch {}
        window.addEventListener('casper-wallet:activeKeyChanged', (e: any) => {
          setWalletAddress(e?.detail?.activeKey ?? null);
        });
        window.addEventListener('casper-wallet:disconnected', () =>
          setWalletAddress(null)
        );
      }
      if (attempts >= 20) clearInterval(check);
    }, 100);
    return () => clearInterval(check);
  }, []);

  /* ──────────────────────────────────────────────── */
  /* Wallet actions                                   */
  /* ──────────────────────────────────────────────── */
  const connectWallet = async () => {
    if (!isWalletInstalled) return;
    setIsConnecting(true);
    try {
      const provider = (window as any).CasperWalletProvider();
      const ok = await provider.requestConnection();
      if (ok) {
        const key = await provider.getActivePublicKey();
        setWalletAddress(key);
      }
    } finally {
      setIsConnecting(false);
    }
  };

  const disconnectWallet = async () => {
    try {
      if ((window as any).CasperWalletProvider) {
        await (window as any).CasperWalletProvider().disconnectFromSite();
      }
    } catch {}
    setWalletAddress(null);
  };

  /* ──────────────────────────────────────────────── */
  /* Deposit — calls the existing on-chain function   */
  /* ──────────────────────────────────────────────── */
  const handleDeposit = async (amount: number): Promise<string> => {
    if (!walletAddress) throw new Error('Wallet not connected');

    const provider = (window as any).CasperWalletProvider();
    const senderKey = CLPublicKey.fromHex(walletAddress);

    const amountInMotes = (amount * 1_000_000_000).toString();
    const contractHashHex =
      '364fe8def07e59e7fb7d5266fa94a74b0a7e5fde6c1c40b0f6d81d265b58d658';
    const contractHashAsByteArray = decodeBase16(contractHashHex);

    const args = RuntimeArgs.fromMap({
      amount: CLValueBuilder.u512(amountInMotes),
    });

    const session = DeployUtil.ExecutableDeployItem.newStoredContractByHash(
      contractHashAsByteArray,
      'deposit',
      args
    );
    const payment = DeployUtil.standardPayment(5_000_000_000);
    const deployParams = new DeployUtil.DeployParams(
      senderKey,
      'casper-test',
      1,
      1800000
    );
    const deploy = DeployUtil.makeDeploy(deployParams, session, payment);
    const deployJson = DeployUtil.deployToJson(deploy);

    const signResult = await provider.sign(
      JSON.stringify(deployJson),
      walletAddress
    );
    if (signResult.cancelled) throw new Error('Transaction rejected by user.');

    let signedDeploy;
    const deployData = signResult.deploy || signResult;
    const parsedData =
      typeof deployData === 'string' ? JSON.parse(deployData) : deployData;
    const parseResult = DeployUtil.deployFromJson(parsedData);

    if (parseResult.ok) {
      signedDeploy = parseResult.unwrap();
    } else if (signResult.signature || signResult.signatureHex) {
      const sigBytes =
        signResult.signature instanceof Uint8Array
          ? signResult.signature
          : signResult.signature
          ? Uint8Array.from(Object.values(signResult.signature))
          : decodeBase16(signResult.signatureHex);
      signedDeploy = DeployUtil.setSignature(deploy, sigBytes, senderKey);
    } else {
      throw new Error('Unrecognized signature format from Casper Wallet.');
    }

    const client = new CasperClient('/api/rpc');
    const txHash = await client.putDeploy(signedDeploy);
    const hashStr =
      typeof txHash === 'string' ? txHash : (txHash as any).toString();

    /* Poll for confirmation */
    for (let i = 1; i <= 60; i++) {
      await new Promise((r) => setTimeout(r, 5000));
      try {
        const res = await fetch('/api/rpc', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          cache: 'no-store',
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: i,
            method: 'info_get_deploy',
            params: [hashStr.replace(/^0x/, '')],
          }),
        });
        const data = await res.json();
        const exec = data.result?.execution_info?.execution_result?.Version2;
        if (exec) {
          if (exec.error_message !== null)
            throw new Error(`Contract reverted: ${exec.error_message}`);
          break;
        }
      } catch (e: any) {
        if (e.message?.includes('Contract reverted')) throw e;
      }
    }

    // Refresh local state
    loadData();

    return hashStr;
  };

  /* ── Adapter: map real field names to component props ── */
  const halted = vaultState.isHalted;
  const premium = vaultState.rate;

  return (
    <div className="min-h-screen bg-background">
      <Header
        seconds={seconds}
        syncing={syncing}
        connected={!!walletAddress}
        pubkey={walletAddress}
        isWalletInstalled={isWalletInstalled}
        onSync={sync}
        onConnect={connectWallet}
        onDisconnect={disconnectWallet}
      />

      <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-10 space-y-10">
        {/* ── Protocol status ── */}
        <section>
          <div className="flex items-end justify-between flex-wrap gap-3 mb-6">
            <div>
              <div className="inline-flex items-center gap-2 text-xs text-mono uppercase tracking-[0.16em] text-primary">
                <span className="h-px w-6 bg-primary" /> Protocol status
              </div>
              <h1 className="mt-2 text-2xl sm:text-3xl font-semibold tracking-tight">
                Live parameters
              </h1>
            </div>
            <div className="flex items-center gap-2 text-xs text-mono text-ink-muted">
              <span className="h-1.5 w-1.5 rounded-full bg-success pulse-dot" />
              SENTINEL ONLINE
            </div>
          </div>
          <StatusCards halted={halted} premium={premium} />
        </section>

        {/* ── Operations row ── */}
        <section className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          <div className="lg:col-span-2">
            <VaultForm
              halted={halted}
              walletAddress={walletAddress}
              isWalletInstalled={isWalletInstalled}
              onConnectWallet={connectWallet}
              onDeposit={handleDeposit}
            />
          </div>
          <div className="lg:col-span-3">
            {walletAddress ? (
              <SentinelFeed logs={auditLogs} />
            ) : (
              // Disconnected placeholder — mounts SentinelFeed only after wallet connect
              <div className="rounded-2xl border border-border bg-card overflow-hidden flex flex-col items-center justify-center py-20 gap-4">
                <div className="h-10 w-10 rounded-full bg-accent flex items-center justify-center">
                  <svg className="h-5 w-5 text-accent-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5V6.75a4.5 4.5 0 1 1 9 0v3.75M3.75 21.75h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H3.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
                  </svg>
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-foreground">Connect your wallet</p>
                  <p className="mt-1 text-[13px] text-ink-muted">The AI Sentinel audit trail unlocks after you connect.</p>
                </div>
              </div>
            )}
          </div>
        </section>

        <footer className="pt-6 pb-10 text-center text-xs text-ink-muted text-mono">
          DERISK VAULT · CASPER TESTNET · v0.4.1
        </footer>
      </main>
    </div>
  );
}