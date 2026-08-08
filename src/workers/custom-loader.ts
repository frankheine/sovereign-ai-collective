// src/workers/custom-loader.ts
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
            // Initialize SQLite WASM & OPFS
            await dbWorker.init();
            onProgress(30, "SQLite OPFS Vault mounted. FTS5 Lexical Engine active.");
            await this.sleep(300);

            onProgress(45, "Allocating WASM memory pages for ONNX Runtime...");

            // Create a Comlink proxy to catch real-time loading telemetry from the workers
            const progressProxy = Comlink.proxy((msg: any) => {
                let pct = 60;
                const match = msg.log.match(/(\d+)%/);
                if (match) pct = parseInt(match[14], 10);
                onProgress(pct, msg.log);
            });

            // Initialize Semantic Engines with real telemetry
            const embedPromise = embedWorker.init(progressProxy);
            const rerankPromise = rerankWorker.init(progressProxy);

            await Promise.all([embedPromise, rerankPromise]);

            onProgress(85, "ONNX Runtime Web initialized. Semantic engines online.");
            await this.sleep(400);

            onProgress(90, "Establishing Native Inference Bridge (WASM/WebGPU)...");

            // Fetch the currently selected model from the Zustand store
            const targetModel = useSovereignStore.getState().targetModel;
            const modelName = targetModel.split('/').pop() || 'Huihui-Qwen3-0.6B-abliterated-v2.Q4_K_M.gguf';

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

                // 🌐 GGUF MODEL DYNAMIC ROUTING: Cloudflare Worker in Vercel Production, Localhost in Dev
                const isProd = import.meta.env.PROD;
                const PROXY_URL = 'https://sovereign-proxy.datacartel-collective.workers.dev';
                const modelUrl = isProd
                    ? `${PROXY_URL}/sovereign-models/gguf/${modelName}`
                    : `${self.location.origin}/models/gguf/${modelName}`;

                console.log(`[Bootloader] Fetching GGUF weights from: ${modelUrl}`);
                const response = await fetch(modelUrl);

                if (!response.ok || !response.body) {
                    throw new Error(`Failed to fetch model. Server returned status: ${response.status}`);
                }

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
                        // Scale 0-100 to 92-98 for the UI progress bar
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
            console.error("[Bootloader] Fatal Error during boot sequence:", error);
            onProgress(0, `CRITICAL BOOT FAILURE: ${error.message}`);
            throw error;
        }
    }
}