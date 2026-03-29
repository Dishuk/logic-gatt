// copy-plugin-assets.js
// Copies manifest.json and assets declared in manifest from each plugin to dist/plugins/

import fs from 'fs'
import path from 'path'

const pluginsDir = path.resolve(import.meta.dirname, '../plugins')
const distPluginsDir = path.resolve(import.meta.dirname, '../dist/plugins')

// Check if plugins directory exists
if (!fs.existsSync(pluginsDir)) {
  console.log('[copy-plugin-assets] No plugins directory found, skipping')
  process.exit(0)
}

for (const plugin of fs.readdirSync(pluginsDir, { withFileTypes: true })) {
  if (!plugin.isDirectory()) continue

  const srcDir = path.join(pluginsDir, plugin.name)
  const destDir = path.join(distPluginsDir, plugin.name)

  // Copy manifest.json if exists
  const manifestSrc = path.join(srcDir, 'manifest.json')
  if (!fs.existsSync(manifestSrc)) continue

  fs.mkdirSync(destDir, { recursive: true })
  fs.copyFileSync(manifestSrc, path.join(destDir, 'manifest.json'))
  console.log(`[${plugin.name}] Copied manifest.json`)

  // Copy assets declared in manifest
  const manifest = JSON.parse(fs.readFileSync(manifestSrc, 'utf-8'))
  const assets = manifest.assets || []

  for (const asset of assets) {
    const assetSrc = path.join(srcDir, asset)
    if (!fs.existsSync(assetSrc)) {
      console.warn(`[${plugin.name}] Asset not found: ${asset}`)
      continue
    }

    const assetDest = path.join(destDir, asset)
    const stat = fs.statSync(assetSrc)

    if (stat.isDirectory()) {
      fs.cpSync(assetSrc, assetDest, { recursive: true })
    } else {
      fs.mkdirSync(path.dirname(assetDest), { recursive: true })
      fs.copyFileSync(assetSrc, assetDest)
    }
    console.log(`[${plugin.name}] Copied ${asset}`)
  }
}

console.log('[copy-plugin-assets] Done')
