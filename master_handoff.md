# MASTER HANDOFF DOCUMENT: Sovereign AI Core

## 1. EXECUTIVE PHILOSOPHY & STRATEGY (The "Why")
The core mission is to provide a Local-First Sovereign Intelligence ("Frank" / "UNCUTstash AI") that operates completely air-gapped and uncensored on the user's device. The architecture prioritizes absolute data privacy and local execution without relying on external corporate APIs for core inference. The user experience demands high-performance, seamless interactions, utilizing WebGL procedural backgrounds, smooth scrolling, and real-time token streaming, all while operating within the strict confines of a Progressive Web App (PWA). The project has explicitly pivoted away from native wrappers (Capacitor) to a pure, modern PWA architecture.

## 2. HARDWARE & COMPUTE GOVERNANCE (The Constraints)
- **Memory Budget:** Strictly bound by a 1.8GB iOS RAM limit to prevent Jetsam termination.
- **Inference Engine:** Strictly WebGPU-bound using a 400MB GGUF model. CPU inference is deprecated and removed.
- **Storage:** Relies heavily on the Origin Private File System (OPFS) for caching the GGUF model and persisting the SQLite database, bypassing browser memory limits.
- **Concurrency:** Background optimization cycles (like K-Means clustering and memory offloading) must be strictly gated by an `isGenerating` mutex to prevent out-of-memory crashes when the WebGPU inference engine is active.
- **Reranking:** Intentionally CPU-bound (using a lightweight 33MB model) to prevent shader collisions with the WebGPU inference engine.

## 3. IN-FLIGHT ARCHITECTURE & SECURITY
- **Worker Mesh:** A 7-Web-Worker mesh routed via Comlink handles distinct tasks: Database, Embedding, Reranking, Network, Inference, Librarian, and Ledger.
- **Data Layer:** SQLite WebAssembly utilizing `vec0` for 384-dimensional semantic search and `fts5` for lexical search. Legacy Orama implementations have been purged.
- **Security:** Enforced via a Zero-Trust Diode Content Security Policy.
- **Recent Code State:**
  - `App.tsx`: Implements platform-conditional standalone detection to enforce Add-to-Home-Screen (A2HS) only on iOS, fixing a previous deadlock on Windows/Android.
  - `orchestrator.ts`: Integrates the `isGenerating` mutex and a 5-minute background optimization loop.
  - `db.worker.ts`: Implements `getAllVectors` and `createClusterTables` for dynamic sharding.
  - `librarian.worker.ts`: Implements K-Means (k=5) clustering optimization.
  - `package.json`: Stripped of `@capacitor/core` and `@capacitor/ios`.

## 4. THE DYNAMIC ROADMAP
**Next Immediate Action:**
Verify the stability of the newly implemented K-Means clustering and virtual table creation within the background manager agent, ensuring it does not trigger Jetsam events on iOS devices during the 5-minute optimization cycles.

**Successive Steps:**
1. **Ledger Worker Integration:** Implement the stubbed `ledger.worker.ts` to handle AES-256-GCM encryption and offloading of stale memory (e.g., Google Drive OAuth integration).
2. **Document Parsing Expansion:** Expand `DocumentDropzone.tsx` to support PDF and DOCX parsing using lightweight, RAM-conscious libraries (e.g., PDF.js, mammoth.js) suitable for the PWA environment.
3. **JIT Oracle Workflow:** Fully adopt the NotebookLM Retrieval Oracle workflow for future code modifications, utilizing the optimized `repomix-oracle.txt` and `GRAPH_REPORT.txt` to minimize token usage and prevent hallucination during complex refactors.