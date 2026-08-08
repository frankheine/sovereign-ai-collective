import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { UploadCloud, CheckCircle, AlertTriangle } from 'lucide-react';
import { dbWorker, embedWorker } from '@/workers/worker-client';
import { contextualChunkingPipeline } from '@/rag/ingestion';

interface DocumentDropzoneProps {
    onProgress: (status: string) => void;
}

const DocumentDropzone: React.FC<DocumentDropzoneProps> = ({ onProgress }) => {
    const [isDragging, setIsDragging] = useState(false);
    const [uploadStatus, setUploadStatus] = useState<'idle' | 'processing' | 'success' | 'error'>('idle');
    const [statusMsg, setStatusMsg] = useState('');
    const dragCounter = useRef(0);

    // Bind drag-and-drop actions globally to the window
    useEffect(() => {
        const handleDragEnter = (e: DragEvent) => {
            e.preventDefault();
            dragCounter.current += 1;
            if (e.dataTransfer?.items && e.dataTransfer.items.length > 0) {
                setIsDragging(true);
            }
        };

        const handleDragLeave = (e: DragEvent) => {
            e.preventDefault();
            dragCounter.current -= 1;
            if (dragCounter.current === 0) {
                setIsDragging(false);
            }
        };

        const handleDragOver = (e: DragEvent) => {
            e.preventDefault();
        };

        const handleDrop = async (e: DragEvent) => {
            e.preventDefault();
            setIsDragging(false);
            dragCounter.current = 0;

            const files = e.dataTransfer?.files;
            if (files && files.length > 0) {
                await processFile(files[0]);
            }
        };

        window.addEventListener('dragenter', handleDragEnter);
        window.addEventListener('dragleave', handleDragLeave);
        window.addEventListener('dragover', handleDragOver);
        window.addEventListener('drop', handleDrop);

        return () => {
            window.removeEventListener('dragenter', handleDragEnter);
            window.removeEventListener('dragleave', handleDragLeave);
            window.removeEventListener('dragover', handleDragOver);
            window.removeEventListener('drop', handleDrop);
        };
    }, []);

    const processFile = async (file: File) => {
        setUploadStatus('processing');
        setStatusMsg(`Ingesting ${file.name}...`);
        onProgress(`📂 Accessing ${file.name}...`);

        try {
            const extension = file.name.split('.').pop()?.toLowerCase();
            let text = '';

            if (extension === 'txt' || extension === 'md') {
                text = await file.text();
            } else if (extension === 'pdf') {
                onProgress("📄 Extracting semantic layer from PDF...");
                // Dynamic bundle import of pdfjs-dist to optimize iOS RAM overhead
                const pdfjs = await import('pdfjs-dist');
                // Required for August 2026 WASM compliance - 100% Local Air-Gapped Parsing
                pdfjs.GlobalWorkerOptions.workerSrc = `/wasm/pdf.worker.min.mjs`;

                const arrayBuffer = await file.arrayBuffer();
                const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
                let extractedText = '';
                for (let i = 1; i <= pdf.numPages; i++) {
                    const page = await pdf.getPage(i);
                    const content = await page.getTextContent();
                    extractedText += content.items.map((item: any) => item.str).join(' ') + '\n';
                }
                text = extractedText;
            } else if (extension === 'docx') {
                onProgress("📝 Decoding Word XML hierarchy...");
                const mammoth = await import('mammoth');
                const arrayBuffer = await file.arrayBuffer();
                const result = await mammoth.extractRawText({ arrayBuffer });
                text = result.value;
            } else {
                throw new Error('Unsupported format. Only PDF, DOCX, MD, and TXT are supported.');
            }

            if (!text.trim()) {
                throw new Error('File contains no extractable text.');
            }

            setStatusMsg('Parsing and optimizing semantic structure...');
            onProgress("✂️ Decomposing intelligence into semantic chunks...");

            const chunks = await contextualChunkingPipeline(text, {
                source: file.name,
                type: 'vault_ingestion',
                timestamp: Date.now()
            });

            setStatusMsg(`Generating embeddings and indexing ${chunks.length} segments...`);
            onProgress(`🧬 Seeding vault with ${chunks.length} memory nodes...`);

            for (let i = 0; i < chunks.length; i++) {
                const chunk = chunks[i];
                const progressPct = Math.round(((i + 1) / chunks.length) * 100);
                onProgress(`🧬 Vault Ingestion: ${progressPct}%`);

                const embedding = await embedWorker.embed(chunk.text);
                await dbWorker.insertChunk(chunk.text, embedding, chunk.metadata);
            }

            setUploadStatus('success');
            setStatusMsg(`Successfully ingested and indexed ${file.name}!`);
            onProgress("✅ Intelligence successfully secured in Sovereign Vault.");

            setTimeout(() => {
                setUploadStatus('idle');
                onProgress("");
            }, 4000);
        } catch (err: any) {
            console.error("[Vault Ingestion Failed]:", err);
            setUploadStatus('error');
            setStatusMsg(err.message || 'Ingestion failed.');
            onProgress(`❌ Security Breach: ${err.message || String(err)}`);

            setTimeout(() => {
                setUploadStatus('idle');
                onProgress("");
            }, 6000);
        }
    };

    return (
        <AnimatePresence>
            {isDragging && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-lg pointer-events-none"
                >
                    <div className="max-w-md p-12 rounded-3xl border-2 border-dashed border-violet-500/50 bg-zinc-950/50 flex flex-col items-center gap-6 text-center shadow-[0_0_50px_rgba(139,92,246,0.3)]">
                        <div className="w-20 h-20 bg-violet-500/10 rounded-2xl flex items-center justify-center border border-violet-500/30 animate-pulse">
                            <UploadCloud className="w-10 h-10 text-violet-400" />
                        </div>
                        <div>
                            <h3 className="text-2xl font-bold tracking-tight text-white mb-2">Drop Document Here</h3>
                            <p className="text-sm text-white/60 max-w-xs">
                                Drop your PDF, DOCX, MD, or TXT file to securely embed and ingest into your local knowledge vaults.
                            </p>
                        </div>
                    </div>
                </motion.div>
            )}

            {uploadStatus !== 'idle' && (
                <motion.div
                    initial={{ opacity: 0, y: 50, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 50, scale: 0.95 }}
                    className="fixed bottom-6 right-6 z-50 max-w-sm w-full bg-zinc-900/90 backdrop-blur-xl border border-white/10 p-5 rounded-2xl shadow-2xl flex gap-4 items-start animate-in"
                >
                    <div className="shrink-0 pt-0.5">
                        {uploadStatus === 'processing' && (
                            <div className="w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
                        )}
                        {uploadStatus === 'success' && (
                            <CheckCircle className="w-6 h-6 text-emerald-400" />
                        )}
                        {uploadStatus === 'error' && (
                            <AlertTriangle className="w-6 h-6 text-rose-400" />
                        )}
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-white">Local Ingestion Status</p>
                        <p className="text-xs text-white/70 mt-1 break-words">{statusMsg}</p>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export default DocumentDropzone;