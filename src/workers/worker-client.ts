// src/workers/worker-client.ts
import * as Comlink from 'comlink';

export interface DBWorker {
    init(): Promise<void>;
    insertChunk(text: string, embedding: number[], metadata?: any): Promise<void>;
    hybridSearch(queryText: string, queryVector: number[], limit?: number): Promise<any[]>;
    getAllVectors(): Promise<{ id: number, vector: number[] }[]>;
    createClusterTables(clusters: { clusterId: number, rowIds: number[] }[]): Promise<void>;
    updateVectorMetadata(updates: { id: number, metadata: any }[]): Promise<void>;
}

export interface EmbedWorker {
    init(onProgress?: any): Promise<void>;
    embed(text: string, onProgress?: any): Promise<number[]>;
}

export interface RerankWorker {
    init(onProgress?: any): Promise<void>;
    rerank(query: string, candidates: any[], onProgress?: any): Promise<any[]>;
}

export interface NetworkWorker {
    search(query: string): Promise<string[]>;
}

export interface InferenceWorker {
    init(modelPath: string): Promise<void>;
    generate(prompt: string, context: string, systemPrompt: string, onProgress: any): Promise<string>;
}

export interface LibrarianWorker {
    runClusteringOptimization(vectors: { id: number, vector: number[] }[]): Promise<{ clusterId: number, rowIds: number[] }[]>;
}

export interface LedgerWorker {
    runRecursiveHousekeeping(vectors: { id: number, vector: number[] }[]): Promise<{ id: number, metadata: any }[]>;
}

// 1. PERSISTENT WORKERS
const dbWorkerInstance = new Worker(new URL('./db.worker.ts', import.meta.url), { type: 'module' });
let inferenceWorkerInstance = new Worker(new URL('./inference.worker.ts', import.meta.url), { type: 'module' });

// 2. VOLATILE WORKERS (Change to let to allow GC reassignment)
let embedWorkerInstance: Worker | null = new Worker(new URL('./embedding.worker.ts', import.meta.url), { type: 'module' });
let rerankWorkerInstance: Worker | null = new Worker(new URL('./rerank.worker.ts', import.meta.url), { type: 'module' });
let networkWorkerInstance: Worker | null = new Worker(new URL('./network.worker.ts', import.meta.url), { type: 'module' });
let librarianWorkerInstance: Worker | null = new Worker(new URL('./librarian.worker.ts', import.meta.url), { type: 'module' });
let ledgerWorkerInstance: Worker | null = new Worker(new URL('./ledger.worker.ts', import.meta.url), { type: 'module' });

// 3. COMLINK WRAPPING (Export as let so live bindings update when revived)
export const dbWorker = Comlink.wrap<DBWorker>(dbWorkerInstance);
export let inferenceWorker = Comlink.wrap<InferenceWorker>(inferenceWorkerInstance);

export let embedWorker = Comlink.wrap<EmbedWorker>(embedWorkerInstance as Worker);
export let rerankWorker = Comlink.wrap<RerankWorker>(rerankWorkerInstance as Worker);
export let networkWorker = Comlink.wrap<NetworkWorker>(networkWorkerInstance as Worker);
export let librarianWorker = Comlink.wrap<LibrarianWorker>(librarianWorkerInstance as Worker);
export let ledgerWorker = Comlink.wrap<LedgerWorker>(ledgerWorkerInstance as Worker);

export async function rebootInferenceWorker(): Promise<void> {
    console.warn("🔄 [Worker Client] Hard rebooting Inference Worker to clear VRAM/Hangs...");
    inferenceWorkerInstance.terminate();
    inferenceWorkerInstance = new Worker(new URL('./inference.worker.ts', import.meta.url), { type: 'module' });
    inferenceWorker = Comlink.wrap<InferenceWorker>(inferenceWorkerInstance);
}

/**
 * CRITICAL MEMORY GOVERNANCE:
 * Terminates all semantic and background specialists to create a "RAM valley."
 * Mandatory on iOS to accommodate the GGUF model and KV-cache within the 1.8GB hard cap.
 */
export async function killMemoryWorkers(): Promise<void> {
    console.log("🧹 [Memory Governance] Initiating RAM Valley Flush...");

    const workersToKill = [
        { name: 'Embedding', instance: embedWorkerInstance },
        { name: 'Reranker', instance: rerankWorkerInstance },
        { name: 'Network', instance: networkWorkerInstance },
        { name: 'Librarian', instance: librarianWorkerInstance },
        { name: 'Ledger', instance: ledgerWorkerInstance }
    ];

    for (const worker of workersToKill) {
        if (worker.instance) {
            console.log(`🧹 [Memory Governance] Terminating ${worker.name} Specialist...`);
            worker.instance.terminate();
        }
    }

    // 4. CLEAN REASSIGNMENT (No 'as any' required, satisfying the bundler)
    embedWorkerInstance = null;
    rerankWorkerInstance = null;
    networkWorkerInstance = null;
    librarianWorkerInstance = null;
    ledgerWorkerInstance = null;

    console.log("🧹 [Memory Governance] RAM Valley created. Proceeding to Model Boot.");
}

/**
 * CRITICAL MEMORY GOVERNANCE:
 * Revives the semantic specialists after LLM generation completes so Perfect Recall can function.
 */
export async function reviveMemoryWorkers(): Promise<void> {
    console.log("🌱 [Memory Governance] Reviving Memory Specialists...");
    
    if (!embedWorkerInstance) {
        embedWorkerInstance = new Worker(new URL('./embedding.worker.ts', import.meta.url), { type: 'module' });
        embedWorker = Comlink.wrap<EmbedWorker>(embedWorkerInstance);
        await embedWorker.init().catch(e => console.warn("Embed init failed during revival", e));
    }
    if (!rerankWorkerInstance) {
        rerankWorkerInstance = new Worker(new URL('./rerank.worker.ts', import.meta.url), { type: 'module' });
        rerankWorker = Comlink.wrap<RerankWorker>(rerankWorkerInstance);
        await rerankWorker.init().catch(e => console.warn("Rerank init failed during revival", e));
    }
    if (!networkWorkerInstance) {
        networkWorkerInstance = new Worker(new URL('./network.worker.ts', import.meta.url), { type: 'module' });
        networkWorker = Comlink.wrap<NetworkWorker>(networkWorkerInstance);
    }
    if (!librarianWorkerInstance) {
        librarianWorkerInstance = new Worker(new URL('./librarian.worker.ts', import.meta.url), { type: 'module' });
        librarianWorker = Comlink.wrap<LibrarianWorker>(librarianWorkerInstance);
    }
    if (!ledgerWorkerInstance) {
        ledgerWorkerInstance = new Worker(new URL('./ledger.worker.ts', import.meta.url), { type: 'module' });
        ledgerWorker = Comlink.wrap<LedgerWorker>(ledgerWorkerInstance);
    }
    
    console.log("🌱 [Memory Governance] Specialists revived and ready.");
}