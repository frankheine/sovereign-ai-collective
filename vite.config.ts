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
    headers: crossOriginHeaders
    fs: {
      // Allow serving models from the /public/models/ directory
      allow: ['..']
    }
  },
  build: {
    target: 'esnext',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 4000,
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
        globIgnores: ['**/*.gguf']
      }
    }),
  ],
  assetsInclude: ['**/*.wasm', '**/*.json', '**/*.onnx'],
  server: {

  },
  preview: {
    headers: crossOriginHeaders
  },
  worker: {
    format: 'es'
  },
});