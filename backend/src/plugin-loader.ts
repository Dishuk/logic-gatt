/**
 * Plugin Loader
 *
 * Handles plugin discovery, loading, and lifecycle management.
 * Plugins are loaded from backend/plugins/ directory.
 */

import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'

import { PluginBase } from '@logic-gatt/shared'
import type {
  PluginContext,
  PluginManifest,
  PluginInfo,
  PluginEvent,
  PluginRoute,
} from '@logic-gatt/shared'
import type { Request, Response } from 'express'

/** Express route handler type for backend */
type RouteHandler = (req: Request, res: Response) => Promise<void> | void

/** Plugin route with typed express handler */
type BackendPluginRoute = PluginRoute<RouteHandler>

let activePluginId: string | null = null

export function getActivePluginId(): string | null {
  return activePluginId
}

export function setActivePluginId(id: string | null): void {
  activePluginId = id
}

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

interface LoadedPlugin {
  manifest: PluginManifest
  instance: PluginBase
  routes: BackendPluginRoute[]
  dir: string
}

const loadedPlugins = new Map<string, LoadedPlugin>()

/**
 * Get the plugins directory path.
 *
 * In development (tsx): backend/src/ -> backend/plugins/
 * In production: backend/dist/ -> backend/dist/plugins/
 */
function getPluginsDir(): string {
  if (process.env.NODE_ENV === 'production') {
    // In production/assembled build, plugins are in dist/plugins/
    // __dirname is backend/build/backend/ or backend/dist/
    return path.resolve(__dirname, 'plugins')
  }
  // In dev mode with tsx, __dirname is backend/src/
  // Plugins source is at backend/plugins/
  return path.resolve(__dirname, '../plugins')
}

const PLUGINS_DIR = getPluginsDir()

// Set by ws-handler during initialization
let broadcastFn: ((event: PluginEvent) => void) | null = null

export function setBroadcastFunction(fn: (event: PluginEvent) => void) {
  broadcastFn = fn
}

function createPluginContext(pluginId: string, pluginDir: string): PluginContext {
  return {
    pluginId,
    pluginDir,

    log(msg: string): void {
      console.log(`[plugin:${pluginId}] ${msg}`)
      broadcastFn?.({ type: 'log', message: `[${pluginId}] ${msg}` }) // Also send to frontend
    },

    broadcast(event: PluginEvent): void {
      if (!broadcastFn) {
        console.warn(`[plugin:${pluginId}] broadcast called but WebSocket not initialized`)
        return
      }
      broadcastFn(event)
    },
  }
}

/**
 * Resolve the entry path for a plugin.
 * In dev mode (tsx), prefer .ts files from source.
 * In production, load compiled .js files.
 */
async function resolvePluginEntry(sourceDir: string): Promise<string | null> {
  if (process.env.NODE_ENV !== 'production') {
    const tsPath = path.join(sourceDir, 'index.ts')
    try {
      await fs.access(tsPath)
      return tsPath
    } catch {
      // Fall through to .js
    }
  }

  const jsPath = path.join(sourceDir, 'index.js')
  try {
    await fs.access(jsPath)
    return jsPath
  } catch {
    return null
  }
}

/**
 * Load a plugin from a directory
 */
async function loadPluginFromDir(dir: string): Promise<LoadedPlugin | null> {
  const manifestPath = path.join(dir, 'manifest.json')

  try {
    await fs.access(manifestPath)
  } catch {
    console.error(`[plugin-loader] No manifest.json found in ${dir}`)
    return null
  }

  let manifest: PluginManifest
  try {
    const manifestContent = await fs.readFile(manifestPath, 'utf-8')
    manifest = JSON.parse(manifestContent)
  } catch (err) {
    console.error(`[plugin-loader] Failed to parse manifest in ${dir}:`, err)
    return null
  }

  if (!manifest.id || !manifest.name || !manifest.version) {
    console.error(`[plugin-loader] Invalid manifest in ${dir}: missing required fields`)
    return null
  }

  if (loadedPlugins.has(manifest.id)) {
    console.warn(`[plugin-loader] Plugin ${manifest.id} already loaded, skipping`)
    return loadedPlugins.get(manifest.id)!
  }

  const modulePath = await resolvePluginEntry(dir)
  if (!modulePath) {
    console.error(`[plugin-loader] Plugin entry not found for ${manifest.id}`)
    return null
  }

  // Use source directory so plugins can find their assets (e.g., Python backend)
  const ctx = createPluginContext(manifest.id, dir)

  // Dynamic import with timeout
  let instance: PluginBase
  try {
    const moduleUrl = pathToFileURL(modulePath).href
    const importPromise = import(moduleUrl)
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Plugin import timeout')), 10000)
    )
    const module = await Promise.race([importPromise, timeoutPromise])
    const PluginClass = module.default as new (ctx: PluginContext) => PluginBase

    if (typeof PluginClass !== 'function') {
      console.error(`[plugin-loader] Plugin ${manifest.id} must export a class as default`)
      return null
    }

    instance = new PluginClass(ctx)

    if (!(instance instanceof PluginBase)) {
      console.error(`[plugin-loader] Plugin ${manifest.id} must extend PluginBase`)
      return null
    }
  } catch (err) {
    console.error(`[plugin-loader] Failed to load plugin ${manifest.id}:`, err)
    return null
  }

  const routes = instance.getRoutes() as BackendPluginRoute[]

  try {
    await instance.onLoad()
  } catch (err) {
    console.error(`[plugin-loader] Plugin ${manifest.id} onLoad failed:`, err)
    return null
  }

  const loaded: LoadedPlugin = {
    manifest,
    instance,
    routes,
    dir,
  }

  loadedPlugins.set(manifest.id, loaded)
  console.log(`[plugin-loader] Loaded plugin: ${manifest.id} (${manifest.name} v${manifest.version})`)

  return loaded
}

/**
 * Load plugins from a directory.
 */
async function loadPluginsFromDir(dir: string): Promise<void> {
  try {
    await fs.access(dir)
  } catch {
    return // Directory doesn't exist, skip silently
  }

  const entries = await fs.readdir(dir, { withFileTypes: true })

  for (const entry of entries) {
    // Skip tsconfig.json and other non-directory entries
    if (entry.isDirectory()) {
      const pluginDir = path.join(dir, entry.name)
      try {
        await loadPluginFromDir(pluginDir)
      } catch (err) {
        console.error(`[plugin-loader] Failed to load plugin from ${pluginDir}:`, err)
      }
    }
  }
}

/**
 * Load all plugins from backend/plugins/ directory.
 */
export async function loadPlugins(): Promise<void> {
  const mode = process.env.NODE_ENV === 'production' ? 'production' : 'development'
  console.log(`[plugin-loader] Mode: ${mode}`)
  console.log(`[plugin-loader] Loading plugins from: ${PLUGINS_DIR}`)

  await loadPluginsFromDir(PLUGINS_DIR)
}

/**
 * Unload a plugin
 */
export async function unloadPlugin(pluginId: string): Promise<boolean> {
  const plugin = loadedPlugins.get(pluginId)
  if (!plugin) {
    return false
  }

  try {
    await plugin.instance.onUnload()
  } catch (err) {
    console.error(`[plugin-loader] Plugin ${pluginId} onUnload failed:`, err)
  }

  loadedPlugins.delete(pluginId)

  // Clear active plugin if it was the one being unloaded
  if (getActivePluginId() === pluginId) {
    setActivePluginId(null)
    console.log(`[plugin-loader] Cleared active plugin (was ${pluginId})`)
  }

  console.log(`[plugin-loader] Unloaded plugin: ${pluginId}`)

  return true
}

/**
 * Unload all plugins (for graceful shutdown)
 */
export async function unloadAllPlugins(): Promise<void> {
  const pluginIds = Array.from(loadedPlugins.keys())
  for (const pluginId of pluginIds) {
    await unloadPlugin(pluginId)
  }
}

/**
 * Get plugin info for frontend
 */
export function getPluginInfo(pluginId: string): PluginInfo | null {
  const plugin = loadedPlugins.get(pluginId)
  if (!plugin) {
    return null
  }

  return {
    id: plugin.manifest.id,
    name: plugin.manifest.name,
    version: plugin.manifest.version,
    description: plugin.manifest.description,
    icon: plugin.manifest.icon,
    color: plugin.manifest.color,
    actions: plugin.routes.map((r) => ({
      method: r.method,
      path: r.path,
      label: r.label,
      description: r.description,
      ui: r.ui,
    })),
    isAvailable: plugin.instance.isAvailable(),
  }
}

/**
 * Get all loaded plugins info
 */
export function getAllPluginsInfo(): PluginInfo[] {
  return Array.from(loadedPlugins.keys())
    .map((id) => getPluginInfo(id))
    .filter((info): info is PluginInfo => info !== null)
}

/**
 * Get a loaded plugin instance
 */
export function getPlugin(pluginId: string): PluginBase | null {
  return loadedPlugins.get(pluginId)?.instance ?? null
}

/**
 * Get plugin routes
 */
export function getPluginRoutes(pluginId: string): BackendPluginRoute[] {
  return loadedPlugins.get(pluginId)?.routes ?? []
}
