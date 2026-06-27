'use client';

import React, { useEffect, useState } from 'react';
import { fetchVaultState } from '@/utils/casper';

export default function ConsumerVaultPage() {
    const [vaultState, setVaultState] = useState({ rate: 5, isHalted: false });
    const [loadingNode, setLoadingNode] = useState(true);
    const [walletAddress, setWalletAddress] = useState<string | null>(null);
    const [isConnecting, setIsConnecting] = useState(false);
    const [isWalletInstalled, setIsWalletInstalled] = useState(false);
    const [userDeposits, setUserDeposits] = useState(0);
    const [depositAmount, setDepositAmount] = useState('');
    const [isTransacting, setIsTransacting] = useState(false);
    const [txHash, setTxHash] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    useEffect(() => {
        const savedDeposits = localStorage.getItem('derisk_deposits');
        if (savedDeposits) setUserDeposits(Number(savedDeposits));
    }, []);

    useEffect(() => {
        localStorage.setItem('derisk_deposits', userDeposits.toString());
    }, [userDeposits]);

    useEffect(() => {
        let attempts = 0;
        const checkWalletProvider = setInterval(async () => {
            attempts++;
            if (typeof window !== 'undefined' && (window as any).CasperWalletProvider) {
                setIsWalletInstalled(true);
                clearInterval(checkWalletProvider);
                try {
                    const provider = (window as any).CasperWalletProvider();
                    const isConnected = await provider.isConnected();
                    if (isConnected) {
                        const activeKey = await provider.getActivePublicKey();
                        if (activeKey) setWalletAddress(activeKey);
                    }
                } catch (err) {
                    console.error("Silent wallet session recovery failed:", err);
                }
                window.addEventListener('casper-wallet:activeKeyChanged', (event: any) => {
                    if (event?.detail?.activeKey) setWalletAddress(event.detail.activeKey);
                    else setWalletAddress(null);
                });
                window.addEventListener('casper-wallet:disconnected', () => setWalletAddress(null));
            }
            if (attempts >= 20) clearInterval(checkWalletProvider);
        }, 100);
        return () => clearInterval(checkWalletProvider);
    }, []);

    useEffect(() => {
        const loadState = async () => {
            try {
                const state = await fetchVaultState();
                setVaultState(state);
            } catch (err) {
                console.error("Failed fetching live node state:", err);
            } finally {
                setLoadingNode(false);
            }
        };
        loadState();
        const interval = setInterval(loadState, 10000);
        return () => clearInterval(interval);
    }, []);

    const connectWallet = async () => {
        if (!isWalletInstalled) {
            setErrorMessage("Casper Wallet extension not found!");
            return;
        }
        setIsConnecting(true);
        setErrorMessage(null);
        try {
            const provider = (window as any).CasperWalletProvider();
            const isConnected = await provider.requestConnection();
            if (isConnected) {
                const activeKey = await provider.getActivePublicKey();
                setWalletAddress(activeKey);
            }
        } catch (err: any) {
            setErrorMessage(err.message || "Connection refused by user.");
        } finally {
            setIsConnecting(false);
        }
    };

    const handleDeposit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!depositAmount || Number(depositAmount) <= 0 || !walletAddress) return;

        try {
            setIsLoading(true);
            setErrorMessage(null);
            setTxHash(null);

            const CasperSDK = await import('casper-js-sdk');
            const { CLPublicKey, DeployUtil, RuntimeArgs, CLValueBuilder, decodeBase16 } = CasperSDK;

            const provider = (window as any).CasperWalletProvider();
            const senderKey = CLPublicKey.fromHex(walletAddress);

            const amountInMotes = (Number(depositAmount) * 1_000_000_000).toString();
            const contractHashHex = "364fe8def07e59e7fb7d5266fa94a74b0a7e5fde6c1c40b0f6d81d265b58d658";
            const contractHashAsByteArray = decodeBase16(contractHashHex);

            const args = RuntimeArgs.fromMap({
                amount: CLValueBuilder.u512(amountInMotes)
            });

            const session = DeployUtil.ExecutableDeployItem.newStoredContractByHash(
                contractHashAsByteArray,
                "deposit",
                args
            );

            const payment = DeployUtil.standardPayment(5_000_000_000);
            const deployParams = new DeployUtil.DeployParams(senderKey, "casper-test", 1, 1800000);
            const deploy = DeployUtil.makeDeploy(deployParams, session, payment);
            const deployJson = DeployUtil.deployToJson(deploy);

            const signResult = await provider.sign(JSON.stringify(deployJson), walletAddress);

            if (signResult.cancelled) {
                throw new Error("Transaction signature rejected by user.");
            }

            setErrorMessage("Broadcasting to Casper Testnet via Proxy...");

            let signedDeploy;
            const deployData = signResult.deploy || signResult;
            const parsedData = typeof deployData === 'string' ? JSON.parse(deployData) : deployData;
            const parseResult = DeployUtil.deployFromJson(parsedData);

            if (parseResult.ok) {
                signedDeploy = parseResult.unwrap();
            } else if (signResult.signature || signResult.signatureHex) {
                let sigBytes;
                if (signResult.signature instanceof Uint8Array) {
                    sigBytes = signResult.signature;
                } else if (signResult.signature) {
                    sigBytes = Uint8Array.from(Object.values(signResult.signature));
                } else {
                    sigBytes = decodeBase16(signResult.signatureHex);
                }
                signedDeploy = DeployUtil.setSignature(deploy, sigBytes, senderKey);
            } else {
                throw new Error("Unrecognized signature format returned from Casper Wallet.");
            }

            const client = new CasperSDK.CasperClient('/api/rpc');
            const realTxHash = await client.putDeploy(signedDeploy);
            setTxHash(realTxHash);

            setErrorMessage("Transaction broadcasted! Waiting for block confirmation...");

            const maxAttempts = 60;
            const pollIntervalMs = 5000;
            let isConfirmed = false;

            const deployHashHex: string = typeof realTxHash === 'string'
                ? realTxHash.replace(/^0x/, '')
                : (realTxHash as any).toString();

            console.log(`[Poll] Starting to poll deploy: ${deployHashHex}`);

            for (let attempt = 1; attempt <= maxAttempts; attempt++) {
                try {
                    const response = await fetch('/api/rpc', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Cache-Control': 'no-store',
                        },
                        cache: 'no-store',
                        body: JSON.stringify({
                            jsonrpc: "2.0",
                            id: attempt,
                            method: "info_get_deploy",
                            params: [deployHashHex]  // ← array, not object
                        })
                    });

                    if (!response.ok) {
                        console.warn(`[Poll] Attempt ${attempt}: HTTP ${response.status}`);
                    } else {
                        const rpcData = await response.json();
                        const executionInfo = rpcData.result?.execution_info;

                        console.log(`[Poll] Attempt ${attempt}: execution_info present = ${!!executionInfo}`);

                        if (executionInfo?.execution_result) {
                            const v2 = executionInfo.execution_result.Version2;
                            if (v2) {
                                if (v2.error_message === null) {
                                    console.log(`[Poll] Confirmed on attempt ${attempt}!`);
                                    isConfirmed = true;
                                    break;
                                } else {
                                    throw new Error(`Smart contract reverted: ${v2.error_message}`);
                                }
                            }
                        }
                    }
                } catch (pollErr: any) {
                    if (pollErr.message?.includes("Smart contract reverted")) throw pollErr;
                    console.warn(`[Poll] Attempt ${attempt} error:`, pollErr.message);
                }

                await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
            }

            if (!isConfirmed) {
                throw new Error(
                    `Transaction not confirmed after ${maxAttempts} attempts. ` +
                    `Check CSPR.live for deploy: ${deployHashHex}`
                );
            }

            // Success: refresh vault state from chain, update local deposit counter
            const updatedState = await fetchVaultState();
            setVaultState(updatedState);
            setUserDeposits(prev => prev + Number(depositAmount));
            setDepositAmount('');
            setErrorMessage(null);

        } catch (err: any) {
            setErrorMessage(err.message || "An unexpected error occurred.");
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    };

    const disconnectWallet = async () => {
        try {
            if ((window as any).CasperWalletProvider) {
                const provider = (window as any).CasperWalletProvider();
                await provider.disconnectFromSite();
            }
        } catch (e) { }
        setWalletAddress(null);
        setUserDeposits(0);
        setTxHash(null);
        localStorage.removeItem('derisk_deposits');
    };

    return (
        <div className="min-h-screen bg-slate-950 text-slate-50 font-sans selection:bg-teal-500 selection:text-slate-950">
            <header className="border-b border-slate-900 bg-slate-950/80 backdrop-blur sticky top-0 z-40">
                <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-teal-400 to-indigo-600 flex items-center justify-center">
                            <span className="text-slate-950 font-black text-sm">DR</span>
                        </div>
                        <span className="text-lg font-bold text-white">DeRisk Public Vault</span>
                    </div>
                    {walletAddress ? (
                        <div className="flex items-center space-x-4">
                            <div className="px-4 py-2 bg-slate-900 border border-slate-800 rounded-lg text-sm font-mono text-teal-400">
                                {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
                            </div>
                            <button
                                onClick={disconnectWallet}
                                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium rounded-lg transition-colors"
                            >
                                Disconnect
                            </button>
                        </div>
                    ) : (
                        <button
                            onClick={connectWallet}
                            disabled={isConnecting}
                            className="px-5 py-2 bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold rounded-lg transition-colors disabled:opacity-50"
                        >
                            {!isWalletInstalled ? "Install Casper Wallet" : isConnecting ? "Connecting..." : "Connect Wallet"}
                        </button>
                    )}
                </div>
            </header>

            <main className="max-w-6xl mx-auto px-4 py-12 space-y-12">
                <div className="text-center space-y-4 max-w-2xl mx-auto">
                    <h1 className="text-4xl font-black text-white">Earn Yield. Protected by AI.</h1>
                    <p className="text-slate-400 text-lg">
                        Deposit your CSPR to underwrite the network. Our autonomous AI sentinel monitors global volatility 24/7, halting deposits instantly to protect your liquidity during market crashes.
                    </p>
                </div>

                {errorMessage && (
                    <div className="max-w-md mx-auto p-4 bg-rose-500/10 border border-rose-500/20 rounded-lg text-sm text-rose-400 text-center">
                        {errorMessage}
                    </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-6">
                        <h2 className="text-xl font-bold text-white border-b border-slate-900 pb-2">Live Protocol Data</h2>
                        <div className="bg-slate-900/40 p-6 rounded-xl border border-slate-900">
                            <p className="text-xs text-slate-500 uppercase tracking-wide font-semibold">Current Premium Yield</p>
                            <h3 className="text-5xl font-black text-teal-400 mt-2 font-mono">
                                {loadingNode ? "..." : `${vaultState.rate}%`}
                            </h3>
                            <p className="text-sm text-slate-400 mt-2">Dynamic rate managed by DeRisk Agent.</p>
                        </div>
                        <div className={`p-6 rounded-xl border ${vaultState.isHalted ? 'bg-rose-500/10 border-rose-500/30' : 'bg-slate-900/40 border-slate-900'}`}>
                            <p className="text-xs text-slate-500 uppercase tracking-wide font-semibold">Vault Security Status</p>
                            <div className="flex items-center space-x-3 mt-3">
                                <span className={`w-4 h-4 rounded-full ${vaultState.isHalted ? 'bg-rose-500 animate-pulse' : 'bg-emerald-500'}`} />
                                <h3 className={`text-2xl font-bold ${vaultState.isHalted ? 'text-rose-400' : 'text-white'}`}>
                                    {loadingNode ? "Syncing..." : vaultState.isHalted ? "EMERGENCY HALTED" : "OPEN FOR DEPOSITS"}
                                </h3>
                            </div>
                            {vaultState.isHalted && (
                                <p className="text-sm text-rose-300 mt-3 font-medium">
                                    The AI Agent has detected extreme market volatility. The contract is currently locked to protect LP funds.
                                </p>
                            )}
                        </div>
                    </div>

                    <div className="bg-slate-900/60 p-8 rounded-xl border border-slate-800 shadow-2xl flex flex-col justify-between">
                        <div>
                            <h2 className="text-xl font-bold text-white border-b border-slate-800 pb-2 mb-6">Your Position</h2>
                            <div className="mb-8">
                                <p className="text-sm text-slate-400">Total Deposited</p>
                                <h3 className="text-4xl font-mono text-white mt-1">{userDeposits.toLocaleString()} CSPR</h3>
                            </div>
                            <form onSubmit={handleDeposit} className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-400 mb-2">Deposit Amount (CSPR)</label>
                                    <input
                                        type="number"
                                        value={depositAmount}
                                        onChange={(e) => setDepositAmount(e.target.value)}
                                        disabled={!walletAddress || vaultState.isHalted || isLoading}
                                        placeholder="e.g. 5000"
                                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-3 text-white placeholder-slate-600 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 disabled:opacity-50"
                                    />
                                </div>
                                <button
                                    type="submit"
                                    disabled={!walletAddress || vaultState.isHalted || isLoading || !depositAmount}
                                    className={`w-full py-4 rounded-lg font-bold text-lg transition-all ${!walletAddress ? 'bg-slate-800 text-slate-500' :
                                        vaultState.isHalted ? 'bg-rose-500/20 text-rose-500 border border-rose-500/50 cursor-not-allowed' :
                                            isLoading ? 'bg-teal-700 text-slate-200 cursor-not-allowed' :
                                                'bg-teal-500 hover:bg-teal-400 text-slate-950'
                                        }`}
                                >
                                    {!walletAddress ? "Connect Wallet to Deposit" :
                                        vaultState.isHalted ? "Vault Locked by AI" :
                                            isLoading ? "Processing..." :
                                                "Deposit Liquidity"}
                                </button>
                            </form>
                        </div>
                        {txHash && (
                            <div className="mt-6 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-sm text-emerald-400 font-mono text-center break-all flex flex-col items-center gap-2">
                                <span>Transaction Live!</span>

                                href={`https://testnet.cspr.live/deploy/${txHash}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-teal-400 hover:text-teal-300 underline font-bold"
                                >
                                View on CSPR.live
                            </a>
                            </div>
                        )}
                </div>
        </div>
            </main >
        </div >
    );
}