import React, { useState, useRef } from "react";
import { Upload, FileText, File as FileIcon, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import * as pdfjs from "pdfjs-dist";
import mammoth from "mammoth";
import { contextualChunkingPipeline } from "@/rag/ingestion";
import { embedWorker, dbWorker } from "@/workers/worker-client";

// Initialize PDF.js worker - Required for August 2026 WASM compliance
// Ensure pdf.worker.min.mjs exists in your /public/wasm/ directory
pdfjs.GlobalWorkerOptions.workerSrc = `/wasm/pdf.worker.min.mjs`;

interface DocumentDropzoneProps {
    onProgress: (status: string) => void;
}

const DocumentDropzone: React.FC<DocumentDropzoneProps> = ({ onProgress }) => {
    const [isDragging, setIsDragging] = useState(false);
    const [uploadStatus, setUploadStatus] = useState<'idle' | 'processing' | 'success' | 'error'>('idle');
    const fileInputRef = useRef<HTMLInputElement>(null);

    const processFile = async (file: File) => {
        setUploadStatus('processing');
        onProgress(`📂 Accessing ${file.name}...`);

        try {
            let text = "";
            const extension = file.name.split('.').pop()?.toLowerCase();

            // 1. EXTRACTION LAYER: 100% Local Air-Gapped Parsing
            if (extension === 'pdf') {
                onProgress("📄 Extracting semantic layer from PDF...");
                const arrayBuffer = await file.arrayBuffer();
                const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
                let fullText = "";
                for (let i = 1; i <= pdf.numPages; i++) {
                    const page = await pdf.getPage(i);
                    const content = await page.getTextContent();
                    fullText += content.items.map((item: any) => item.str).join(" ") + "\n";
                }
                text = fullText;
            } else if (extension === 'docx') {
                onProgress("📝 Decoding Word XML hierarchy...");
                const arrayBuffer = await file.arrayBuffer();
                const result = await mammoth.extractRawText({ arrayBuffer });
                text = result.value;
            } else {
                // Fallback for .md and .txt
                text = await file.text();
            }

            if (!text.trim()) throw new Error("File contains no extractable text.");

            // 2. CHUNKING LAYER: Recursive Semantic Fragmentation
            onProgress("✂️ Decomposing intelligence into semantic chunks...");
            const chunks = await contextualChunkingPipeline(text, {
                source: file.name,
                type: 'vault_ingestion',
                timestamp: Date.now()
            });

            // 3. PERSISTENCE MESH: Embedding & Storage
            onProgress(`🧬 Seeding vault with ${chunks.length} memory nodes...`);

            for (let i = 0; i < chunks.length; i++) {
                const chunk = chunks[i];
                const progressPct = Math.round(((i + 1) / chunks.length) * 100);
                onProgress(`🧬 Vault Ingestion: ${progressPct}%`);

                // Parallel Task: Embed via Transformers.js (CPU Thread)
                const embedding = await embedWorker.embed(chunk.text);

                // Persistent Storage: Commit to SQLite OPFS Vault
                await dbWorker.insertChunk(chunk.text, embedding, chunk.metadata);
            }

            setUploadStatus('success');
            onProgress("✅ Intelligence successfully secured in Sovereign Vault.");

            // Cleanup UI state after delay
            setTimeout(() => {
                setUploadStatus('idle');
                onProgress("");
            }, 3000);
        } catch (error: any) {
            console.error("[Vault Ingestion Failed]:", error);
            setUploadStatus('error');
            onProgress(`❌ Security Breach: ${error.message || String(error)}`);
        }
    }
    const onDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        const files = e.dataTransfer.files;
        if (files && files.length > 0) {
            const file = files[0];
            if (file) {
                processFile(file);
            }
        }
    };

    const onFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (files && files.length > 0) {
            const file = files[0];
            if (file) {
                processFile(file);
            }
        }
    };

    return (
        <div
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={onDrop}
            onClick={() => !isDragging && fileInputRef.current?.click()}
            className={cn(
                "relative group cursor-pointer transition-all duration-500",
                "border-2 border-dashed rounded-3xl p-8 flex flex-col items-center justify-center gap-4",
                "bg-black/20 backdrop-blur-xl border-white/10",
                isDragging && "border-violet-500 bg-violet-500/10 scale-[1.02]",
                uploadStatus === 'processing' && "pointer-events-none opacity-80 shadow-[0_0_50px_rgba(139,92,246,0.2)]"
            )}
        >
            <input
                type="file"
                ref={fileInputRef}
                onChange={onFileSelect}
                className="hidden"
                accept=".txt,.md,.pdf,.docx"
            />

            <div className={cn(
                "w-20 h-20 rounded-3xl flex items-center justify-center border transition-all duration-500",
                "bg-white/5 border-white/10 group-hover:border-white/20",
                uploadStatus === 'processing' && "border-violet-500/50 shadow-inner",
                uploadStatus === 'success' && "border-emerald-500/50 bg-emerald-500/10",
                uploadStatus === 'error' && "border-red-500/50 bg-red-500/10"
            )}>
                {uploadStatus === 'idle' && <Upload className="w-10 h-10 text-white/50 group-hover:text-white group-hover:scale-110 transition-all" />}
                {uploadStatus === 'processing' && <Loader2 className="w-10 h-10 text-violet-400 animate-spin" />}
                {uploadStatus === 'success' && <CheckCircle2 className="w-10 h-10 text-emerald-400" />}
                {uploadStatus === 'error' && <AlertCircle className="w-10 h-10 text-red-400" />}
            </div>

            <div className="text-center space-y-1">
                <h3 className="text-xl font-bold tracking-tight text-white/90">
                    {uploadStatus === 'processing' ? 'Encrypting Intelligence...' : 'Ingest External Assets'}
                </h3>
                <p className="text-sm text-white/40 max-w-[200px]">
                    Drop PDF, Word, or Markdown for 100% Offline Recall
                </p>
            </div>

            {uploadStatus === 'processing' && (
                <div className="absolute inset-x-12 bottom-6 h-1.5 bg-white/5 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-violet-500 to-fuchsia-500 animate-pulse shadow-[0_0_10px_rgba(139,92,246,1)]" style={{ width: '100%' }} />
                </div>
            )}
        </div>
    );
};

export default DocumentDropzone;