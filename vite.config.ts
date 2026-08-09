import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';
import {defineConfig, loadEnv} from 'vite';

// Automatically generate a placeholder configuration file if it is missing
// (e.g. during Vercel builds or GitHub workflows where the .gitignored file does not exist)
const configPath = path.resolve(__dirname, 'firebase-applet-config.json');
if (!fs.existsSync(configPath)) {
  const dummyConfig = {
    projectId: "",
    appId: "",
    apiKey: "",
    authDomain: "",
    firestoreDatabaseId: "",
    storageBucket: "",
    messagingSenderId: "",
    measurementId: ""
  };
  fs.writeFileSync(configPath, JSON.stringify(dummyConfig, null, 2), 'utf-8');
  console.log('firebase-applet-config.json was missing (e.g. on Vercel/GitHub). Generated a placeholder dummy file.');
}

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
    build: {
      chunkSizeWarningLimit: 800,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined;

            if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('/scheduler/')) {
              return 'vendor-react';
            }
            if (id.includes('/motion/')) {
              return 'vendor-motion';
            }
            if (id.includes('/@google/genai/')) {
              return 'vendor-gemini';
            }
            if (id.includes('/firebase/') || id.includes('/@firebase/')) {
              return 'vendor-firebase';
            }
            if (id.includes('/lucide-react/')) {
              return 'vendor-icons';
            }
            if (id.includes('/three/')) {
              return 'vendor-three';
            }
            if (id.includes('/leaflet/')) {
              return 'vendor-leaflet';
            }
            if (id.includes('/d3-geo/') || id.includes('/topojson-client/') || id.includes('/world-atlas/')) {
              return 'vendor-geo';
            }
            if (id.includes('/@mediapipe/tasks-vision/')) {
              return 'vendor-mediapipe';
            }
            if (id.includes('/xlsx/')) {
              return 'vendor-xlsx';
            }
            if (id.includes('/jszip/')) {
              return 'vendor-jszip';
            }
            if (id.includes('/docx/')) {
              return 'vendor-docx';
            }
            if (id.includes('/jspdf/')) {
              return 'vendor-jspdf';
            }
            if (id.includes('/file-saver/')) {
              return 'vendor-file-saver';
            }
            if (
              id.includes('/html2canvas/') ||
              id.includes('/react-markdown/') ||
              id.includes('/remark-') ||
              id.includes('/rehype-') ||
              id.includes('/dompurify/') ||
              id.includes('/unified/') ||
              id.includes('/micromark') ||
              id.includes('/mdast') ||
              id.includes('/hast') ||
              id.includes('/vfile') ||
              id.includes('/bail/') ||
              id.includes('/comma-separated-tokens/') ||
              id.includes('/decode-named-character-reference/') ||
              id.includes('/devlop/') ||
              id.includes('/estree-util') ||
              id.includes('/hast-util') ||
              id.includes('/html-url-attributes/') ||
              id.includes('/is-plain-obj/') ||
              id.includes('/property-information/') ||
              id.includes('/space-separated-tokens/') ||
              id.includes('/trim-lines/') ||
              id.includes('/trough/') ||
              id.includes('/unist') ||
              id.includes('/web-namespaces/') ||
              id.includes('/zwitch/')
            ) {
              return 'vendor-rendering';
            }

            return 'vendor-misc';
          },
        },
      },
    },
  };
});
