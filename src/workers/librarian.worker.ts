import * as Comlink from 'comlink';

/**
 * DYNAMIC LIBRARIAN SPECIALIST:
 * Responsible for physical sharding of the Vector DB.
 * Uses K-Means clustering to identify semantic density and organize memory into shards.
 */
class LibrarianWorker {
    private K_CLUSTERS = 5;
    private MAX_ITERATIONS = 10;

    /**
     * SEMANTIC SHARDING:
     * Analyzes all vectors to identify natural groupings.
     * Returns a map of cluster IDs and their constituent row IDs to the orchestrator.
     */
    async runClusteringOptimization(vectors: { id: number, vector: number[] }[]): Promise<{ clusterId: number, rowIds: number[] }[]> {
        console.log("📚 [Dynamic Librarian] Initiating K-Means sharding on OPFS vectors...");

        if (!vectors || vectors.length < this.K_CLUSTERS) {
            console.warn("📚 [Dynamic Librarian] Insufficient vector density for sharding.");
            return [];
        }

        // 1. Initialize Centroids (Random selection from existing nodes)
        let centroids = vectors
            .sort(() => Math.random() - 0.5)
            .slice(0, this.K_CLUSTERS)
            .map(v => [...v.vector]);

        let assignments: number[] = new Array(vectors.length).fill(-1);
        let iterations = 0;
        let moved = true;

        // 2. Iterative Convergence Loop
        while (moved && iterations < this.MAX_ITERATIONS) {
            moved = false;
            iterations++;

            // Assignment Phase: Find nearest centroid for each vector
            for (let i = 0; i < vectors.length; i++) {
                let minDistance = Infinity;
                let closestCluster = -1;

                for (let k = 0; k < this.K_CLUSTERS; k++) {
                    const dist = this.cosineDistance(vectors[i].vector, centroids[k]);
                    if (dist < minDistance) {
                        minDistance = dist;
                        closestCluster = k;
                    }
                }

                if (assignments[i] !== closestCluster) {
                    assignments[i] = closestCluster;
                    moved = true;
                }
            }

            // Update Phase: Re-calculate centroids based on current assignments
            const newCentroids = Array.from({ length: this.K_CLUSTERS }, () => new Array(384).fill(0));
            const counts = new Array(this.K_CLUSTERS).fill(0);

            for (let i = 0; i < vectors.length; i++) {
                const clusterIdx = assignments[i];
                counts[clusterIdx]++;
                for (let d = 0; d < 384; d++) {
                    newCentroids[clusterIdx][d] += vectors[i].vector[d];
                }
            }

            for (let k = 0; k < this.K_CLUSTERS; k++) {
                if (counts[k] > 0) {
                    centroids[k] = newCentroids[k].map(val => val / counts[k]);
                }
            }
        }

        // 3. Construct Shard Map for DB Worker
        const clusters = Array.from({ length: this.K_CLUSTERS }, (_, i) => ({
            clusterId: i,
            rowIds: vectors.filter((_, idx) => assignments[idx] === i).map(v => v.id)
        }));

        console.log(`📚 [Dynamic Librarian] Sharding complete. ${vectors.length} nodes organized into ${this.K_CLUSTERS} shards.`);
        return clusters;
    }

    /**
     * SEMANTIC MATH:
     * Computes the cosine distance between high-dimensional embeddings.
     * Standardized 384-dimensional loop.
     */
    private cosineDistance(v1: number[], v2: number[]): number {
        let dotProduct = 0;
        let norm1 = 0;
        let norm2 = 0;

        for (let i = 0; i < v1.length; i++) {
            dotProduct += v1[i] * v2[i];
            norm1 += v1[i] * v1[i];
            norm2 += v2[i] * v2[i];
        }

        const magnitude = Math.sqrt(norm1) * Math.sqrt(norm2);
        if (magnitude === 0) return 1;
        return 1 - (dotProduct / magnitude);
    }
}

Comlink.expose(new LibrarianWorker());

// FIX: Force module isolation for Vite worker loader compatibility
export { };