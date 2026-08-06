// src/workers/inference.worker.ts
import * as Comlink from 'comlink';
import { Wllama } from '@wllama/wllama';

class InferenceWorker {
    private isInitialized = false;
    private modelPath = "";
    private wllama: Wllama | null = null;

    async init(modelPath: string) {
        if (this.isInitialized && this.modelPath === modelPath) return;

        console.log(`[Inference Worker] Booting wllama (WASM/CPU) for: ${modelPath}`);

        if (this.isInitialized && this.wllama) {
            console.log("[Inference Worker] Purging previous model from memory...");
            await this.wllama.exit();
            this.wllama = null;
        }

        this.modelPath = modelPath;

        // 🌐 DYNAMIC ROUTING: Cloudflare in Prod, Localhost in Dev
        const isProd = import.meta.env.PROD;
        const PROXY_URL = 'https://sovereign-proxy.datacartel-collective.workers.dev';
        const wasmPath = isProd ? `${PROXY_URL}/wllama/wllama.wasm` : `${self.location.origin}/wllama/wllama.wasm`;

        // Initialize Wllama with the dynamically routed WASM binary
        this.wllama = new Wllama({
    'default': wasmPath
        });

        const root = await navigator.storage.getDirectory();
        const modelName = this.modelPath.split('/').pop() || 'model.gguf';
        const fileHandle = await root.getFileHandle(modelName);
        const file = await fileHandle.getFile();

        // Wrap the OPFS File object in an array to satisfy the Blob[] signature
        await this.wllama.loadModel([file], {
            n_ctx: 2048, // Strictly finite context window to protect iOS RAM
        });

        this.isInitialized = true;
        console.log("[Inference Worker] wllama Initialized. GGUF Model Cached in OPFS.");
    }

    async generate(prompt: string, context: string, systemPrompt: string, onProgress: (msg: any) => void): Promise<string> {
        if (!this.isInitialized || !this.wllama) throw new Error("Inference worker not initialized.");

        const fullPrompt = `<|im_start|>system\n${systemPrompt}\n\nContext:\n${context}<|im_end|>\n<|im_start|>user\n${prompt}<|im_end|>\n<|im_start|>assistant\n`;

        let generatedText = "";

        try {
            const stream = await this.wllama.createCompletion({
                prompt: fullPrompt,
                max_tokens: 2048,
                temperature: 0.3, 
                top_p: 0.9,
                stream: true
            });

            for await (const chunk of stream) {
                const tokenStr = chunk.choices[0]?.text || "";
                onProgress({ delta: tokenStr });
                generatedText += tokenStr;
            }
        } catch (error: any) {
            console.error("[Inference Worker] wllama generation failed:", error);
            throw error;
        }

        return generatedText.trim();
    }
}

Comlink.expose(new InferenceWorker());