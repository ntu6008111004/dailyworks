import { defineConfig } from 'vite'
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
export default defineConfig({
  define: {
    __APP_VERSION__: versionTimestamp
  },
  plugins: [
    react(),
    tailwindcss(),
    generateVersionPlugin()
  ],
})
