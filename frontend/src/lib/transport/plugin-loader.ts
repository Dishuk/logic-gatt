/**
 * Plugin loader - fetches plugins from backend API
 *
 * The backend manages plugin lifecycle and provides plugin info via REST API.
 */

import type { BackendPluginInfo } from './types'

const API_BASE = '/api'

/**
 * Fetch plugin list from backend
 */
export async function fetchBackendPlugins(): Promise<BackendPluginInfo[]> {
  try {
    const res = await fetch(`${API_BASE}/plugins`)
    if (!res.ok) {
      throw new Error(`Failed to fetch plugins: ${res.statusText}`)
    }
    return await res.json()
  } catch (err) {
    console.error('Failed to fetch backend plugins:', err)
    return []
  }
}

/**
 * Select active plugin for WebSocket communication
 */
export async function selectPlugin(pluginId: string): Promise<BackendPluginInfo | null> {
  try {
    const res = await fetch(`${API_BASE}/session/select-plugin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pluginId }),
    })
    if (!res.ok) {
      throw new Error(`Failed to select plugin: ${res.statusText}`)
    }
    const data = await res.json()
    return data.activePlugin
  } catch (err) {
    console.error('Failed to select plugin:', err)
    return null
  }
}

/**
 * Call plugin custom action
 */
export async function callPluginAction(
  pluginId: string,
  method: string,
  path: string,
  body?: unknown
): Promise<unknown> {
  const res = await fetch(`${API_BASE}/plugins/${pluginId}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `Request failed: ${res.statusText}`)
  }
  return res.json()
}
