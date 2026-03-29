/**
 * Backend Plugin Selection Modal
 *
 * Shows available backend plugins and handles connection flow.
 * Plugin UI is auto-generated from plugin action UI metadata.
 */

import { useState, useEffect, useCallback } from 'react'
import type { TransportConnection, BackendPluginInfo, PluginAction } from '../lib/transport/types'
import { fetchBackendPlugins, selectPlugin, callPluginAction } from '../lib/transport/plugin-loader'
import { BackendConnection } from '../lib/transport/backend-connection'
import { validateSelectOptions, validateStatusResponse, type SelectOption, type StatusResponse } from '../lib/validate'

interface BackendTransportModalProps {
  onConnect: (connection: TransportConnection, label: string) => void
  onClose: () => void
  log: (msg: string) => void
}

/** Icon component that renders based on plugin icon name */
function PluginIcon({ icon, color }: { icon?: string; color?: string }) {
  const style = { color: color || 'currentColor' }

  switch (icon) {
    case 'usb':
      return (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={style}>
          <path d="M12 2v6m0 0l-2-2m2 2l2-2" />
          <circle cx="12" cy="12" r="2" />
          <path d="M12 14v4m-3-2h6" />
          <path d="M6 18a2 2 0 100-4 2 2 0 000 4zm12 0a2 2 0 100-4 2 2 0 000 4z" />
          <path d="M6 16v-4a2 2 0 012-2h1m7 0h1a2 2 0 012 2v4" />
        </svg>
      )
    case 'bluetooth':
      return (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={style}>
          <path d="M6.5 6.5l11 11L12 23V1l5.5 5.5-11 11" />
        </svg>
      )
    default:
      return <span style={{ fontSize: '1.5rem' }}>🔌</span>
  }
}

// ============================================================================
// Dynamic Form Field Components
// ============================================================================

interface SelectFieldProps {
  fieldId: string
  label: string
  pluginId: string
  sourceAction: PluginAction
  targetAction?: PluginAction
  selectedValue: string | null
  onSelect: (value: string) => void
  log: (msg: string) => void
}

function SelectField({
  fieldId,
  label,
  pluginId,
  sourceAction,
  targetAction,
  selectedValue,
  onSelect,
  log,
}: SelectFieldProps) {
  const [options, setOptions] = useState<SelectOption[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setLoading(true)
    callPluginAction(pluginId, sourceAction.method, sourceAction.path)
      .then(result => {
        const validated = validateSelectOptions(result)
        if (validated.success && validated.data) {
          setOptions(validated.data)
        } else {
          log(`Invalid options response: ${validated.error}`)
          setOptions([])
        }
      })
      .catch(err => {
        log(`Failed to load options: ${err instanceof Error ? err.message : String(err)}`)
      })
      .finally(() => setLoading(false))
  }, [pluginId, sourceAction, log])

  const handleSelect = async (value: string) => {
    if (targetAction) {
      try {
        await callPluginAction(pluginId, targetAction.method, targetAction.path, { value })
        onSelect(value)
        log(`Selected: ${value}`)
      } catch (err) {
        log(`Selection failed: ${err instanceof Error ? err.message : String(err)}`)
      }
    } else {
      onSelect(value)
    }
  }

  return (
    <div className="port-selection" data-field-id={fieldId}>
      <h4>{label}</h4>
      {loading ? (
        <p className="no-ports">Loading...</p>
      ) : options.length === 0 ? (
        <p className="no-ports">No options available</p>
      ) : (
        <div className="port-list">
          {options.map(opt => (
            <button
              key={opt.value}
              className={`port-item ${selectedValue === opt.value ? 'selected' : ''}`}
              onClick={() => handleSelect(opt.value)}
            >
              <span className="port-path">{opt.label}</span>
              {opt.description && <span className="port-manufacturer">{opt.description}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

interface StatusFieldProps {
  fieldId: string
  label: string
  pluginId: string
  statusAction: PluginAction
  startAction?: PluginAction
  stopAction?: PluginAction
  refreshMs?: number
  log: (msg: string) => void
}

function StatusField({
  fieldId,
  label,
  pluginId,
  statusAction,
  startAction,
  stopAction,
  refreshMs,
  log,
}: StatusFieldProps) {
  const [status, setStatus] = useState<StatusResponse | null>(null)
  const [loading, setLoading] = useState<string | null>(null)

  const fetchStatus = useCallback(() => {
    callPluginAction(pluginId, statusAction.method, statusAction.path)
      .then(result => {
        const validated = validateStatusResponse(result)
        if (validated.success && validated.data) {
          setStatus(validated.data)
        } else {
          setStatus(null)
        }
      })
      .catch(() => setStatus(null))
  }, [pluginId, statusAction])

  useEffect(() => {
    fetchStatus()
    if (refreshMs && refreshMs > 0) {
      const interval = setInterval(fetchStatus, refreshMs)
      return () => clearInterval(interval)
    }
  }, [fetchStatus, refreshMs])

  const handleStart = async () => {
    if (!startAction) return
    setLoading('start')
    try {
      await callPluginAction(pluginId, startAction.method, startAction.path)
      log('Backend started')
      fetchStatus()
    } catch (err) {
      log(`Failed to start: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setLoading(null)
    }
  }

  const handleStop = async () => {
    if (!stopAction) return
    setLoading('stop')
    try {
      await callPluginAction(pluginId, stopAction.method, stopAction.path)
      log('Backend stopped')
      setStatus({ running: false })
    } catch (err) {
      log(`Failed to stop: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="backend-controls" data-field-id={fieldId}>
      <h4>{label}</h4>
      <div className="backend-status">
        <span className={`status-indicator ${status?.running ? 'running' : 'stopped'}`} />
        <span>{status?.running ? 'Running' : 'Stopped'}</span>
        {status?.wsConnected && <span className="ws-connected">(WebSocket connected)</span>}
      </div>
      <div className="backend-actions">
        {!status?.running && startAction && (
          <button onClick={handleStart} disabled={loading !== null} className="start-backend-button">
            {loading === 'start' ? 'Starting...' : startAction.label}
          </button>
        )}
        {status?.running && stopAction && (
          <button onClick={handleStop} disabled={loading !== null} className="stop-backend-button">
            {loading === 'stop' ? 'Stopping...' : stopAction.label}
          </button>
        )}
      </div>
      {startAction?.description && <p className="backend-note">{startAction.description}</p>}
    </div>
  )
}

// ============================================================================
// Plugin Connect UI (Auto-generated from actions)
// ============================================================================

interface FieldGroup {
  fieldId: string
  label: string
  type: 'select' | 'status'
  sourceAction?: PluginAction
  targetAction?: PluginAction
  statusAction?: PluginAction
  startAction?: PluginAction
  stopAction?: PluginAction
  refreshMs?: number
  requiredForConnect?: boolean
}

function groupActionsByField(actions: PluginAction[]): FieldGroup[] {
  const groups = new Map<string, FieldGroup>()

  for (const action of actions) {
    if (!action.ui || action.ui.display === 'hidden') continue

    const fieldId = action.ui.fieldId || action.path
    let group = groups.get(fieldId)

    if (!group) {
      group = {
        fieldId,
        label: action.ui.fieldLabel || action.label,
        type: action.ui.display.startsWith('status') ? 'status' : 'select',
        requiredForConnect: action.ui.requiredForConnect,
      }
      groups.set(fieldId, group)
    }

    switch (action.ui.display) {
      case 'select-source':
        group.sourceAction = action
        group.label = action.ui.fieldLabel || group.label
        if (action.ui.requiredForConnect) group.requiredForConnect = true
        break
      case 'select-target':
        group.targetAction = action
        break
      case 'status':
        group.statusAction = action
        group.refreshMs = action.ui.refreshMs
        group.label = action.ui.fieldLabel || group.label
        break
      case 'status-start':
        group.startAction = action
        break
      case 'status-stop':
        group.stopAction = action
        break
    }
  }

  return Array.from(groups.values())
}

function PluginConnectUI({
  plugin,
  onConnect,
  onCancel,
  log,
}: {
  plugin: BackendPluginInfo
  onConnect: (connection: TransportConnection, label: string) => void
  onCancel: () => void
  log: (msg: string) => void
}) {
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedValues, setSelectedValues] = useState<Record<string, string>>({})

  const fieldGroups = groupActionsByField(plugin.actions)

  const handleSelect = (fieldId: string, value: string) => {
    setSelectedValues(prev => ({ ...prev, [fieldId]: value }))
  }

  const handleConnect = async () => {
    setLoading('connect')
    setError(null)
    try {
      await selectPlugin(plugin.id)
      const connection = new BackendConnection()
      await connection.connect()
      await connection.requestConnect()
      onConnect(connection, plugin.name)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg)
      log(`Connection failed: ${msg}`)
    } finally {
      setLoading(null)
    }
  }

  // Check if all required fields are satisfied
  const isConnectDisabled = () => {
    if (loading !== null) return true
    for (const group of fieldGroups) {
      if (group.requiredForConnect && group.type === 'select') {
        if (!selectedValues[group.fieldId]) return true
      }
    }
    return false
  }

  return (
    <div className="plugin-connect-ui">
      {error && <div className="error-message">{error}</div>}

      {/* Render dynamic form fields */}
      {fieldGroups.map(group => {
        if (group.type === 'select' && group.sourceAction) {
          return (
            <SelectField
              key={group.fieldId}
              fieldId={group.fieldId}
              label={group.label}
              pluginId={plugin.id}
              sourceAction={group.sourceAction}
              targetAction={group.targetAction}
              selectedValue={selectedValues[group.fieldId] || null}
              onSelect={value => handleSelect(group.fieldId, value)}
              log={log}
            />
          )
        }

        if (group.type === 'status' && group.statusAction) {
          return (
            <StatusField
              key={group.fieldId}
              fieldId={group.fieldId}
              label={group.label}
              pluginId={plugin.id}
              statusAction={group.statusAction}
              startAction={group.startAction}
              stopAction={group.stopAction}
              refreshMs={group.refreshMs}
              log={log}
            />
          )
        }

        return null
      })}

      {/* Connect/Cancel buttons */}
      <div className="connect-actions">
        <button className="cancel-button" onClick={onCancel} disabled={loading !== null}>
          Cancel
        </button>
        <button className="connect-button" onClick={handleConnect} disabled={isConnectDisabled()}>
          {loading === 'connect' ? 'Connecting...' : 'Connect'}
        </button>
      </div>
    </div>
  )
}

// ============================================================================
// Main Modal Component
// ============================================================================

export function BackendTransportModal({ onConnect, onClose, log }: BackendTransportModalProps) {
  const [plugins, setPlugins] = useState<BackendPluginInfo[]>([])
  const [selectedPlugin, setSelectedPlugin] = useState<BackendPluginInfo | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchBackendPlugins()
      .then(setPlugins)
      .finally(() => setLoading(false))
  }, [])

  const handlePluginSelect = (plugin: BackendPluginInfo) => {
    setSelectedPlugin(plugin)
  }

  const handleBack = () => {
    setSelectedPlugin(null)
  }

  const handleConnect = (connection: TransportConnection, label: string) => {
    onConnect(connection, label)
    onClose()
  }

  return (
    <div className="transport-overlay" onClick={onClose}>
      <div className="transport-modal" onClick={e => e.stopPropagation()}>
        <div className="transport-modal-header">
          <h2>
            {selectedPlugin ? (
              <>
                <button className="back-button" onClick={handleBack}>
                  &larr;
                </button>
                {selectedPlugin.name}
              </>
            ) : (
              'Select Transport'
            )}
          </h2>
          <button className="close-button" onClick={onClose}>
            &times;
          </button>
        </div>

        <div className="transport-modal-body">
          {loading ? (
            <div className="loading">Loading plugins...</div>
          ) : !selectedPlugin ? (
            // Plugin selection view
            <div className="plugin-list">
              {plugins.length === 0 ? (
                <div className="no-plugins">No plugins available. Start the backend server.</div>
              ) : (
                plugins.map(plugin => (
                  <button
                    key={plugin.id}
                    className={`plugin-card ${!plugin.isAvailable ? 'unavailable' : ''}`}
                    style={{ borderLeftColor: plugin.color, borderLeftWidth: '3px' }}
                    onClick={() => handlePluginSelect(plugin)}
                    disabled={!plugin.isAvailable}
                  >
                    <div className="plugin-icon">
                      <PluginIcon icon={plugin.icon} color={plugin.color} />
                    </div>
                    <div className="plugin-info">
                      <div className="plugin-name">{plugin.name}</div>
                      <div className="plugin-description">{plugin.description}</div>
                      {!plugin.isAvailable && <div className="plugin-unavailable">Not available</div>}
                    </div>
                  </button>
                ))
              )}
            </div>
          ) : (
            <PluginConnectUI plugin={selectedPlugin} onConnect={handleConnect} onCancel={handleBack} log={log} />
          )}
        </div>
      </div>
    </div>
  )
}
