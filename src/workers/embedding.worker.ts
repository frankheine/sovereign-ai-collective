import * as Comlink from 'comlink';
import { pipeline, env } from '@huggingface/transformers';

const isProd = import.meta.env.PROD;

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


class EmbeddingWorker {
    private extractor: any = null;
    private initPromise: Promise<any> | null = null;

    async init(onProgress?: any): Promise<void> {
        if (!this.extractor) {
            if (!this.initPromise) {
                if (onProgress) onProgress({ status: 'progress', log: '🧬 Initializing embedding model...' });
                this.initPromise = pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
                    device: 'wasm',
                    quantized: true,
                    progress_callback: (data: any) => {
                        if (!onProgress) return;
                        if (data.status === 'progress' && typeof data.progress === 'number') {
                            onProgress({ status: 'progress', log: `Loading Embedding Weights: ${Math.round(data.progress)}%` });
                        } else {
                            onProgress({ status: 'progress', log: `Loading Embedding Weights: ${data.status || 'Downloading'}...` });
                        }
                    }
                } as any);
            }
            this.extractor = await this.initPromise;
            if (onProgress) onProgress({ status: 'progress', log: '✅ Embedding model ready.' });
        }
    }

    async embed(text: string, onProgress?: any): Promise<number[]> {
        if (!this.extractor) await this.init(onProgress);
        const output = await this.extractor(text, { pooling: 'mean', normalize: true });
        return Array.from(output.data);
    }
}

Comlink.expose(new EmbeddingWorker());