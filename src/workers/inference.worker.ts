// src/workers/inference.worker.ts

// SHIM DOCUMENT TO BYPASS THE GLOBAL 'document' REFERENCE ERROR IN ngxson/wllama'S ESM BUNDLE
if (typeof (self as any).document === 'undefined') {
    (self as any).document = {
        currentScript: null
    } as any;
}

import * as Comlink from 'comlink';

class InferenceWorker {
    private isInitialized = false;
    private modelPath = "";
    private wllama: any = null;

    async init(modelPath: string) {
        // If already initialized with the SAME model, do nothing.
        if (this.isInitialized && this.modelPath === modelPath) return;

        console.log(`[Inference Worker] Booting wllama (WASM/WebGPU) for: ${modelPath}`);

        // If hot-swapping models, we MUST release the old model from RAM first to avoid memory leaks
        if (this.isInitialized && this.wllama) {
            console.log("[Inference Worker] Purging previous model from memory...");
            await this.wllama.exit();
            this.wllama = null;
        }

        this.modelPath = modelPath;

        // Dynamically import the @wllama/wllama library so the document shim is guaranteed to be in scope
        const { Wllama } = await import('@wllama/wllama');

        // 🌐 DYNAMIC ROUTING: Cloudflare Worker in Vercel Production, Localhost in Dev
        const isProd = import.meta.env.PROD;
        const PROXY_URL = 'https://sovereign-proxy.datacartel-collective.workers.dev';
        const wasmPath = isProd
            ? `${PROXY_URL}/wllama/wllama.wasm`
            : `${self.location.origin}/wllama/wllama.wasm`;

        // Initialize Wllama with the dynamically routed WASM binary (v3.1+ single binary)
        this.wllama = new Wllama({
            'default': wasmPath
        });

        // Load Model with strict memory constraints 
        // wllama natively loads from an OPFS File handle to bypass browser RAM ceilings
        const root = await navigator.storage.getDirectory();
        const modelName = this.modelPath.split('/').pop() || 'Huihui-Qwen3-0.6B-abliterated-v2.Q4_K_M.gguf';
        const fileHandle = await root.getFileHandle(modelName);
        const file = await fileHandle.getFile();

        // FIX: Using non-null assertion to satisfy TS compiler after constructor check
        // loadModel requires an array of files/blobs
        await this.wllama!.loadModel([file], {
            n_ctx: 2048, // Strictly finite context window (The Desk)
        });

        this.isInitialized = true;
        console.log("[Inference Worker] wllama Initialized. GGUF Model Cached in OPFS.");
    }

    async generate(
        prompt: string,
        context: string,
        systemPrompt: string,
        onProgress: (msg: any) => void
    ): Promise<string> {
        if (!this.isInitialized || !this.wllama) throw new Error("Inference worker not initialized.");

        // Format prompt using Qwen2.5 ChatML syntax (compatible with Huihui Qwen3)
        const fullPrompt = `<|im_start|>system\n${systemPrompt}\n\nContext:\n${context}<|im_end|>\n<|im_start|>user\n${prompt}<|im_end|>\n<|im_start|>assistant\n`;
        let generatedText: any = "";

        try {
<<<<<<< HEAD
            // Execute WASM inference using the corrected v3.x signature
            generatedText = await this.wllama.createCompletion(fullPrompt, {
=======
            // CRITICAL FIX: Dynamic Signature Resolution to prevent C++ Memory Corruption
            // Older Wllama versions expect a single object. Newer versions expect (prompt, options).
            const options = {
                prompt: fullPrompt, // Fallback injection for v1.x
>>>>>>> feature-dev
                nPredict: 2048,
                sampling: {
                    temp: 0.3,
                    top_p: 0.9,
                },
                onNewToken: (token: number, piece: Uint8Array | string, currentText: string) => {
<<<<<<< HEAD
                    // Robust piece handling for cross-version compatibility
=======
>>>>>>> feature-dev
                    const tokenStr = piece instanceof Uint8Array ? new TextDecoder().decode(piece) : piece;
                    onProgress({ delta: tokenStr });
                }
            };

            if (this.wllama.createCompletion.length === 1) {
                // Execute v1.x signature (Bypass TS strict types with any)
                generatedText = await (this.wllama.createCompletion as any)(options);
            } else {
                // Execute v2.x/v3.x signature (Bypass TS strict types with any)
                generatedText = await (this.wllama.createCompletion as any)(fullPrompt, options);
            }

            // Ensure we extract the string if the newer API returns a response object
            if (typeof generatedText !== 'string') {
                generatedText = generatedText.text || generatedText.content || String(generatedText);
            }
        } catch (error: any) {
            console.error("[Inference Worker] wllama generation failed:", error);
            throw error;
        }

        return generatedText.trim();
    }
}

Comlink.expose(new InferenceWorker());