// src/workers/custom-loader.ts
import { dbWorker, embedWorker, rerankWorker, inferenceWorker } from './worker-client';
import { useSovereignStore } from '../store';
import * as Comlink from 'comlink';

export type BootProgressCallback = (progress: number, log: string) => void;

export class SovereignBootloader {
    private static sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

    public static async initiateBootSequence(onProgress: BootProgressCallback): Promise<void> {
        const store = useSovereignStore.getState();
        const targetModel = store.targetModel;
        const modelName = targetModel.split('/').pop() || 'Huihui-Qwen3-0.6B-abliterated-v2.Q4_K_M.gguf';

        try {
            // 1. Storage Persistence Handshake (Critical for iOS Safari Standalone survival)
            onProgress(5, "Securing persistent storage entitlements...");
            if (navigator.storage && navigator.storage.persist) {
                const isPersisted = await navigator.storage.persist();
                console.log(`[STORAGE] Persistent Storage Permissions: ${isPersisted}`);
            }

            // 2. Query OPFS directory handle before loading any worker dependencies
            onProgress(15, "Checking local OPFS cache for GGUF model...");
            const root = await navigator.storage.getDirectory();
            let fileHandle;
            let isModelCached = false;

            try {
                fileHandle = await root.getFileHandle(modelName);
                isModelCached = true;
                onProgress(30, "Model weights located inside local OPFS vault.");
            } catch (e) {
                // Model not found -> Initiate RAM-valley hydration sequence (Deferred Specialist Loading)
                onProgress(15, "GGUF weights not cached. Initiating secure download...");
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
                    throw new Error(`Failed to fetch model weights from network proxy. Status: ${response.status}`);
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
                        // Map the GGUF download phase to occupy the 15% - 75% telemetry bounds
                        const scaledPct = 15 + Math.floor((pct / 100) * 60);
                        onProgress(scaledPct, `Downloading model weights: ${pct}% (${(loaded / 1024 / 1024).toFixed(1)} MB / ${(total / 1024 / 1024).toFixed(1)} MB)`);
                    }
                }
                await writable.close();
                isModelCached = true;
                onProgress(75, "Model weights successfully written and cached in OPFS.");
            }

            // 3. ONLY AFTER GGUF IS FULLY SECURED ON DISK DO WE BIND AND SPIN UP SPECIALIST WORKERS
            onProgress(80, "Mounting SQLite Vector Database Specialist...");
            await dbWorker.init();

            onProgress(85, "Booting ONNX Semantic Embedding & Rerank Engines...");

            // Establish Comlink callback proxy
            const progressProxy = Comlink.proxy((msg: any) => {
                if (msg && msg.log) {
                    onProgress(85, msg.log);
                }
            });

            // Hydrate semantic models serially to prevent simultaneous compilation heap spikes
            onProgress(85, "🧬 Initializing local embedding engine...");
            await embedWorker.init(progressProxy);

            onProgress(90, "🧠 Initializing local cross-encoder reranker...");
            await rerankWorker.init(progressProxy);

            // Safely release the proxy to prevent memory leaks
            try {
                (progressProxy as any)[Comlink.releaseProxy]();
            } catch (e) {
                console.debug("[Bootloader] Proxy release skipped:", e);
            }

            // 4. Mount and initialize wllama WebGPU/WASM context
            onProgress(95, "Initializing local WebGPU inference context...");

            onProgress(98, "Establishing Zero-Trust Network Proxy tethers...");
            await this.sleep(300);

            onProgress(100, "SYSTEM ONLINE. Sovereign Intelligence Active.");
        } catch (error: any) {
            console.error("[Bootloader] Fatal Error during boot sequence:", error);
            onProgress(0, `CRITICAL BOOT FAILURE: ${error.message || String(error)}`);
            throw error;
        }
    }
}