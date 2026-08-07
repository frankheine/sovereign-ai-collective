import { inferenceWorker } from "@/workers/worker-client";

export interface TextChunk {
    id: string;
    text: string;
    metadata: any;
}

let lastKnownState: Record<string, any> = {};

/**
 * TELEMETRY GOVERNANCE:
 * Filters incoming log states to prevent UI thrashing.
 * Only returns true if a value has changed by more than the defined threshold.
 */
export function deltaBasedLogFilter(incomingState: Record<string, any>, threshold: number = 0.05): boolean {
    let hasSignificantChange = false;

    for (const [key, value] of Object.entries(incomingState)) {
        const prev = lastKnownState[key];
        if (prev === undefined) {
            hasSignificantChange = true;
            continue;
        }

        if (typeof value === 'number' && typeof prev === 'number') {
            const delta = Math.abs(value - prev) / (prev || 1);
            if (delta >= threshold) hasSignificantChange = true;
        } else if (value !== prev) {
            hasSignificantChange = true;
        }
    }

    if (hasSignificantChange) {
        lastKnownState = { ...incomingState };
    }
    return hasSignificantChange;
}

/**
 * CONTEXTUAL RETRIEVAL PIPELINE:
 * 1. Fragments raw text into semantic chunks via recursive splitting.
 * 2. Enriches each chunk with a situational summary via local WebGPU inference.
 * 3. Prepares chunks for high-fidelity 384-dim vector embedding.
 */
export async function contextualChunkingPipeline(
    rawText: string,
    baseMetadata: any,
    chunkSize: number = 500,
    chunkOverlap: number = 50
): Promise<TextChunk[]> {
    const chunks: TextChunk[] = [];
    const separators = ['\n\n', '\n', '. ', ' '];

    // 1. RECURSIVE CHARACTER SPLITTING
    const splitRecursive = (text: string, currentSeparators: string[]): string[] => {
        if (text.length <= chunkSize || currentSeparators.length === 0) return [text];

        const sep = currentSeparators;
        const parts = text.split(sep);
        const result: string[] = [];
        let currentChunk = "";

        for (const part of parts) {
            if ((currentChunk + (currentChunk ? sep : "") + part).length <= chunkSize) {
                currentChunk += (currentChunk ? sep : "") + part;
            } else {
                if (currentChunk) result.push(currentChunk);
                currentChunk = part;
            }
        }
        if (currentChunk) result.push(currentChunk);

        // Recurse for segments that still exceed the token/char budget
        return result.flatMap(r =>
            r.length > chunkSize ? splitRecursive(r, currentSeparators.slice(1)) : [r]
        );
    };

    const textSegments = splitRecursive(rawText, separators);

    // 2. SITUATIONAL CONTEXT ENRICHMENT
    // Critical for grounding sub-1B models in document-wide semantics.
    for (let i = 0; i < textSegments.length; i++) {
        const segment = textSegments[i];
        const chunkId = crypto.randomUUID();

        // Use document preamble (first 1500 chars) to provide global context to the LLM
        const documentContext = rawText.slice(0, 1500);
        const enrichmentPrompt = `DOCUMENT CONTEXT:
${documentContext}... [TRUNCATED]

SNIPPET TO CONTEXTUALIZE:
${segment}

TASK: Provide a 1-sentence situational summary of this snippet to improve retrieval. How does this snippet relate to the overall document? Output ONLY the summary.`;

        try {
            // Execute local enrichment via the inference worker proxy
            // SEQUENTIAL EXECUTION: Mandatory to prevent iOS OOM (Jetsam) events
            const situationalContext = await inferenceWorker.generate(
                "Internal Grounding",
                "",
                enrichmentPrompt,
                () => { } // Silent telemetry for background processing
            );

            chunks.push({
                id: chunkId,
                text: `${situationalContext.trim()}\n\n${segment}`,
                metadata: {
                    ...baseMetadata,
                    chunkIndex: i,
                    originalLength: segment.length,
                    situationalContext: situationalContext.trim()
                }
            });
        } catch (e) {
            console.warn(`🧊 [Ingestion] Contextual enrichment failed for chunk ${i}. Falling back to raw text.`, e);
            chunks.push({
                id: chunkId,
                text: segment,
                metadata: { ...baseMetadata, chunkIndex: i }
            });
        }
    }

    return chunks;
}