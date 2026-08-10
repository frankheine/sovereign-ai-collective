import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

const crossOriginHeaders = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
  "Cross-Origin-Resource-Policy": "cross-origin"
};

export default defineConfig({
  optimizeDeps: {
    exclude: ['@huggingface/transformers', 'sqlite-wasm-vec', '@sqlite.org/sqlite-wasm', '@wllama/wllama', 'onnxruntime-web'],
    include: ['comlink', 'localforage']
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src")
    }
  },
  server: {
    headers: crossOriginHeaders,
    port: 5173,
    strictPort: true,
    host: 'localhost',
    fs: {
      // Allow serving models from the /public/models/ directory
      allow: ['..']
    }
  },
  preview: {
    headers: crossOriginHeaders
  },
  worker: {
    format: 'es'
  },
  build: {
    target: 'esnext',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 4000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            // Priority 1: UI Core
            if (id.includes('react') || id.includes('framer-motion') || id.includes('gsap')) {
              return 'vendor-react';
            }
            // Priority 2: Intelligence Specialist chunks
            if (id.includes('sqlite-wasm-vec')) return 'vendor-sqlite';
            if (id.includes('@huggingface')) return 'vendor-onnx';
            if (id.includes('@wllama')) return 'vendor-wllama';

            // FIX: Deterministic fallback for all other dependencies
            // This prevents 'bundle bloat' in the main index chunk.
            return 'vendor-core';
          }
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
        globIgnores: ['**/*.gguf']
      },
      manifest: {
        name: 'Sovereign AI Collective',
        short_name: 'UNCUTstash',
        description: 'Take Back Control of Your Data',
        theme_color: '#000000',
        background_color: '#000000',
        display: 'standalone',
        icons: [
          {
            src: '/logos/UNCUTstash_icon_120.png',
            sizes: '120x120',
            type: 'image/png'
          },
          {
            src: '/logos/UNCUTstash_Logo_512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      }
    }),
  ],
  // FIX: Standardized binary asset serving for August 2026 compliance
  assetsInclude: ['**/*.wasm', '**/*.json', '**/*.onnx']
});
