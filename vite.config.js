import { resolve } from 'path';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import { visualizer } from 'rollup-plugin-visualizer';

export default defineConfig({
  worker: {
    format: 'es',
    rollupOptions: {
      output: {
        format: 'iife',
        inlineDynamicImports: true
      }
    }
  },
  build: {
    minify: 'terser',
    base: './',
    commonjsOptions: {
      include: [/dist/, /node_modules/]
    },
    target: "esnext",
    lib: {
      formats: ["es", "cjs"],
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'test',
      fileName: (format) => `index.${format}.js`
    },
    rollupOptions: {
      external: ['@babylonjs/core', '@babylonjs/materials', '@tweenjs/tween.js'],
      output: {
        globals: {
          '@babylonjs/core': 'BABYLON',
          '@babylonjs/materials': 'BABYLON.Materials',
          '@tweenjs/tween.js': 'TWEEN'
        }
      }
    }
  },
  plugins: [
    dts(),
    visualizer({
      filename: 'dist/stats.html',
      open: false,
      gzipSize: true
    })
  ]
});