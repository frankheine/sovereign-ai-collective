// src/workers/ledger.worker.ts
import * as Comlink from 'comlink';

class LedgerWorker {
    async runRecursiveHousekeeping(vectors: { id: number, vector: number[] }[]): Promise<{ id: number, metadata: any }[]> {
        console.log("🧊 [Recursive Ledger] Initiating 100% Perfect Recall Housekeeping...");
        if (!vectors || vectors.length < 2) return [];

        const updates: { id: number, metadata: any }[] = [];

        // Recursive Analysis: 
        // Identify highly similar vectors (cosine distance < 0.08) to track the evolution of ideas.
        for (let i = 0; i < vectors.length; i++) {
            for (let j = i + 1; j < vectors.length; j++) {
                const dist = this.cosineDistance(vectors[i].vector, vectors[j].vector);

                // If vectors are nearly identical in semantic space, they represent an evolving concept
                if (dist < 0.08) {
                    // Mark the older vector (assuming lower ID is older) as superseded, but DO NOT DELETE.
                    // Tag it to maintain the hierarchy of correctness and record the mishap.
                    const olderId = Math.min(vectors[i].id, vectors[j].id);
                    const newerId = Math.max(vectors[i].id, vectors[j].id);

                    updates.push({
                        id: olderId,
                        metadata: {
                            status: "superseded",
                            superseded_by: newerId,
                            is_hallucination: true, // Flagged for review
                            correction_note: `Concept evolved or corrected by memory ID ${newerId}. Retained for perfect recall and mistake analysis.`
                        }
                    });
                }
            }
        }

        console.log(`🧊 [Recursive Ledger] Housekeeping complete. Identified ${updates.length} evolving concepts/mishaps.`);
        return updates;
    }

    private cosineDistance(a: number[], b: number[]): number {
        let dotProduct = 0, normA = 0, normB = 0;
        for (let i = 0; i < a.length; i++) {
            dotProduct += a[i] * b[i];
            normA += a[i] * a[i];
            normB += b[i] * b[i];
        }
        if (normA === 0 || normB === 0) return 1;
        return 1 - (dotProduct / (Math.sqrt(normA) * Math.sqrt(normB)));
    }
}
Comlink.expose(new LedgerWorker());