'use client';

import { useState, useEffect } from 'react';
import { AlertOctagon, Cpu, ExternalLink, Settings2, ShieldAlert, XCircle, CheckCircle2 } from 'lucide-react';
import { AuditLog } from '@/utils/casper-server';

type EntryType = 'freeze' | 'premium' | 'optimize';

function classifyAction(action: string, halted: boolean): EntryType {
  if (halted || action.toLowerCase().includes('halt') || action.toLowerCase().includes('freeze') || action.toLowerCase().includes('emergency')) {
    return 'freeze';
  }
  if (action.toLowerCase().includes('premium') || action.toLowerCase().includes('volatility') || action.toLowerCase().includes('rate')) {
    return 'premium';
  }
  return 'optimize';
}

function TypeIcon({ type }: { type: EntryType }) {
  const cfg = {
    freeze: {
      Icon: ShieldAlert,
      color: 'text-emergency',
      bg: 'bg-[color-mix(in_oklab,var(--emergency)_12%,var(--card))] border-emergency/30',
    },
    premium: {
      Icon: AlertOctagon,
      color: 'text-warning',
      bg: 'bg-[color-mix(in_oklab,var(--warning)_15%,var(--card))] border-warning/30',
    },
    optimize: {
      Icon: Settings2,
      color: 'text-primary',
      bg: 'bg-accent border-primary/20',
    },
  }[type];
  const { Icon, color, bg } = cfg;
  return (
    <div
      className={`h-9 w-9 rounded-lg border ${bg} flex items-center justify-center shrink-0`}
    >
      <Icon className={`h-4 w-4 ${color}`} />
    </div>
  );
}

function Stat({
  k,
  v,
  tone,
}: {
  k: string;
  v: string;
  tone?: 'ok' | 'danger';
}) {
  const color =
    tone === 'danger'
      ? 'text-emergency'
      : tone === 'ok'
      ? 'text-success'
      : '';
  return (
    <div className="rounded-md border border-border bg-surface px-2.5 py-1.5">
      <div className="text-[9px] uppercase tracking-wider text-ink-muted text-mono">
        {k}
      </div>
      <div className={`text-sm text-mono mt-0.5 ${color}`}>{v}</div>
    </div>
  );
}

export function SentinelFeed() {
  const [logs, setLogs] = useState<AuditLog[]>([]);

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const res = await fetch(`https://casper-hack.onrender.com/logs?t=${Date.now()}`);
        if (res.ok) {
          const data = await res.json();
          setLogs(data);
        }
      } catch (err) {
        console.error("Failed to fetch logs:", err);
      }
    };
    fetchLogs();
    const t = setInterval(fetchLogs, 10000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-6 py-5 border-b border-border">
        <div className="flex items-center gap-2.5">
          <Cpu className="h-4 w-4 text-primary" />
          <div>
            <h2 className="text-lg font-semibold tracking-tight">
              AI Sentinel audit trail
            </h2>
            <p className="text-[13px] text-ink-muted mt-0.5">
              Cryptographically verified actions dispatched by the off-chain
              agent.
            </p>
          </div>
        </div>
        <span className="hidden sm:inline-flex items-center gap-1.5 text-[10px] text-mono uppercase tracking-wider text-ink-muted">
          <span className="h-1.5 w-1.5 rounded-full bg-success pulse-dot" />
          Streaming
        </span>
      </div>

      {!logs || logs.length === 0 ? (
        <div className="p-4 text-ink-muted text-sm text-mono text-center py-12">
          Awaiting Sentinel activity...
        </div>
      ) : (
        <ol>
          {logs.map((log, idx) => {
            const type = classifyAction(log.action, log.halted);
            const successStatus = log.status === 'Success' ? 'Success' : 'Failed';
            return (
              <li
                key={log.deployHash ?? idx}
                className="px-6 py-5 border-b border-border last:border-b-0 hover:bg-surface transition-colors"
              >
                <div className="flex gap-4">
                  <TypeIcon type={type} />
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[14px] font-medium">
                        {log.action}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 text-[10px] text-mono uppercase tracking-wider px-1.5 py-0.5 rounded border ${
                          successStatus === 'Success'
                            ? 'bg-[color-mix(in_oklab,var(--success)_10%,var(--card))] text-success border-success/30'
                            : 'bg-[color-mix(in_oklab,var(--destructive)_10%,var(--card))] text-destructive border-destructive/30'
                        }`}
                      >
                        {successStatus === 'Success' ? (
                          <CheckCircle2 className="h-3 w-3" />
                        ) : (
                          <XCircle className="h-3 w-3" />
                        )}
                        {successStatus}
                      </span>
                    </div>
                    <div className="mt-1 text-[11px] text-mono text-ink-muted">
                      {new Date(log.timestamp).toUTCString()}
                    </div>

                    <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
                      <Stat k="Premium Rate" v={`${log.rate}%`} />
                      <Stat
                        k="Halt Flag"
                        v={log.halted ? 'true' : 'false'}
                        tone={log.halted ? 'danger' : 'ok'}
                      />
                      <Stat k="Network Cost" v={log.cost} />
                    </div>

                    {log.deployHash && (
                      <a
                        href={`https://testnet.cspr.live/deploy/${log.deployHash}`}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-3 inline-flex items-start gap-1.5 text-[11px] text-mono text-primary hover:underline break-all"
                      >
                        <span className="text-ink-muted">Deploy Hash:</span>
                        <span>{log.deployHash}</span>
                        <ExternalLink className="h-3 w-3 shrink-0 mt-0.5" />
                      </a>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
