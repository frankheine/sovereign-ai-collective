import * as Comlink from 'comlink';
import { pipeline, env } from '@huggingface/transformers';

const isProd = import.meta.env.PROD;
const PROXY_URL = 'https://sovereign-proxy.datacartel-collective.workers.dev';

if (isProd) {
    // 🌐 VERCEL MODE: Route through Cloudflare Proxy
    env.allowRemoteModels = true;
    env.allowLocalModels = false;
    env.useBrowserCache = true;
    env.remoteHost = PROXY_URL + '/models/';
    env.backends.onnx.wasm!.wasmPaths = PROXY_URL + '/wasm/';
} else {
    // 💻 LOCALHOST MODE: Mapped to local public/wasm directory
    env.allowRemoteModels = false;
    env.allowLocalModels = true;
    env.localModelPath = self.location.origin + '/models/';
    env.useBrowserCache = false;
    env.backends.onnx.wasm!.wasmPaths = self.location.origin + '/wasm/';
}

// Explicitly map files to prevent ONNX from phoning home for .jsep.wasm weights
env.backends.onnx.wasm!.wasmPaths = {
    'ort-wasm.wasm': self.location.origin + '/wasm/ort-wasm.wasm',
    'ort-wasm-simd.wasm': self.location.origin + '/wasm/ort-wasm-simd.wasm',
    'ort-wasm-threaded.wasm': self.location.origin + '/wasm/ort-wasm-threaded.wasm',
    'ort-wasm-simd-threaded.wasm': self.location.origin + '/wasm/ort-wasm-simd-threaded.wasm',
    'ort-wasm-simd-threaded.jsep.mjs': self.location.origin + '/wasm/ort-wasm-simd-threaded.jsep.mjs',
    'ort-wasm-simd-threaded.jsep.wasm': self.location.origin + '/wasm/ort-wasm-simd-threaded.jsep.wasm'
} as any;

// Protect RAM: Spawning multiple threads on mobile triggers kernel memory terminations (Safari Jetsam)
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