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

// Instantiate Web Workers
const dbWorkerInstance = new Worker(new URL('./db.worker.ts', import.meta.url), { type: 'module' });
const embedWorkerInstance = new Worker(new URL('./embedding.worker.ts', import.meta.url), { type: 'module' });
const rerankWorkerInstance = new Worker(new URL('./rerank.worker.ts', import.meta.url), { type: 'module' });
const networkWorkerInstance = new Worker(new URL('./network.worker.ts', import.meta.url), { type: 'module' });
const inferenceWorkerInstance = new Worker(new URL('./inference.worker.ts', import.meta.url), { type: 'module' });
const librarianWorkerInstance = new Worker(new URL('./librarian.worker.ts', import.meta.url), { type: 'module' });
const ledgerWorkerInstance = new Worker(new URL('./ledger.worker.ts', import.meta.url), { type: 'module' });

// Wrap with Comlink
export const dbWorker = Comlink.wrap<DBWorker>(dbWorkerInstance);
export const embedWorker = Comlink.wrap<EmbedWorker>(embedWorkerInstance);
export const rerankWorker = Comlink.wrap<RerankWorker>(rerankWorkerInstance);
export const networkWorker = Comlink.wrap<NetworkWorker>(networkWorkerInstance);
export const inferenceWorker = Comlink.wrap<InferenceWorker>(inferenceWorkerInstance);
export const librarianWorker = Comlink.wrap<LibrarianWorker>(librarianWorkerInstance);
export const ledgerWorker = Comlink.wrap<LedgerWorker>(ledgerWorkerInstance);

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

    // Nullify singleton instances to allow Garbage Collection to reclaim memory pages
    (embedWorkerInstance as any) = null;
    (rerankWorkerInstance as any) = null;
    (networkWorkerInstance as any) = null;
    (librarianWorkerInstance as any) = null;
    (ledgerWorkerInstance as any) = null;

    // Signal completion to orchestrator to safely proceed with WebGPU model mounting
    console.log("🧹 [Memory Governance] RAM Valley created. Proceeding to Model Boot.");
}