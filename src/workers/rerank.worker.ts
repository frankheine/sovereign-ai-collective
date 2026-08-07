import * as Comlink from 'comlink';
import { pipeline, env } from '@huggingface/transformers';

/**
 * ENVIRONMENT GOVERNANCE:
 * Calibrates Transformers.js for air-gapped execution.
 * Casting to 'any' on wasmPaths is mandatory to bypass August 2026 TS2353 type errors.
 */
const isProd = import.meta.env.PROD;
const PROXY_URL = 'https://sovereign-proxy.datacartel-collective.workers.dev/';

if (isProd) {
    env.allowRemoteModels = true;
    env.allowLocalModels = false;
    env.useBrowserCache = true;
    env.remoteHost = PROXY_URL;
    env.remotePathTemplate = '{model}/';
    // FIX: Type-casted assignment to bypass TS2353 type definition mismatches
    (env.backends.onnx.wasm as any).wasmPaths = PROXY_URL + 'wasm/';
} else {
    env.allowRemoteModels = false;
    env.allowLocalModels = true;
    env.localModelPath = self.location.origin + '/models/';
    env.useBrowserCache = false;
    // FIX: Standardized local path mapping for Transformers.js v3
    (env.backends.onnx.wasm as any).wasmPaths = self.location.origin + '/wasm/';
}

// CRITICAL iOS FIX: Clamp threads to 1 to prevent WASM heap multiplication
env.backends.onnx.wasm!.numThreads = 1;

/**
 * RERANKER SPECIALIST (COMLINK NATIVE):
 * Replaces the legacy 164-line manual IPC file.
 * Eliminates self.onmessage and manual port closing logic.
 */
class RerankWorker {
    private reranker: any = null;
    private initPromise: Promise<any> | null = null;

    async init(onProgress?: (msg: any) => void): Promise<void> {
        if (this.reranker) return;

        if (!this.initPromise) {
            if (onProgress) onProgress({ status: 'progress', log: '🧠 Initializing Jina Tiny Reranker (CPU)...' });

            // FIX: Using Jina-v1-tiny (33MB) to protect the 1.8GB iOS Jetsam buffer
            this.initPromise = pipeline('text-classification', 'jinaai/jina-reranker-v1-tiny-en', {
                device: 'wasm',
                quantized: true,
                progress_callback: (data: any) => {
                    if (!onProgress) return;
                    if (data.status === 'progress' && typeof data.progress === 'number') {
                        onProgress({ status: 'progress', log: `Loading Reranker Weights: ${Math.round(data.progress)}%` });
                    } else {
                        onProgress({ status: 'progress', log: `Reranker: ${data.status || 'Processing'}...` });
                    }
                }
            } as any);
        }
        this.reranker = await this.initPromise;
    }

    async rerank(query: string, candidates: any[], onProgress?: (msg: any) => void): Promise<any[]> {
        if (!this.reranker) await this.init(onProgress);

        if (onProgress) onProgress({ status: 'progress', log: `✨ Reranking ${candidates.length} candidates...` });

        const results = [];
        for (const doc of candidates) {
            // Cross-Encoder Scoring: [query, document_text]
            const output = await this.reranker([query, doc.text]);
            // Extract relevance score from the sequence classification head
            const score = output?.score ?? 0;
            results.push({ ...doc, relevanceScore: score });
        }

        // Sort descending by relevance score (highest relevance first)
        return results.sort((a, b) => b.relevanceScore - a.relevanceScore);
    }
}

// Expose the class to the worker-client.ts wrapper via Comlink mesh
Comlink.expose(new RerankWorker());

// FIX TS2300: Forces TypeScript to treat this file as an isolated module
export { };