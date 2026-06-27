// utils/casper.ts
const RPC_URL = "/api/rpc";

const RATE_KEY = "dictionary-cfc3ad3c6900546a465f389b1614686c228953d5bc7158c4ab14c996b91b38f7";
const HALT_KEY = "dictionary-3c73f93af4e9d3b49d6990152c0259ef92d10a44976af700ddec1504ed4126d9";

async function rpc(method: string, params: unknown[], id = 1) {
    const res = await fetch(RPC_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} from proxy`);
    const data = await res.json();
    if (data.error) throw new Error(`RPC error ${data.error.code}: ${data.error.message} | ${data.error.data ?? ''}`);
    return data.result;
}

export async function fetchVaultState(): Promise<{ rate: number; isHalted: boolean }> {
    try {
        const rootResult = await rpc('chain_get_state_root_hash', []);
        const stateRootHash: string = rootResult?.state_root_hash;
        if (!stateRootHash) return { rate: 5, isHalted: false };

        const rateResult = await rpc('state_get_item', [stateRootHash, RATE_KEY, []], 2);
        const rateBytes: string | undefined = rateResult?.stored_value?.CLValue?.bytes;
        const currentRate = rateBytes ? parseInt(rateBytes.slice(-2), 16) : 5;

        const haltResult = await rpc('state_get_item', [stateRootHash, HALT_KEY, []], 3);
        const haltBytes: string | undefined = haltResult?.stored_value?.CLValue?.bytes;
        const isHalted = haltBytes ? haltBytes.slice(-2) === '01' : false;

        return { rate: currentRate, isHalted };

    } catch (error) {
        console.error("Error reading live state keys:", error);
        return { rate: 5, isHalted: false };
    }
}