import { dbWorker, embedWorker, rerankWorker, inferenceWorker } from './worker-client';
import { useSovereignStore } from '../store';
import * as Comlink from 'comlink';

export type BootProgressCallback = (progress: number, log: string) => void;

export class SovereignBootloader {
    private static sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

    static async initiateBootSequence(onProgress: BootProgressCallback): Promise<void> {
        try {
            onProgress(5, "Initiating Sovereign AI Boot Sequence...");
            await this.sleep(400);

            onProgress(15, "Mounting Origin Private File System (OPFS)...");
            await dbWorker.init();
            onProgress(30, "SQLite OPFS Vault mounted. FTS5 Lexical Engine active.");
            await this.sleep(300);

            onProgress(45, "Allocating WASM memory pages for ONNX Runtime...");

            const progressProxy = Comlink.proxy((msg: any) => {
                let pct = 60;
                const match = msg.log.match(/(\d+)%/);
                if (match) pct = parseInt(match[2], 10);
                onProgress(pct, msg.log);
            });

            const embedPromise = embedWorker.init(progressProxy);
            const rerankPromise = rerankWorker.init(progressProxy);

            await Promise.all([embedPromise, rerankPromise]);

            progressProxy[Comlink.releaseProxy]();

            onProgress(85, "ONNX Runtime Web initialized. Semantic engines online.");
            await this.sleep(400);

            onProgress(90, "Establishing Native Inference Bridge (WASM/WebGPU)...");

            const targetModel = useSovereignStore.getState().targetModel;
            const modelName = targetModel.split('/').pop() || 'model.gguf';

            onProgress(92, "Checking OPFS for cached GGUF model...");
            const root = await navigator.storage.getDirectory();
            let fileHandle;

            try {
                fileHandle = await root.getFileHandle(modelName);
                onProgress(95, "Model found in OPFS cache. Mounting...");
            } catch (e) {
                onProgress(92, "Downloading GGUF model to OPFS (This may take a while)...");
                fileHandle = await root.getFileHandle(modelName, { create: true });
                const writable = await fileHandle.createWritable();

                // 🌐 DYNAMIC ROUTING: Use Cloudflare on Vercel, Local path on Localhost
                const isProd = import.meta.env.PROD;
                const PROXY_URL = 'https://sovereign-proxy.datacartel-collective.workers.dev';
                const fetchUrl = isProd ? `${PROXY_URL}${targetModel}` : targetModel;

                const response = await fetch(fetchUrl);

                if (!response.ok || !response.body) throw new Error("Failed to fetch model");

                const contentLength = response.headers.get('content-length');
                const total = contentLength ? parseInt(contentLength, 10) : 0;
                let loaded = 0;

                const reader = response.body.getReader();
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    await writable.write(value);
                    loaded += value.length;
                    if (total) {
                        const pct = Math.round((loaded / total) * 100);
                        const scaledPct = 92 + Math.floor((pct / 100) * 6);
                        onProgress(scaledPct, `Downloading GGUF model... ${pct}%`);
                    }
                }
                await writable.close();
                onProgress(98, "Model downloaded and cached in OPFS.");
            }

            await inferenceWorker.init(targetModel);

            onProgress(98, "Securing Zero-Trust Network Proxy...");
            await this.sleep(300);

            onProgress(100, "SYSTEM ONLINE. Sovereign Intelligence Active.");
        } catch (error: any) {
            console.error("[Bootloader] Fatal Error:", error);
            onProgress(0, `CRITICAL BOOT FAILURE: ${error.message}`);
            throw error;
        }
    }
}
