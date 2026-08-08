import * as Comlink from 'comlink';
import { pipeline, env } from '@huggingface/transformers';

// AUTOMATIC ENVIRONMENT DETECTION (Localhost vs Vercel Router)
const isLocal = self.location.hostname === 'localhost' ||
    self.location.hostname === '127.0.0.1' ||
    self.location.hostname.endsWith('.local');

const PROXY_URL = 'https://sovereign-proxy.datacartel-collective.workers.dev/';
const wasmBase = isLocal ? (self.location.origin + '/wasm/') : (PROXY_URL + 'wasm/');

if (isLocal) {
    // 💻 LOCALHOST MODE: Air-gapped offline loading from physical public directory
    env.allowRemoteModels = false;
    env.allowLocalModels = true;
    env.localModelPath = self.location.origin + '/models/';
    env.useBrowserCache = false;
} else {
    // 🌐 VERCEL PRODUCTION MODE: Route weight downloads anonymously through Cloudflare Proxy
    env.allowRemoteModels = true;
    env.allowLocalModels = false;
    env.useBrowserCache = true;
    env.remoteHost = PROXY_URL;
    env.remotePathTemplate = '{model}/';
}

// Explicitly map all WebAssembly asset files to prevent ONNX from phoning home for CDN runtimes
(env.backends.onnx.wasm as any).wasmPaths = {
    'ort-wasm.wasm': wasmBase + 'ort-wasm.wasm',
    'ort-wasm-simd.wasm': wasmBase + 'ort-wasm-simd.wasm',
    'ort-wasm-threaded.wasm': wasmBase + 'ort-wasm-threaded.wasm',
    'ort-wasm-simd-threaded.wasm': wasmBase + 'ort-wasm-simd-threaded.wasm',
    'ort-wasm-simd-threaded.jsep.mjs': wasmBase + 'ort-wasm-simd-threaded.jsep.mjs',
    'ort-wasm-simd-threaded.jsep.wasm': wasmBase + 'ort-wasm-simd-threaded.jsep.wasm'
};

// Protect mobile memory ceiling: Clamp active ONNX thread pool size to 1
env.backends.onnx.wasm!.numThreads = 1;
env.backends.onnx.wasm!.simd = true;
env.backends.onnx.wasm!.proxy = false;

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