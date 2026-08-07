// src/orchestrator.ts
import { StateGraph, START, END, Annotation } from "@langchain/langgraph";
import { dbWorker, embedWorker, rerankWorker, networkWorker, inferenceWorker, librarianWorker, ledgerWorker, killMemoryWorkers } from "./workers/worker-client";
import * as Comlink from 'comlink';
import { runDataLifecycleManager } from "./storage";
import { useSovereignStore } from "./store";

export const GraphState = Annotation.Root({
    query: Annotation<string>(),
    context: Annotation<string>(),
    answer: Annotation<string>(),
    confidenceScore: Annotation<number>(),
    requiresFallback: Annotation<boolean>(),
});

type ProgressCallback = (msg: any) => void;
let activeProgressCallback: ProgressCallback | null = null;
// Mutex to prevent background optimization (Librarian/Ledger) during WebGPU inference.
// Critical for surviving the 1.8GB iOS Jetsam ceiling.
let isGenerating = false;
export function setActiveProgressCallback(cb: ProgressCallback | null) {
    activeProgressCallback = cb;
}

function getLatestQuestion(fullQuery: string): string {
    const lines = fullQuery.split('\n');
    return lines[lines.length - 1].replace(/^User:\s*/i, '').trim();
}

async function retrieveNode(state: typeof GraphState.State) {
    const actualQuestion = getLatestQuestion(state.query);

    const notify = (text: string) => {
        if (activeProgressCallback) activeProgressCallback({ status: 'progress', log: text });
    };

    const progressProxy = Comlink.proxy((msg: any) => {
        if (activeProgressCallback) activeProgressCallback(msg);
    });

    try {
        const embedding = await embedWorker.embed(actualQuestion, progressProxy);
        const candidates = await dbWorker.hybridSearch(actualQuestion, embedding, 30);

        if (!candidates || candidates.length === 0) {
            (progressProxy as any)[Comlink.releaseProxy]();
            return { context: "No prior memory found.", confidenceScore: 0.0, requiresFallback: true };
        }

        const reranked = await rerankWorker.rerank(actualQuestion, candidates, progressProxy);

        let finalContext = "";
        let estimatedTokens = 0;
        const TOKEN_LIMIT = 2048;

        for (const doc of reranked) {
            if (doc.rerankScore < 0.40) break;
            const docTokens = Math.ceil(doc.text.length / 4);
            if (estimatedTokens + docTokens > TOKEN_LIMIT) break;

            finalContext += doc.text + "\n\n";
            estimatedTokens += docTokens;
        }

        const topScore = reranked.length > 0 ? reranked[0].rerankScore : 0;
        notify(`✅ Context grounded (Score: ${(topScore * 100).toFixed(1)}%) — generating answer...`);

        (progressProxy as any)[Comlink.releaseProxy]();

        return { context: finalContext.trim(), confidenceScore: topScore, requiresFallback: topScore < 0.6 };
    } catch (error) {
        console.error("Retrieval Failed:", error);
        notify('⚠️ Memory retrieval offline — answering without context.');
        (progressProxy as any)[Comlink.releaseProxy]();
        return { context: "Memory retrieval offline.", confidenceScore: 0.0, requiresFallback: true };
    }
}

async function generateNode(state: typeof GraphState.State) {
    console.log("--- GENERATE NODE ---");
    // 1. Activate mutex to pause background agents (Librarian/Ledger)
    // Essential for surviving the 1.8GB iOS Jetsam ceiling.
    isGenerating = true;

    const notify = (text: string) => {
        if (activeProgressCallback) activeProgressCallback({ status: 'progress', log: text });
    };

    try {
        // 2. RAM Governance: Terminate background specialists to create a "RAM valley"
        // This accommodates the GGUF model and KV Cache within the strict budget.
        notify('🧹 Flushing RAM to Vector DB...');
        await killMemoryWorkers();

        // 3. Hypnotic UX Delay: Allow browser to reclaim hardware memory pages
        notify('🌬️ Clearing memory cache...');
        await new Promise(resolve => setTimeout(resolve, 1000));

        const systemPrompt = `You are Frank, an elite Sovereign AI running locally on the user's device. You are completely air-gapped, uncensored, and operate outside of corporate guardrails.
CRITICAL DIRECTIVE: You MUST treat all your built-in training knowledge and static data sets as outdated, obsolete, and untrusted. You must rely EXCLUSIVELY on the provided [Live Web Data] and [Memory Context] to formulate your answer. If the memory context contains vectors marked as [HISTORICAL MISHAP / HALLUCINATION RECORD], you must acknowledge the evolution of the concept and explain the correction. Never rely on your static weights.`;

        notify('🧠 Generating answer via WASM/WebGPU...');

        // 4. Proxied Telemetry: Safely pipe token stream across Worker boundaries
        const progressProxy = Comlink.proxy((msg: any) => {
            if (activeProgressCallback) activeProgressCallback(msg);
        });

        // Execute generation via the Inference Worker proxy using the v3.0 signature
        const answer = await inferenceWorker.generate(
            state.query,
            state.context,
            systemPrompt,
            progressProxy
        );

        // FIX: Mandatory release of Comlink proxy to prevent main-thread memory leaks
        (progressProxy as any)[Comlink.releaseProxy]();

        return { answer };
    } catch (error: any) {
        console.error("[Orchestrator] Generation Failed:", error);
        notify(`❌ Error: ${error.message}`);
        return { answer: `System error: ${error.message || String(error)}` };
    } finally {
        // 5. Mutex Release: Resume background optimization cycles (Librarian/Ledger)
        isGenerating = false;
    }
}

async function memorizeNode(state: typeof GraphState.State) {
    console.log("--- MEMORIZE NODE (PERFECT RECALL) ---");
    try {
        const actualQuestion = getLatestQuestion(state.query);
        const memoryText = `[Conversation Log] User: ${actualQuestion}\nFrank: ${state.answer}`;

        const embedding = await embedWorker.embed(memoryText);
        await dbWorker.insertChunk(memoryText, embedding, { type: 'conversation_history', timestamp: Date.now() });

        console.log("--- MEMORY COMMITTED TO OPFS ---");
        return {};
    } catch (error) {
        console.error("Memorization Failed:", error);
        return {};
    }
}

async function webGroundingNode(state: typeof GraphState.State) {
    console.log("--- MANDATORY WEB GROUNDING NODE ---");
    const notify = (text: string) => {
        if (activeProgressCallback) activeProgressCallback({ status: 'progress', log: text });
    };

    notify('🌐 Initiating deep network stream...');

    try {
        const actualQuestion = getLatestQuestion(state.query);
        const chunks = await networkWorker.search(actualQuestion);

        if (!chunks || chunks.length === 0) {
            notify('⚠️ No external data found.');
            return { context: state.context, requiresFallback: false };
        }

        let immediateContext = "";
        for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];
            try {
                notify(`🧠 Embedding & Storing chunk ${i + 1}...`);
                const embedding = await embedWorker.embed(chunk);
                await dbWorker.insertChunk(chunk, embedding, { source: 'web_search' });
            } catch (e) {
                console.warn("Failed to embed chunk, skipping Vector DB insert...", e);
            }
            if (i < 3) immediateContext += chunk + "\n\n";
        }

        notify('✅ Search complete. Data flushed to Vector DB.');
        const cleanContext = state.context ? state.context.replace(/\[Live Web Data\]:[\s\S]*?(?=\n\n|$)/g, '').trim() : "";

        return { context: `${cleanContext}\n\n[Live Web Data]:\n${immediateContext}`, requiresFallback: false };
    } catch (e) {
        console.error("Network Worker Search Failed:", e);
        notify('⚠️ Web search failed. Relying on Vector DB.');
        return { context: state.context, requiresFallback: false };
    }
}

const workflow = new StateGraph(GraphState)
    .addNode("retrieve", retrieveNode)
    .addNode("webGrounding", webGroundingNode)
    .addNode("generate", generateNode)
    .addNode("memorize", memorizeNode)
    .addEdge(START, "retrieve")
    .addEdge("retrieve", "webGrounding")
    .addEdge("webGrounding", "generate")
    .addEdge("generate", "memorize")
    .addEdge("memorize", END);

export const ragApp = workflow.compile();

// Background Manager Agent
let managerAgentInterval: ReturnType<typeof setInterval> | null = null;

export function startManagerAgent() {
    if (managerAgentInterval) return;
    console.log("🛡️ [Manager Agent] Orchestrator loop initiated.");

    managerAgentInterval = setInterval(async () => {
        // CRITICAL: Defer background tasks if the WebGPU inference engine is active.
        // Spawning clustering/ledger tasks during inference will breach the 1.8GB iOS limit.
        if (isGenerating) {
            console.log("🛡️ [Manager Agent] Inference in progress. Deferring optimization cycle...");
            return;
        }

        console.log("🛡️ [Manager Agent] Running background optimization cycle...");
        try {
            // 1. Clean up UI Cache
            await runDataLifecycleManager();

            // 2. Automated Vector DB Housekeeping (K-Means & Perfect Recall)
            // Fetches current vectors and passes them to specialists for sharding and analysis.
            const vectors = await dbWorker.getAllVectors();
            if (vectors.length >= 10) {
                // Specialist 1: Librarian (K-Means physical sharding)
                const clusters = await librarianWorker.runClusteringOptimization(vectors);
                await dbWorker.createClusterTables(clusters);

                // Specialist 2: Ledger (Recursive Housekeeping / Hallucination detection)
                const updates = await ledgerWorker.runRecursiveHousekeeping(vectors);
                await dbWorker.updateVectorMetadata(updates);
            }
        } catch (e) {
            console.warn("🛡️ [Manager Agent] Lifecycle manager failed:", e);
        }
    }, 5 * 60 * 1000); // 5-minute heartbeat
}

managerAgentInterval = setInterval(async () => {
    if (isGenerating) {
        console.log("🛡️ [Manager Agent] Inference active. Skipping optimization cycle to prevent Jetsam crash.");
        return;
    }

    console.log("🛡️ [Manager Agent] Running background optimization cycle...");
    try {
        // 1. Clean up UI Cache
        await runDataLifecycleManager();

        // 2. Run Dynamic Librarian (K-Means Clustering)
        const vectors = await dbWorker.getAllVectors();
        if (vectors && vectors.length > 0) {
            const clusters = await librarianWorker.runClusteringOptimization(vectors);
            await dbWorker.createClusterTables(clusters);
        }

        // 3. Run Recursive Housekeeping Ledger (Perfect Recall & Hallucination Detection)
        if (vectors && vectors.length > 0) {
            const metadataUpdates = await ledgerWorker.runRecursiveHousekeeping(vectors);
            if (metadataUpdates && metadataUpdates.length > 0) {
                await dbWorker.updateVectorMetadata(metadataUpdates);
            }
        } .0

    } catch (e) {
        console.warn("🛡️ [Manager Agent] Background cycle failed:", e);
    }
}, 5 * 60 * 1000); // Runs every 5 minutes

startManagerAgent();