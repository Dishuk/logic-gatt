/**
 * Plugin REST API routes
 *
 * - GET /api/plugins - List all plugins
 * - GET /api/plugins/:id - Get plugin info
 * - POST /api/plugins/:id/* - Plugin-specific actions
 */

import { Express, Request, Response } from 'express'

import {
  getAllPluginsInfo,
  getPluginInfo,
  getPluginRoutes,
} from '../plugin-loader.js'
import { validatePluginId } from '../validation.js'

export function setupPluginRoutes(app: Express): void {
  /**
   * GET /api/plugins
   * List all loaded plugins with their info and custom actions
   */
  app.get('/api/plugins', (_req: Request, res: Response) => {
    const plugins = getAllPluginsInfo()
    res.json(plugins)
  })

  /**
   * GET /api/plugins/:id
   * Get info for a specific plugin
   */
  app.get('/api/plugins/:id', (req: Request, res: Response) => {
    const idValidation = validatePluginId(req.params.id)
    if (!idValidation.valid) {
      res.status(400).json({ error: `Invalid plugin ID: ${idValidation.errors.join(', ')}` })
      return
    }

    const plugin = getPluginInfo(req.params.id)
    if (!plugin) {
      res.status(404).json({ error: 'Plugin not found' })
      return
    }
    res.json(plugin)
  })

  /**
   * Plugin-specific custom routes
   * Routes are handled dynamically based on loaded plugin routes
   */
  app.all('/api/plugins/:id/*', async (req: Request, res: Response) => {
    const pluginId = req.params.id

    const idValidation = validatePluginId(pluginId)
    if (!idValidation.valid) {
      res.status(400).json({ error: `Invalid plugin ID: ${idValidation.errors.join(', ')}` })
      return
    }

    const routes = getPluginRoutes(pluginId)

    if (routes.length === 0) {
      res.status(404).json({ error: 'Plugin not found or has no custom routes' })
      return
    }

    const routePath = '/' + req.params[0]
    const method = req.method as 'GET' | 'POST' | 'PUT' | 'DELETE'

    const route = routes.find((r) => r.method === method && r.path === routePath)

    if (!route) {
      res.status(404).json({
        error: 'Route not found',
        availableRoutes: routes.map((r) => `${r.method} ${r.path}`),
      })
      return
    }

    try {
      await route.handler(req, res)
    } catch (err) {
      console.error(`[plugins-route] Plugin route handler error:`, err)
      if (!res.headersSent) { // Handler may have already sent partial response
        res.status(500).json({
          error: err instanceof Error ? err.message : 'Route handler error',
        })
      }
    }
  })
}
