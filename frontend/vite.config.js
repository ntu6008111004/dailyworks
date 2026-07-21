import { defineConfig, loadEnv } from 'vite'
import process from 'process'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import fs from 'fs'
import path from 'path'

const versionTimestamp = new Date().getTime();

const generateVersionPlugin = () => ({
  name: 'generate-version-json',
  buildStart() {
    let changelog = [];
    try {
      if (fs.existsSync('changelog.json')) {
        changelog = JSON.parse(fs.readFileSync('changelog.json', 'utf-8'));
      }
    } catch(e) {
      console.error('Failed to parse changelog:', e);
    }
    
    const versionDir = path.resolve(process.cwd(), 'public');
    if (!fs.existsSync(versionDir)) {
      fs.mkdirSync(versionDir);
    }
    
    fs.writeFileSync(
      path.resolve(versionDir, 'version.json'), 
      JSON.stringify({ lastUpdated: versionTimestamp, changelog }, null, 2)
    );
  }
})

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
  define: {
    __APP_VERSION__: versionTimestamp
  },
  plugins: [
    react(),
    tailwindcss(),
    generateVersionPlugin()
  ],
  server: {
    proxy: {
      // The browser only talks to our backend. ThaiLLM credentials stay there.
      '/api/ai': {
        target: env.VITE_AI_PROXY_TARGET || 'http://localhost:3001',
        changeOrigin: true,
        secure: true,
      },
      // Client-key fallback for ThaiLLM in local development. In production
      // the matching Vercel rewrite keeps this HTTP upstream off the browser.
      '/api/thaillm': {
        target: 'http://thaillm.or.th',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/thaillm/, '/api/v1'),
      },
    },
  },
  }
})
