// src/workers/rerank.worker.ts
import * as Comlink from 'comlink';
import { pipeline, env } from '@huggingface/transformers';

const isProd = import.meta.env.PROD;
const PROXY_URL = 'https://sovereign-proxy.datacartel-collective.workers.dev/';

if (isProd) {
    // 🌐 VERCEL MODE: Route through Cloudflare Proxy
    env.allowRemoteModels = true;
    env.allowLocalModels = false;
    env.useBrowserCache = true;
    env.remoteHost = PROXY_URL + '/models/';
    env.backends.onnx.wasm!.wasmPaths = PROXY_URL + '/wasm/';
} else {
    // 💻 LOCALHOST MODE: Strict Air-Gap to Hard Drive
    env.allowRemoteModels = false;
    env.allowLocalModels = true;
    env.localModelPath = self.location.origin + '/models/';
    env.useBrowserCache = false;
    env.backends.onnx.wasm!.wasmPaths = '/ort/';
}

// Protect iOS RAM
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

                this.initPromise = pipeline('text-classification', 'jina-reranker-v1-tiny-en', {
                    device: 'wasm',
                    dtype: 'q8',
                    local_files_only: !isProd, // True on localhost, False on Vercel
                    progress_callback: (data: any) => {
                        if (!onProgress) return;
                        if (data.status === 'progress' && typeof data.progress === 'number') {
                            onProgress({ status: 'progress', log: `Loading Cross-Encoder Weights: ${Math.round(data.progress)}%` });
                        } else {
                            onProgress({ status: 'progress', log: `Loading Cross-Encoder Weights: ${data.status || 'Downloading'}...` });
                        }
                    }
                });
            }
            this.reranker = await this.initPromise;
        }
    }

    async rerank(query: string, candidates: any[], onProgress?: (msg: any) => void): Promise<any[]> {
        if (!this.reranker) await this.init(onProgress);

        if (onProgress) onProgress({ status: 'progress', log: '🧠 Cross-encoder reranking candidates...' });

        const reranked: any[] = [];
        for (const doc of candidates) {
            const result = await this.reranker(query, doc.text);
            reranked.push({ ...doc, rerankScore: result[0]?.score || 0 });
        }

        reranked.sort((a: any, b: any) => b.rerankScore - a.rerankScore);

        if (onProgress) onProgress({ status: 'progress', log: `✨ Reranked — top ${Math.min(5, reranked.length)} passages selected.` });

        return reranked;
    }
}

Comlink.expose(new RerankWorker());