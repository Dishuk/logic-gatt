// install-plugin-deps.js
// Scans backend/plugins for manifest.json files and installs their dependencies

import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const pluginsDir = path.resolve(__dirname, '../plugins')

// Check if plugins directory exists
if (!fs.existsSync(pluginsDir)) {
  console.log('[install-plugin-deps] No plugins directory found, skipping')
  process.exit(0)
}

// Scan plugins and collect dependencies
const entries = fs.readdirSync(pluginsDir, { withFileTypes: true })
const pluginDirs = entries.filter((d) => d.isDirectory()).map((d) => d.name)

const depsToInstall = []

for (const dir of pluginDirs) {
  const manifestPath = path.join(pluginsDir, dir, 'manifest.json')
  if (!fs.existsSync(manifestPath)) {
    continue
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
  if (manifest.dependencies && typeof manifest.dependencies === 'object') {
    for (const [pkg, version] of Object.entries(manifest.dependencies)) {
      depsToInstall.push(`${pkg}@${version}`)
      console.log(`[${manifest.id}] ${pkg}@${version}`)
    }
  }
}

if (depsToInstall.length > 0) {
  console.log(`[install-plugin-deps] Installing: ${depsToInstall.join(' ')}`)
  execSync(`npm install --no-save ${depsToInstall.join(' ')}`, {
    cwd: path.resolve(__dirname, '..'),
    stdio: 'inherit',
  })
} else {
  console.log('[install-plugin-deps] No plugin dependencies to install')
}
