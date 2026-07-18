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
  };
});
