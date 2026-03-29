/**
 * Presets REST API routes
 *
 * - GET /api/presets - List available presets
 * - GET /api/presets/:name - Get a specific preset
 */

import { Express, Request, Response } from 'express'
import { readdir, readFile } from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const PRESETS_DIR = path.resolve(__dirname, '../../data/presets')

export function setupPresetRoutes(app: Express): void {
  /**
   * GET /api/presets
   * List all available presets
   */
  app.get('/api/presets', async (_req: Request, res: Response) => {
    try {
      const files = await readdir(PRESETS_DIR)
      const presets = files
        .filter(f => f.endsWith('.json'))
        .map(f => f.replace('.json', ''))

      res.json({ presets })
    } catch (err) {
      console.error('[presets] Failed to list presets:', err)
      res.status(500).json({ error: 'Failed to list presets' })
    }
  })

  /**
   * GET /api/presets/:name
   * Get a specific preset by name
   */
  app.get('/api/presets/:name', async (req: Request, res: Response) => {
    const { name } = req.params

    // Validate name to prevent directory traversal
    if (!name || /[^a-zA-Z0-9_-]/.test(name)) {
      res.status(400).json({ error: 'Invalid preset name' })
      return
    }

    const filePath = path.join(PRESETS_DIR, `${name}.json`)

    try {
      const content = await readFile(filePath, 'utf-8')
      const preset = JSON.parse(content)
      res.json(preset)
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        res.status(404).json({ error: 'Preset not found' })
      } else {
        console.error(`[presets] Failed to load preset ${name}:`, err)
        res.status(500).json({ error: 'Failed to load preset' })
      }
    }
  })
}
