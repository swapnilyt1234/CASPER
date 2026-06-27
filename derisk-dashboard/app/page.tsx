'use client';

import React, { useEffect, useState } from 'react';
import { fetchVaultState } from '@/utils/casper';
import { fetchAuditTrail, AuditLog } from '@/utils/casper-server';

export default function DashboardPage() {
  const [vaultState, setVaultState] = useState({ rate: 5, isHalted: false });
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshSeconds, setRefreshSeconds] = useState(10);

  const loadData = async () => {
    const state = await fetchVaultState();
    const logs = await fetchAuditTrail();
    setVaultState(state);
    setAuditLogs(logs);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(() => {
      setRefreshSeconds((prev) => {
        if (prev <= 1) {
          loadData();
          return 10;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 font-sans antialiased selection:bg-teal-500 selection:text-slate-950">
      {/* ── BACKGROUND GLOW DECORATIONS ── */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-teal-500/10 rounded-full blur-[128px] pointer-events-none" />
      <div className="absolute top-1/3 right-1/4 w-96 h-96 bg-indigo-500/10 rounded-full blur-[128px] pointer-events-none" />

      {/* ── HEADER NAVIGATION ── */}
      <header className="sticky top-0 z-40 w-full border-b border-slate-900 bg-slate-950/80 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-teal-400 to-indigo-600 flex items-center justify-center shadow-lg shadow-teal-500/20">
              <span className="text-slate-950 font-black text-sm">DR</span>
            </div>
            <span className="text-lg font-bold tracking-tight bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">
              DeRisk Vault
            </span>
            <span className="text-xs bg-slate-900 border border-slate-800 text-teal-400 px-2 py-0.5 rounded-full font-mono">
              Casper Testnet
            </span>
          </div>
          <div className="flex items-center space-x-4">
            <div className="text-xs text-slate-400 font-mono flex items-center space-x-2 bg-slate-900/60 px-3 py-1.5 rounded-md border border-slate-900">
              <span className="w-2 h-2 rounded-full bg-teal-400 animate-pulse" />
              <span>Auto-refreshing in {refreshSeconds}s</span>
            </div>
            <button
              onClick={() => { setLoading(true); loadData(); setRefreshSeconds(10); }}
              className="text-xs font-medium px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-200 rounded-md border border-slate-800 transition-colors"
            >
              Sync Node
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-12">
        {/* ── SECTION 1: HERO LANDING SEGMENT ── */}
        <section className="text-center max-w-3xl mx-auto space-y-4 py-4">
          <h1 className="text-4xl sm:text-5xl font-black tracking-tight text-white leading-tight">
            Autonomous Risk Protection for{" "}
            <span className="bg-gradient-to-r from-teal-400 to-indigo-400 bg-clip-text text-transparent">
              Casper Ecosystem Assets
            </span>
          </h1>
          <p className="text-slate-400 text-base sm:text-lg max-w-2xl mx-auto">
            DeRisk Vault uses an intelligent off-chain AI sentinel running 24/7 to continuously calculate asset volatility parameters and dynamically modify pool protection strategies directly on-chain.
          </p>
        </section>

        {/* ── SECTION 2: METRIC HIGHLIGHT CARDS ── */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Card 1: Live Rate Status */}
          <div className="p-6 bg-slate-900/40 rounded-xl border border-slate-900/80 backdrop-blur-sm shadow-inner flex flex-col justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Current Premium Loading</p>
              <h3 className="text-4xl font-black text-white mt-2 font-mono">
                {loading ? "..." : `${vaultState.rate}%`}
              </h3>
            </div>
            <div className="mt-4 pt-4 border-t border-slate-900 text-xs text-slate-400">
              Adjusts dynamically between <span className="text-slate-200">5% (Stable)</span> and <span className="text-slate-200">15% (Volatile)</span>.
            </div>
          </div>

          {/* Card 2: Coverage Halt Status */}
          <div className="p-6 bg-slate-900/40 rounded-xl border border-slate-900/80 backdrop-blur-sm shadow-inner flex flex-col justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Liquidity Underwriting</p>
              <div className="flex items-center space-x-2 mt-2">
                <span className={`w-3 h-3 rounded-full ${vaultState.isHalted ? 'bg-rose-500' : 'bg-emerald-500'}`} />
                <h3 className="text-xl font-bold text-white">
                  {loading ? "Syncing..." : vaultState.isHalted ? "HALTED (Emergency Lock)" : "ACTIVE (Operational)"}
                </h3>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-slate-900 text-xs text-slate-400">
              {vaultState.isHalted
                ? "AI deactivated protocol entry due to market capitulation anomalies."
                : "Pool liquidity is open for standard collateralized hedge writing."}
            </div>
          </div>

          {/* Card 3: Connected Smart Contract */}
          <div className="p-6 bg-slate-900/40 rounded-xl border border-slate-900/80 backdrop-blur-sm shadow-inner flex flex-col justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Contract Verification</p>
              <h3 className="text-sm font-mono text-teal-400 truncate mt-3 bg-slate-950 p-2 rounded border border-slate-900">
                hash-364fe8def07e59e7fb7d5266fa94a74b0a7e5fde6c1c40b0f6d81d265b58d658
              </h3>
            </div>
            <div className="mt-4 pt-4 border-t border-slate-900 text-xs text-slate-400">
              State derived directly using dedicated cryptographic dictionary leaf indexes.
            </div>
          </div>
        </section>

        {/* ── SECTION 3: PATH B - THE AUDIT TRAIL ── */}
        <section className="bg-slate-900/20 border border-slate-900 rounded-xl p-6 sm:p-8 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-slate-900 pb-4">
            <div>
              <h2 className="text-xl font-bold text-white">Cryptographic Audit Trail</h2>
              <p className="text-xs text-slate-400 mt-1">
                Verifiable log of ledger transformations dispatched exclusively by the authorized AI agent wallet.
              </p>
            </div>
            <div className="mt-2 sm:mt-0 px-3 py-1 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-medium rounded-md">
              Immutable Records
            </div>
          </div>

          {/* Timeline Node Chain */}
          <div className="space-y-8 relative before:absolute before:inset-0 before:left-4 before:w-0.5 before:bg-slate-900 before:pointer-events-none">
            {loading ? (
              <div className="text-slate-500 font-mono text-sm py-4 pl-8">Parsing transaction effects arrays...</div>
            ) : auditLogs.length === 0 ? (
              <div className="text-slate-500 font-mono text-sm py-4 pl-8">No matching deployment writes discovered.</div>
            ) : (
              auditLogs.map((log, idx) => (
                <div key={idx} className="relative flex flex-col sm:flex-row sm:items-start pl-10 space-y-2 sm:space-y-0 sm:space-x-4 group">
                  {/* Absolute positioning marker dot */}
                  <div className="absolute left-2 top-1.5 w-4.5 h-4.5 -translate-x-1/2 rounded-full border-4 border-slate-950 bg-indigo-500 group-hover:scale-110 transition-transform" />

                  {/* Left Column: Metadata Timeline */}
                  <div className="w-full sm:w-44 flex-shrink-0 font-mono text-xs text-slate-500 pt-0.5">
                    {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    <span className="block text-[10px] text-slate-600 mt-0.5">
                      {new Date(log.timestamp).toLocaleDateString()}
                    </span>
                  </div>

                  {/* Right Column: Log Detail Block */}
                  <div className="flex-grow bg-slate-900/40 p-4 rounded-lg border border-slate-900 hover:border-slate-800/80 transition-colors space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-bold text-slate-100">{log.action}</h4>
                      <span className="px-2 py-0.5 font-mono text-[10px] uppercase font-bold tracking-wide rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        {log.status}
                      </span>
                    </div>

                    {/* Transformed Values Badges */}
                    <div className="flex flex-wrap gap-3 font-mono text-xs text-slate-400">
                      <div className="bg-slate-950 px-2.5 py-1 rounded border border-slate-900">
                        Param State: <span className="text-teal-400 font-bold">{log.rate}% Rate</span>
                      </div>
                      <div className="bg-slate-950 px-2.5 py-1 rounded border border-slate-900">
                        Halt Flag: <span className={log.halted ? 'text-rose-400 font-bold' : 'text-slate-400 font-bold'}>
                          {log.halted ? 'TRUE' : 'FALSE'}
                        </span>
                      </div>
                      <div className="bg-slate-950 px-2.5 py-1 rounded border border-slate-900">
                        Network Cost: <span className="text-slate-300">{log.cost}</span>
                      </div>
                    </div>

                    {/* Linkable Deploy Hash String */}
                    <div className="pt-2 border-t border-slate-950 flex items-center justify-between text-[11px] text-slate-500 font-mono">
                      <span className="truncate max-w-xs sm:max-w-md">Deploy Hash: {log.deployHash}</span>
                      <a
                        href={`https://testnet.cspr.live/deploy/${log.deployHash}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-teal-400 hover:underline flex-shrink-0 ml-4"
                      >
                        Verify Receipts →
                      </a>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </main>

      {/* ── FOOTER DEFI BRANDING ── */}
      <footer className="border-t border-slate-900 mt-20 bg-slate-950">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 font-mono">
          <p>© 2026 DeRisk Vault Protocol. Fully Decentralized AI Agent Management Grid.</p>
          <p className="mt-2 sm:mt-0 text-slate-600">Powered by Monad Network & Casper Global State Transforms</p>
        </div>
      </footer>
    </div>
  );
}

function AuditTrail() {
  const [logs, setLogs] = useState<any[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    const loadLogs = async () => {
      try {
        // Since it's in the same project, you can fetch directly via Next.js api 
        // or use a direct route if you don't want to deal with server action paths
        const res = await fetch('/audit_logs.json', { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          setLogs(data);
        }
      } catch (err) {
        console.error("Failed to load audit logs:", err);
      }
    };
    loadLogs();
    const interval = setInterval(loadLogs, 15000);
    return () => clearInterval(interval);
  }, []);

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    try {
      const res = await fetch('/audit_logs.json', { cache: 'no-store' });
      if (res.ok) setLogs(await res.json());
    } finally {
      setTimeout(() => setIsRefreshing(false), 500);
    }
  };

  return (
    <div className="bg-slate-900/60 p-6 rounded-xl border border-slate-800 shadow-2xl flex flex-col h-full max-h-[450px]">
      <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-4">
        <div className="flex items-center gap-3">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-teal-500"></span>
          </span>
          <h2 className="text-xl font-bold text-white tracking-wide">Sentinel Audit Trail</h2>
        </div>
        <button onClick={handleManualRefresh} className="text-xs text-slate-400 hover:text-teal-400 transition-colors flex items-center gap-1">
          <svg className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-teal-400' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh
        </button>
      </div>
      <div className="overflow-y-auto space-y-4 pr-1">
        {logs.length === 0 ? (
          <div className="text-center text-slate-500 py-8 text-sm">No AI interventions recorded yet.</div>
        ) : (
          logs.map((log: any, idx: number) => (
            <div key={idx} className="bg-slate-950/50 rounded-lg p-4 border border-slate-800/50 relative overflow-hidden">
              <div className={`absolute left-0 top-0 bottom-0 w-1 ${log.halted ? 'bg-rose-500' : 'bg-teal-500'}`}></div>
              <div className="flex justify-between items-start mb-2 pl-2">
                <span className={`text-xs font-bold uppercase tracking-wider ${log.halted ? 'text-rose-400' : 'text-teal-400'}`}>{log.action}</span>
                <span className="text-xs text-slate-500 font-mono">{new Date(log.timestamp).toLocaleTimeString()}</span>
              </div>
              <div className="pl-2 space-y-1 text-sm flex justify-between">
                <span className="text-slate-400">Vault State: Rate {log.rate}% | {log.halted ? 'LOCKED' : 'OPEN'}</span>
                <a href={`https://testnet.cspr.live/deploy/${log.deployHash}`} target="_blank" rel="noopener noreferrer" className="text-indigo-400 text-xs hover:underline font-mono truncate max-w-[120px]">{log.deployHash.slice(0, 6)}...</a>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}