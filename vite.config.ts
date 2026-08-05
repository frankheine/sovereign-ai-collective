// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

// CRITICAL: These headers unlock SharedArrayBuffer in the browser [2, 6].
const crossOriginHeaders = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
  "Cross-Origin-Resource-Policy": "cross-origin"
};

export default defineConfig({
  resolve: {
    alias: {
      // FIX: Standardize alias to "@" to match tsconfig and resolve imports correctly
      "@": path.resolve(import.meta.dirname, "./src")
    }
  },
  build: {
    target: 'esnext',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 4000,
//CRITICAL FIX: SUPRESS 500kb warning for massive AI vendor chunks
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('react') || id.includes('framer-motion') || id.includes('gsap')) return 'react-vendor';
          if (id.includes('sqlite-wasm-vec')) return 'sqlite-vendor';
          if (id.includes('@huggingface')) return 'onnx-vendor';
          if (id.includes('@wllama')) return 'wllama-vendor';
        }
      }
    }
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      injectManifest: { 
        maximumFileSizeToCacheInBytes: 260000000,
        globIgnores: ['**/*.gguf'] // Prevent model duplication in SW cache [7, 8]
      }
    })
  ],
  // FIX: Clean glob strings (removed spaces) for reliable binary asset serving
  assetsInclude: ['**/*.wasm', '**/*.json', '**/*.onnx'],
  server: {
    port: 5173,
    strictPort: true,
    host: 'localhost',
    headers: crossOriginHeaders
  },
  preview: {
    headers: crossOriginHeaders
  },
  worker: {
    format: 'es'
  },
  optimizeDeps: {
    // CRITICAL: Exclude libraries to prevent corruption of WASM binaries [5, 9]
    exclude: ['@huggingface/transformers', 'sqlite-wasm-vec', '@wllama/wllama', 'onnxruntime-web'],
    include: ['comlink', 'localforage']
  }
});