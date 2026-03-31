/**
 * Backend server for logic-gatt plugin system
 *
 * - Serves frontend static files
 * - Manages plugin lifecycle (load, unload)
 * - Routes WebSocket events to active plugin
 * - Provides REST API for plugin management
 */

import express from 'express'
import cors from 'cors'
import { createServer } from 'http'
import path from 'path'
import { fileURLToPath } from 'url'

import { setupPluginRoutes } from './routes/plugins.js'
import { setupPresetRoutes } from './routes/presets.js'
import { setupSessionRoutes } from './routes/session.js'
import { setupWebSocket } from './ws-handler.js'
import { loadPlugins, unloadAllPlugins } from './plugin-loader.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3001
const SHUTDOWN_TIMEOUT_MS = 5000

// Frontend dist is at ../../frontend/dist relative to both:
// - backend/src/ (dev mode via tsx)
// - backend/dist/ (production)
const FRONTEND_DIST = path.resolve(__dirname, '../../frontend/dist')

async function main() {
  const app = express()
  const server = createServer(app)

  // Middleware
  app.use(cors())
  app.use(express.json())

  // API routes
  setupPluginRoutes(app)
  setupPresetRoutes(app)
  setupSessionRoutes(app)

  app.use(express.static(FRONTEND_DIST))
  app.use('/api/*', (_req, res) => {
    res.status(404).json({ error: 'Not found' })
  })
  app.get('*', (_req, res) => {
    res.sendFile(path.join(FRONTEND_DIST, 'index.html'))
  })

  setupWebSocket(server)
  
  await loadPlugins()

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`[backend] Port ${PORT} is already in use`)
    } else {
      console.error(`[backend] Server error:`, err)
    }
    process.exit(1)
  })

  server.listen(PORT, () => {
    console.log(`[backend] Server running at http://localhost:${PORT}`)
    console.log(`[backend] Frontend served from: ${FRONTEND_DIST}`)
  })

  const shutdown = async () => {
    console.log('\n[backend] Shutting down...')
    await unloadAllPlugins()
    server.close(() => {
      console.log('[backend] Server closed')
      process.exit(0)
    })
    setTimeout(() => {
      console.error('[backend] Forced shutdown after timeout')
      process.exit(1)
    }, SHUTDOWN_TIMEOUT_MS)
  }

  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)
}

main().catch((err) => {
  console.error('[backend] Failed to start:', err)
  process.exit(1)
})
