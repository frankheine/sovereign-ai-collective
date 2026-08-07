// src/workers/embedding.worker.ts
import * as Comlink from 'comlink';
import { pipeline, env } from '@huggingface/transformers';

const isProd = import.meta.env.PROD;
const PROXY_URL = 'https://sovereign-proxy.datacartel-collective.workers.dev/';

// CRITICAL iOS FIX: Multi-threading multiples WASM memory allocation per thread.
// Spawning >1 thread will instantly breach the 1.8GB iOS Jetsam limit.
env.allowRemoteModels = false;
env.allowLocalModels = true;
env.localModelPath = '/models/';
env.useBrowserCache = true;
(env.backends.onnx.wasm as any).wasmPaths = self.location.origin + '/wasm/';
env.backends.onnx.wasm!.numThreads = 1;
env.backends.onnx.wasm!.simd = true;
env.backends.onnx.wasm!.proxy = false;

class EmbeddingWorker {
    private extractor: any = null;
    private initPromise: Promise<any> | null = null;

    async init(onProgress?: (msg: any) => void) {
        if (!this.extractor) {
            if (!this.initPromise) {
                if (onProgress) onProgress({ status: 'progress', log: '🧬 Initializing embedding model...' });

                this.initPromise = pipeline('feature-extraction', 'all-MiniLM-L6-v2', {
                    device: 'wasm',
                    dtype: 'q8',
                    local_files_only: !isProd, // True on localhost, False on Vercel
                    progress_callback: (data: any) => {
                        if (!onProgress) return;
                        if (data.status === 'progress' && typeof data.progress === 'number') {
                            onProgress({ status: 'progress', log: `Loading Embedding Weights: ${Math.round(data.progress)}%` });
                        } else {
                            onProgress({ status: 'progress', log: `Loading Embedding Weights: ${data.status || 'Downloading'}...` });
                        }
                    }
                });
            }
            this.extractor = await this.initPromise;
            if (onProgress) onProgress({ status: 'progress', log: '✅ Embedding model ready.' });
        }
    }

    async embed(text: string, onProgress?: (msg: any) => void): Promise<number[]> {
        if (!this.extractor) await this.init(onProgress);
        if (!text) return [];

        if (onProgress) onProgress({ status: 'progress', log: '🔢 Running inference...' });

        const output = await this.extractor(text, { pooling: 'mean', normalize: true });
        return Array.from(output.data);
    }
}

Comlink.expose(new EmbeddingWorker());