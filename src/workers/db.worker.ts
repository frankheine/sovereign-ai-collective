// src/workers/db.worker.ts
import * as Comlink from 'comlink';
// CRITICAL FIX: Import from the vector-enabled build, not the standard build
import sqlite3InitModule from 'sqlite-wasm-vec';

class DatabaseWorker {
    private db: any = null;
    private isReady = false;

    async init() {
        if (this.isReady) return;
        try {
            // 1. Initialize SQLite WASM (without passing options directly)
            const sqlite3 = await sqlite3InitModule();

            // 2. Safely check for OPFS support
            if ('opfs' in sqlite3) {
                this.db = new (sqlite3.oo1 as any).OpfsDb('/sovereign-vault.sqlite3');
            } else {
                this.db = new sqlite3.oo1.DB('/transient.sqlite3', 'ct');
            }

            // Initialize FTS5 (Lexical) and vec0 (Semantic) tables
            // Note: all-MiniLM-L6-v2 outputs 384-dimensional vectors
            this.db.exec(`
                CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(text, content='');
                CREATE VIRTUAL TABLE IF NOT EXISTS vec_chunks USING vec0(vector float[384]);
                CREATE TABLE IF NOT EXISTS embeddings (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    text TEXT,
                    metadata TEXT
                );
            `);

            this.isReady = true;
        } catch (error) {
            console.error("[DB Worker] Failed to initialize SQLite WASM:", error);
            throw error;
        }
    }

    async insertChunk(text: string, embedding: number[], metadata: any = {}) {
        if (!this.isReady) await this.init();

        const floatArray = new Float32Array(embedding);
        const buffer = new Uint8Array(floatArray.buffer);

        this.db.exec('BEGIN TRANSACTION;');
        try {
            this.db.exec({
                sql: `INSERT INTO embeddings (text, metadata) VALUES (?, ?)`,
                bind: [text, JSON.stringify(metadata)]
            });

            this.db.exec({
                sql: `INSERT INTO chunks_fts (rowid, text) VALUES (last_insert_rowid(), ?)`,
                bind: [text]
            });

            this.db.exec({
                sql: `INSERT INTO vec_chunks (rowid, vector) VALUES (last_insert_rowid(), ?)`,
                bind: [buffer]
            });
            this.db.exec('COMMIT;');
        } catch (e) {
            this.db.exec('ROLLBACK;');
            throw e;
        }
    }

    async hybridSearch(queryText: string, queryVector: number[], limit: number = 30) {
        if (!this.isReady) await this.init();

        const floatArray = new Float32Array(queryVector);
        const buffer = new Uint8Array(floatArray.buffer);
        const results: any[] = [];

        // Hybrid Search: Combines FTS5 BM25 rank with sqlite-vec cosine distance
        this.db.exec({
            sql: `
                WITH semantic_matches AS (
                    SELECT rowid, distance 
                    FROM vec_chunks 
                    WHERE vector MATCH ? AND k = ?
                ),
                lexical_matches AS (
                    SELECT rowid, rank 
                    FROM chunks_fts 
                    WHERE chunks_fts MATCH ?
                )
                SELECT 
                    e.rowid, 
                    e.text, 
                    s.distance,
                    l.rank,
                    e.metadata
                FROM embeddings e
                LEFT JOIN semantic_matches s ON e.rowid = s.rowid
                LEFT JOIN lexical_matches l ON e.rowid = l.rowid
                WHERE s.rowid IS NOT NULL OR l.rowid IS NOT NULL
                ORDER BY (COALESCE(s.distance, 1.0) * 0.7) + (COALESCE(l.rank, 10.0) * 0.3) ASC
                LIMIT ?
            `,
            bind: [buffer, limit * 2, queryText.replace(/[^a-zA-Z0-9 ]/g, '*'), limit],
            callback: (row: any) => {
                let text = row[1];
                try {
                    const meta = JSON.parse(row[4]);
                    if (meta && meta.is_hallucination) {
                        text = `[HISTORICAL MISHAP / HALLUCINATION RECORD]\nOriginal Text: ${text}\nCorrection Note: ${meta.correction_note}`;
                    }
                } catch (e) { }
                results.push({ id: row[0], text: text, distance: row[2], rank: row[3] });
            }
        });
        return results;
    }

    /**
   * PERSISTENCE MUTATION:
   * Batches metadata updates from the Ledger Specialist.
   * standardizes on 'vec_chunks' table to resolve schema drift.
   */
    async updateVectorMetadata(updates: { id: number, metadata: any }[]): Promise<void> {
        if (!this.isReady) await this.init();

        this.db.exec("BEGIN TRANSACTION;");
        try {
            for (const update of updates) {
                const rows: any[] = [];
                this.db.exec({
                    sql: "SELECT metadata FROM embeddings WHERE id = ?",
                    bind: [update.id],
                    callback: (row: any) => rows.push(row)
                });

                let existingMetadata: any = {};
                if (rows.length > 0 && rows[0][0]) {
                    try { existingMetadata = JSON.parse(rows[0][0]); } catch (_) { }
                }

                const mergedMetadata = { ...existingMetadata, ...update.metadata };

                this.db.exec({
                    sql: "UPDATE embeddings SET metadata = ? WHERE id = ?",
                    bind: [JSON.stringify(mergedMetadata), update.id]
                });
            }
            this.db.exec("COMMIT;");
            console.log(`[DB Worker] Metadata synced for ${updates.length} vectors.`);
        } catch (error: any) {
            this.db.exec("ROLLBACK;");
            console.error("[DB Worker] Metadata sync failed:", error);
            throw error;
        }
    }

    /**
     * SEMANTIC RETRIEVAL:
     * Fetches the entire vector set for the Librarian's K-Means clustering cycle.
     * FIX: Corrected row indices (0 for rowid, 1 for vector) to prevent OOB crash.
     */
    async getAllVectors(): Promise<{ id: number, vector: number[] }[]> {
        if (!this.isReady) await this.init();

        const results: { id: number, vector: number[] }[] = [];
        this.db.exec({
            sql: 'SELECT rowid, vector FROM vec_chunks',
            callback: (row: any) => {
                // FIX: row is rowid, row[2] is the binary vector blob. 
                const buffer = row[1];
                if (!buffer) return;


                const floatArray = new Float32Array(
                    buffer.buffer,
                    buffer.byteOffset,
                    buffer.byteLength / 4
                );
                results.push({
                    id: row[0], // FIX: Extract scalar ID for Librarian K-Means
                    vector: Array.from(floatArray)
                });
            }
        });
        return results;
    }

    /**
     * PHYSICAL SHARDING:
     * Creates virtual tables for dense clusters identified by the Librarian.
     * Essential for O(1) retrieval scaling on iOS devices.
     */
    async createClusterTables(clusters: { clusterId: number, rowIds: number[] }[]) {
        if (!this.isReady) await this.init();

        this.db.exec('BEGIN TRANSACTION;');
        try {
            for (const cluster of clusters) {
                const tableName = `vec_chunks_cluster_${cluster.clusterId}`;
                // Ensure 384-dim parity with all-MiniLM-L6-v2
                this.db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS ${tableName} USING vec0(vector float[384]);`);
                this.db.exec(`DELETE FROM ${tableName};`);

                for (const id of cluster.rowIds) {
                    this.db.exec({
                        sql: `INSERT INTO ${tableName} (rowid, vector) SELECT rowid, vector FROM vec_chunks WHERE rowid = ?`,
                        bind: [id]
                    });
                }
            }
            this.db.exec('COMMIT;');
            console.log(`📚 [DB Worker] Sharded ${clusters.length} clusters into virtual tables.`);
        } catch (e) {
            this.db.exec('ROLLBACK;');
            console.error("[DB Worker] Clustering transaction failed:", e);
            throw e;
        }
    }
} // End Class
Comlink.expose(new DatabaseWorker());