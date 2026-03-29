/**
 * Session REST API routes
 *
 * - POST /api/session/select-plugin - Select active plugin
 * - GET /api/session/active-plugin - Get current active plugin
 */

import { Express, Request, Response } from 'express'
import { getPluginInfo, getActivePluginId, setActivePluginId } from '../plugin-loader.js'
import { validatePluginId } from '../validation.js'

export function setupSessionRoutes(app: Express): void {
  /**
   * POST /api/session/select-plugin
   * Select the active plugin for WebSocket communication
   */
  app.post('/api/session/select-plugin', (req: Request, res: Response) => {
    const { pluginId } = req.body

    const validation = validatePluginId(pluginId)
    if (!validation.valid) {
      res.status(400).json({ error: validation.errors.join(', ') })
      return
    }

    const plugin = getPluginInfo(pluginId)
    if (!plugin) {
      res.status(404).json({ error: 'Plugin not found' })
      return
    }

    setActivePluginId(pluginId)
    console.log(`[session] Active plugin set to: ${pluginId}`)

    res.json({
      success: true,
      activePlugin: plugin,
    })
  })

  /**
   * GET /api/session/active-plugin
   * Get the currently active plugin
   */
  app.get('/api/session/active-plugin', (_req: Request, res: Response) => {
    const pluginId = getActivePluginId()

    if (!pluginId) {
      res.json({ activePlugin: null })
      return
    }

    const plugin = getPluginInfo(pluginId)
    res.json({ activePlugin: plugin })
  })
}
