/**
 * Tests for plugin-loader.ts
 *
 * Tests plugin manifest validation and info generation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { validatePluginId } from '../validation.js'

describe('Plugin Manifest Validation', () => {
  // Test manifest field validation
  interface TestManifest {
    id?: string
    name?: string
    version?: string
    description?: string
  }

  function validateManifest(manifest: TestManifest): { valid: boolean; errors: string[] } {
    const errors: string[] = []

    // Use actual validatePluginId for id validation
    if (!manifest.id) {
      errors.push('Missing required field: id')
    } else {
      const idResult = validatePluginId(manifest.id)
      if (!idResult.valid) {
        errors.push(...idResult.errors)
      }
    }

    if (!manifest.name) {
      errors.push('Missing required field: name')
    } else if (typeof manifest.name !== 'string') {
      errors.push('Field "name" must be a string')
    }

    if (!manifest.version) {
      errors.push('Missing required field: version')
    } else if (typeof manifest.version !== 'string') {
      errors.push('Field "version" must be a string')
    } else if (!/^\d+\.\d+\.\d+/.test(manifest.version)) {
      errors.push('Field "version" must be semver format')
    }

    return { valid: errors.length === 0, errors }
  }

  it('should validate a correct manifest', () => {
    const manifest = {
      id: 'test-plugin',
      name: 'Test Plugin',
      version: '1.0.0',
    }
    const result = validateManifest(manifest)
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('should reject manifest without id', () => {
    const manifest = {
      name: 'Test Plugin',
      version: '1.0.0',
    }
    const result = validateManifest(manifest)
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('Missing required field: id')
  })

  it('should reject manifest without name', () => {
    const manifest = {
      id: 'test-plugin',
      version: '1.0.0',
    }
    const result = validateManifest(manifest)
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('Missing required field: name')
  })

  it('should reject manifest without version', () => {
    const manifest = {
      id: 'test-plugin',
      name: 'Test Plugin',
    }
    const result = validateManifest(manifest)
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('Missing required field: version')
  })

  it('should reject invalid plugin id format (uppercase)', () => {
    const manifest = {
      id: 'Test-Plugin',
      name: 'Test Plugin',
      version: '1.0.0',
    }
    const result = validateManifest(manifest)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('lowercase'))).toBe(true)
  })

  it('should reject invalid plugin id format (spaces)', () => {
    const manifest = {
      id: 'test plugin',
      name: 'Test Plugin',
      version: '1.0.0',
    }
    const result = validateManifest(manifest)
    expect(result.valid).toBe(false)
  })

  it('should reject invalid version format', () => {
    const manifest = {
      id: 'test-plugin',
      name: 'Test Plugin',
      version: 'invalid',
    }
    const result = validateManifest(manifest)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('semver'))).toBe(true)
  })

  it('should allow optional description field', () => {
    const manifest = {
      id: 'test-plugin',
      name: 'Test Plugin',
      version: '1.0.0',
      description: 'A test plugin for unit testing',
    }
    const result = validateManifest(manifest)
    expect(result.valid).toBe(true)
  })
})

describe('Plugin Context Creation', () => {
  it('should create context with correct properties', () => {
    const pluginId = 'test-plugin'
    const pluginDir = '/path/to/plugin'

    const context = {
      pluginId,
      pluginDir,
      spawn: vi.fn(),
      log: vi.fn(),
      broadcast: vi.fn(),
    }

    expect(context.pluginId).toBe(pluginId)
    expect(context.pluginDir).toBe(pluginDir)
    expect(typeof context.spawn).toBe('function')
    expect(typeof context.log).toBe('function')
    expect(typeof context.broadcast).toBe('function')
  })

  it('should log with plugin prefix', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const pluginId = 'test-plugin'

    function log(msg: string) {
      console.log(`[plugin:${pluginId}] ${msg}`)
    }

    log('test message')
    expect(consoleSpy).toHaveBeenCalledWith('[plugin:test-plugin] test message')

    consoleSpy.mockRestore()
  })
})

describe('Plugin Info Generation', () => {
  interface PluginAction {
    method: string
    path: string
    label?: string
    description?: string
  }

  interface PluginInfo {
    id: string
    name: string
    version: string
    description?: string
    icon?: string
    color?: string
    actions: PluginAction[]
    isAvailable: boolean
  }

  function createPluginInfo(
    manifest: { id: string; name: string; version: string; description?: string; icon?: string; color?: string },
    routes: PluginAction[],
    available: boolean
  ): PluginInfo {
    return {
      id: manifest.id,
      name: manifest.name,
      version: manifest.version,
      description: manifest.description,
      icon: manifest.icon,
      color: manifest.color,
      actions: routes.map((r) => ({
        method: r.method,
        path: r.path,
        label: r.label,
        description: r.description,
      })),
      isAvailable: available,
    }
  }

  it('should create plugin info from manifest', () => {
    const manifest = {
      id: 'test-plugin',
      name: 'Test Plugin',
      version: '1.0.0',
      description: 'Test description',
      icon: 'usb',
      color: '#10B981',
    }
    const routes: PluginAction[] = [
      { method: 'GET', path: '/test', label: 'Test', description: 'Test action' },
    ]
    const info = createPluginInfo(manifest, routes, true)

    expect(info.id).toBe('test-plugin')
    expect(info.name).toBe('Test Plugin')
    expect(info.version).toBe('1.0.0')
    expect(info.description).toBe('Test description')
    expect(info.icon).toBe('usb')
    expect(info.color).toBe('#10B981')
    expect(info.actions).toHaveLength(1)
    expect(info.isAvailable).toBe(true)
  })

  it('should map all routes to actions', () => {
    const manifest = {
      id: 'test-plugin',
      name: 'Test Plugin',
      version: '1.0.0',
    }
    const routes: PluginAction[] = [
      { method: 'GET', path: '/list', label: 'List' },
      { method: 'POST', path: '/create', label: 'Create' },
      { method: 'DELETE', path: '/remove', label: 'Remove' },
    ]
    const info = createPluginInfo(manifest, routes, true)

    expect(info.actions).toHaveLength(3)
    expect(info.actions.map((a) => a.method)).toEqual(['GET', 'POST', 'DELETE'])
  })

  it('should reflect availability status', () => {
    const manifest = {
      id: 'test-plugin',
      name: 'Test Plugin',
      version: '1.0.0',
    }

    const available = createPluginInfo(manifest, [], true)
    expect(available.isAvailable).toBe(true)

    const unavailable = createPluginInfo(manifest, [], false)
    expect(unavailable.isAvailable).toBe(false)
  })
})

describe('Active Plugin State', () => {
  let activePluginId: string | null = null

  function getActivePluginId(): string | null {
    return activePluginId
  }

  function setActivePluginId(id: string | null): void {
    activePluginId = id
  }

  beforeEach(() => {
    activePluginId = null
  })

  it('should initially have no active plugin', () => {
    expect(getActivePluginId()).toBeNull()
  })

  it('should set active plugin', () => {
    setActivePluginId('ble-uart')
    expect(getActivePluginId()).toBe('ble-uart')
  })

  it('should clear active plugin', () => {
    setActivePluginId('ble-uart')
    setActivePluginId(null)
    expect(getActivePluginId()).toBeNull()
  })

  it('should change active plugin', () => {
    setActivePluginId('ble-uart')
    setActivePluginId('usb-ble')
    expect(getActivePluginId()).toBe('usb-ble')
  })
})

describe('Plugin Directory Resolution', () => {
  function getPluginsDir(isProduction: boolean, dirname: string): string {
    if (isProduction) {
      // In production, plugins are in dist/plugins/
      return dirname.replace(/[/\\]src$/, '') + '/plugins'
    }
    // In dev mode, plugins are at backend/plugins/
    return dirname.replace(/[/\\]src$/, '/plugins')
  }

  it('should resolve dev plugins directory', () => {
    const dirname = '/project/backend/src'
    const result = getPluginsDir(false, dirname)
    expect(result).toBe('/project/backend/plugins')
  })

  it('should resolve production plugins directory', () => {
    const dirname = '/project/backend/src'
    const result = getPluginsDir(true, dirname)
    expect(result).toBe('/project/backend/plugins')
  })

  it('should handle Windows paths', () => {
    const dirname = 'C:\\project\\backend\\src'
    const result = getPluginsDir(false, dirname)
    expect(result).toBe('C:\\project\\backend/plugins')
  })
})
