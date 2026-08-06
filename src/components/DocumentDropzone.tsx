import React, { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FileUp, File, CheckCircle2, AlertCircle } from 'lucide-react';
// CRITICAL FIX: Import directly from the Comlink mesh, bypassing the deleted pipeline.ts
import { embedWorker, dbWorker } from '../workers/worker-client';

interface DocumentDropzoneProps {
    onProgress: (status: string) => void;
}

export const DocumentDropzone: React.FC<DocumentDropzoneProps> = ({ onProgress }) => {
    const [isDragging, setIsDragging] = useState(false);
    const [uploadStatus, setUploadStatus] = useState<'idle' | 'processing' | 'success' | 'error'>('idle');
    const dragCounter = useRef(0);

    const handleDragEnter = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounter.current++;
        if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
            setIsDragging(true);
        }
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounter.current--;
        if (dragCounter.current === 0) {
            setIsDragging(false);
        }
    }, []);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
    }, []);

    const processFile = async (file: File) => {
        const isText = file.name.endsWith('.txt') || file.name.endsWith('.md');
        const isPDF = file.name.endsWith('.pdf');
        const isDocx = file.name.endsWith('.docx');

        if (!isText && !isPDF && !isDocx) {
            onProgress(`Error: Unsupported file type ${file.name}. Supported: .txt, .md, .pdf, .docx.`);
            setUploadStatus('error');
            setTimeout(() => setUploadStatus('idle'), 3000);
            return;
        }

        setUploadStatus('processing');
        onProgress(`Processing document: ${file.name}`);

        try {
            let text = "";
            if (isText) {
                text = await file.text();
            } else if (isDocx) {
                onProgress(`Extracting DOCX contents...`);
                // Dynamic import to protect the 1.8GB iOS RAM budget
                const mammoth = await import('mammoth');
                const arrayBuffer = await file.arrayBuffer();
                const result = await mammoth.extractRawText({ arrayBuffer });
                text = result.value;
            } else if (isPDF) {
                onProgress(`Extracting PDF contents (RAM-conscious mode)...`);
                // Dynamic import to protect the 1.8GB iOS RAM budget
                const pdfjsLib = await import('pdfjs-dist');
                // CRITICAL FIX: Bundle worker locally to maintain 100% air-gapped Zero-Trust CSP
                pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.mjs', import.meta.url).toString();
                const arrayBuffer = await file.arrayBuffer();
                const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
                for (let i = 1; i <= pdf.numPages; i++) {
                    const page = await pdf.getPage(i);
                    const content = await page.getTextContent();
                    text += content.items.map((item: any) => item.str).join(' ') + "\n";
                }
            }

            // Extremely basic chunking for phase 1
            const chunkSize = 1000;
            const chunks: string[] = [];
            for (let i = 0; i < text.length; i += chunkSize) {
                chunks.push(text.slice(i, i + chunkSize));
            }

            onProgress(`Chunked into ${chunks.length} segments. Generating embeddings...`);

            for (let i = 0; i < chunks.length; i++) {
                const chunk = chunks[i];
                onProgress(`Embedding chunk ${i + 1}/${chunks.length}...`);

                // 1. Generate embedding directly via Comlink
                const embedding = await embedWorker.embed(chunk);

                // 2. Insert into SQLite directly via Comlink
                await dbWorker.insertChunk(chunk, embedding, {
                    source: file.name,
                    type: 'document',
                    chunkIndex: i
                });
            }

            setUploadStatus('success');
            onProgress(`Successfully indexed ${file.name} (${chunks.length} chunks)`);
            setTimeout(() => setUploadStatus('idle'), 3000);
        } catch (error: any) {
            console.error("Dropzone Error:", error);
            setUploadStatus('error');
            onProgress(`Failed to process ${file.name}: ${error.message}`);
            setTimeout(() => setUploadStatus('idle'), 4000);
        }
    };

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
        dragCounter.current = 0;

        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            const file = e.dataTransfer.files[0];
            processFile(file);
        }
    }, []);

    // Global drag listeners could be added here, but attaching to a full-screen div is safer
    useEffect(() => {
        const handleWindowDragOver = (e: DragEvent) => e.preventDefault();
        const handleWindowDrop = (e: DragEvent) => e.preventDefault();

        window.addEventListener('dragover', handleWindowDragOver);
        window.addEventListener('drop', handleWindowDrop);

        return () => {
            window.removeEventListener('dragover', handleWindowDragOver);
            window.removeEventListener('drop', handleWindowDrop);
        };
    }, []);

    return (
        <>
            <div
                className="absolute inset-0 z-40 pointer-events-auto"
                onDragEnter={handleDragEnter}
                onDragLeave={handleDragLeave}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                style={{ pointerEvents: isDragging ? 'auto' : 'none' }}
            />

            <AnimatePresence>
                {isDragging && (
                    <motion.div
                        initial={{ opacity: 0, scale: 1.05 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm pointer-events-none"
                    >
                        <div className="w-96 h-64 border-2 border-dashed border-violet-500/50 rounded-3xl bg-violet-500/10 flex flex-col items-center justify-center gap-4 text-violet-300 shadow-[0_0_50px_rgba(139,92,246,0.2)]">
                            <FileUp className="w-16 h-16 animate-bounce" />
                            <div className="text-xl font-mono tracking-widest font-medium">DROP TO INDEX</div>
                            <div className="text-xs opacity-60">Local Chunking & Embedding via Transformers.js</div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {uploadStatus !== 'idle' && (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        className="absolute bottom-8 right-8 z-50"
                    >
                        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-black/80 backdrop-blur-xl border border-white/10 shadow-2xl">
                            {uploadStatus === 'processing' && <File className="w-5 h-5 text-blue-400 animate-pulse" />}
                            {uploadStatus === 'success' && <CheckCircle2 className="w-5 h-5 text-green-400" />}
                            {uploadStatus === 'error' && <AlertCircle className="w-5 h-5 text-red-400" />}

                            <div className="flex flex-col">
                                <span className="text-xs font-medium text-white/90">
                                    {uploadStatus === 'processing' ? 'Processing Document' :
                                        uploadStatus === 'success' ? 'Indexing Complete' : 'Indexing Failed'}
                                </span>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
};

export default DocumentDropzone;