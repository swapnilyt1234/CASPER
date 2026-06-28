'use server';

import { unstable_noStore as noStore } from 'next/cache';

export interface AuditLog {
    deployHash: string;
    timestamp: string;
    action: string;
    rate: number;
    halted: boolean;
    status: 'Success' | 'Pending' | 'Failure';
    cost: string;
}

export async function fetchAuditTrail(): Promise<AuditLog[]> {
    noStore(); // Disable Next.js caching
    try {
        const response = await fetch('https://casper-hack.onrender.com/logs', { 
            cache: 'no-store' 
        });
        if (!response.ok) return [];
        return await response.json();
    } catch (error) {
        console.error("Error fetching audit logs from Render:", error);
        return [];
    }
}