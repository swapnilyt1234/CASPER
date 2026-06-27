// app/api/rpc/route.ts
import { NextRequest, NextResponse } from 'next/server';

const RPC_URL = "https://node.testnet.casper.network/rpc";

export async function POST(req: NextRequest) {
    const body = await req.json();
    const response = await fetch(RPC_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify(body),
    });
    const data = await response.json();
    return NextResponse.json(data);
}