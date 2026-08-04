import * as Comlink from 'comlink';
import { pipeline, env } from '@huggingface/transformers';

// CRITICAL UPDATE: Enforce strict air-gapped execution with absolute paths.
env.allowRemoteModels = false;
env.allowLocalModels = true;

// FIX: Bind the path to the absolute origin of the local server
env.localModelPath = self.location.origin + '/models/';
env.useBrowserCache = false;

// Explicitly map the files so ONNX never requests the missing .jsep.wasm file
// FIX: Cast to 'any' to bypass TS2353 type definition mismatches in Transformers.js
env.backends.onnx.wasm!.wasmPaths = {
    'wasm': self.location.origin + '/wasm/ort-wasm.wasm',
    'ort-wasm-simd.wasm': self.location.origin + '/wasm/ort-wasm-simd.wasm',
    'ort-wasm-threaded.wasm': self.location.origin + '/wasm/ort-wasm-threaded.wasm',
    'ort-wasm-simd-threaded.wasm': self.location.origin + '/wasm/ort-wasm-simd-threaded.wasm',
    'ort-wasm-simd-threaded.jsep.mjs': self.location.origin + '/wasm/ort-wasm-simd-threaded.jsep.mjs',
    'ort-wasm-simd-threaded.jsep.wasm': self.location.origin + '/wasm/ort-wasm-simd-threaded.jsep.wasm'
} as any;

// Disable ONNX multi-threading to protect iOS RAM budget and prevent Vite MIME violations
env.backends.onnx.wasm!.numThreads = 1;
env.backends.onnx.wasm!.simd = true;
env.backends.onnx.wasm!.proxy = false;

class RerankWorker {
    private reranker: any = null;
    private initPromise: Promise<any> | null = null;

    async init(onProgress?: (msg: any) => void) {
        if (!this.reranker) {
            if (!this.initPromise) {
                if (onProgress) onProgress({ status: 'progress', log: '🧠 Initializing Cross-Encoder...' });

                // OPTIMIZATION: Author prefix 'jinaai/' removed. 
                // Explicitly targeting the local folder name.
                this.initPromise = pipeline('text-classification', 'jina-reranker-v1-tiny-en', {
                    device: 'wasm',
                    quantized: true,
                    local_files_only: true, // CRITICAL: Explicitly forces local routing
                    progress_callback: (data: any) => {
                        if (!onProgress) return;
                        if (data.status === 'progress' && typeof data.progress === 'number') {
                            onProgress({ status: 'progress', log: `Loading Cross-Encoder Weights: ${Math.round(data.progress)}%` });
                        } else {
                            onProgress({ status: 'progress', log: `Loading Cross-Encoder Weights: ${data.status || 'Downloading'}...` });
                        }
                    }
                } as any);
            }
            this.reranker = await this.initPromise;
        }
    }

    async rerank(query: string, candidates: any[], onProgress?: (msg: any) => void): Promise<any[]> {
        if (!this.reranker) await this.init(onProgress);

        if (onProgress) onProgress({ status: 'progress', log: '🧠 Cross-encoder reranking candidates...' });

        const reranked: any[] = [];
        for (const doc of candidates) {
            // Jina syntax: pass query and document as separate arguments, not as a nested array
            const result = await this.reranker(query, doc.text);
            reranked.push({ ...doc, rerankScore: result[0]?.score || 0 });
        }

        // Sort by highest confidence scores
        reranked.sort((a: any, b: any) => b.rerankScore - a.rerankScore);

        if (onProgress) onProgress({ status: 'progress', log: `✨ Reranked — top ${Math.min(5, reranked.length)} passages selected.` });

        // Return the full sorted array. The LangGraph orchestrator handles 
        // dynamic token budgeting (packing until 2048 tokens or < 0.40 score).
        return reranked;
    }
}

Comlink.expose(new RerankWorker());