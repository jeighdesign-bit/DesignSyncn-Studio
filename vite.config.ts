import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

function garmentTemplateRegistry() {
  const templatesDir = path.resolve(__dirname, 'public/templates')
  const manifestPath = path.resolve(templatesDir, 'manifest.json')

  function generateManifest() {
    try {
      if (!fs.existsSync(templatesDir)) {
        fs.mkdirSync(templatesDir, { recursive: true })
      }

      const items = fs.readdirSync(templatesDir)
      const templates: any[] = []

      for (const item of items) {
        const itemPath = path.join(templatesDir, item)
        if (!fs.statSync(itemPath).isDirectory()) continue

        const configPath = path.join(itemPath, 'config.json')
        if (!fs.existsSync(configPath)) continue

        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
        
        // Find SVGs
        const files = fs.readdirSync(itemPath)
        const svgFiles: Record<string, string> = {}
        for (const file of files) {
          if (file.endsWith('.svg')) {
            const key = file.replace('.svg', '') // e.g. front, back, left-sleeve, right-sleeve
            svgFiles[key] = `/templates/${item}/${file}`
          }
        }

        templates.push({
          id: item,
          ...config,
          files: svgFiles
        })
      }

      fs.writeFileSync(manifestPath, JSON.stringify(templates, null, 2), 'utf8')
      console.log(`[Vite Garment Registry] Generated manifest at ${manifestPath}`)
    } catch (e) {
      console.error('[Vite Garment Registry] Failed to generate manifest:', e)
    }
  }

  return {
    name: 'vite-plugin-garment-templates',
    buildStart() {
      generateManifest()
    },
    configureServer(server: any) {
      generateManifest()
      server.watcher.on('all', (event: string, filePath: string) => {
        if (filePath.includes(templatesDir) && !filePath.endsWith('manifest.json')) {
          if (event === 'add' || event === 'unlink' || event === 'change') {
            generateManifest()
          }
        }
      })
    }
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), garmentTemplateRegistry()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('fabric')) {
              return 'vendor-fabric';
            }
            if (id.includes('lucide-react')) {
              return 'vendor-lucide';
            }
            if (id.includes('react') || id.includes('scheduler')) {
              return 'vendor-react';
            }
            return 'vendor-core';
          }
        }
      }
    }
  }
})

