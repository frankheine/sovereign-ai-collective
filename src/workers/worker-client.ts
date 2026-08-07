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

// 1. PERSISTENT WORKERS (Keep as const)
const dbWorkerInstance = new Worker(new URL('./db.worker.ts', import.meta.url), { type: 'module' });
const inferenceWorkerInstance = new Worker(new URL('./inference.worker.ts', import.meta.url), { type: 'module' });

// 2. VOLATILE WORKERS (Change to let to allow GC reassignment)
let embedWorkerInstance: Worker | null = new Worker(new URL('./embedding.worker.ts', import.meta.url), { type: 'module' });
let rerankWorkerInstance: Worker | null = new Worker(new URL('./rerank.worker.ts', import.meta.url), { type: 'module' });
let networkWorkerInstance: Worker | null = new Worker(new URL('./network.worker.ts', import.meta.url), { type: 'module' });
let librarianWorkerInstance: Worker | null = new Worker(new URL('./librarian.worker.ts', import.meta.url), { type: 'module' });
let ledgerWorkerInstance: Worker | null = new Worker(new URL('./ledger.worker.ts', import.meta.url), { type: 'module' });

// 3. COMLINK WRAPPING (Cast volatile workers as Worker to satisfy Comlink types)
export const dbWorker = Comlink.wrap<DBWorker>(dbWorkerInstance);
export const inferenceWorker = Comlink.wrap<InferenceWorker>(inferenceWorkerInstance);

export const embedWorker = Comlink.wrap<EmbedWorker>(embedWorkerInstance as Worker);
export const rerankWorker = Comlink.wrap<RerankWorker>(rerankWorkerInstance as Worker);
export const networkWorker = Comlink.wrap<NetworkWorker>(networkWorkerInstance as Worker);
export const librarianWorker = Comlink.wrap<LibrarianWorker>(librarianWorkerInstance as Worker);
export const ledgerWorker = Comlink.wrap<LedgerWorker>(ledgerWorkerInstance as Worker);

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