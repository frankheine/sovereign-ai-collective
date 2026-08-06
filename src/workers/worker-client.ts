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

// Utility to kill workers if RAM needs to be flushed for the Native Inference Engine
export function killMemoryWorkers() {
    console.log("[Worker Client] 🧹 Terminating background workers to free RAM...");
    embedWorkerInstance.terminate();
    rerankWorkerInstance.terminate();
    networkWorkerInstance.terminate();
    librarianWorkerInstance.terminate();
    ledgerWorkerInstance.terminate();
}