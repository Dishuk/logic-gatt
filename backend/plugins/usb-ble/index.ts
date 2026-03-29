/**
 * USB BLE Plugin Backend
 *
 * Manages a Python backend that implements BLE GATT server using the 'bless' library.
 * This plugin spawns and manages the Python process, and forwards WebSocket messages
 * between the frontend and the Python backend.
 */

import { ChildProcess, spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import WebSocket from 'ws'
import type { Request, Response } from 'express'
import { PluginBase } from '@logic-gatt/shared'
import type { PluginContext, PluginRoute, Schema, DeviceSettings } from '@logic-gatt/shared'

const PYTHON_WS_PORT = 8765
const PYTHON_WS_URL = `ws://localhost:${PYTHON_WS_PORT}`
const CONNECTION_TIMEOUT_MS = 5000
/** Longer timeout for Python backend (process + BLE stack overhead) */
const ACK_TIMEOUT_MS = 5000
/** How long to wait for Python process to start before connecting */
const PYTHON_STARTUP_DELAY_MS = 1500
/** Polling interval when waiting for connection to complete */
const CONNECTION_POLL_INTERVAL_MS = 100
/** Timeout for SIGTERM before sending SIGKILL */
const PROCESS_KILL_TIMEOUT_MS = 3000

interface PythonMessage {
  type: string
  requestId?: string
  [key: string]: unknown
}

interface PendingRequest {
  resolve: () => void
  reject: (err: Error) => void
  timeoutId: ReturnType<typeof setTimeout>
}

export default class UsbBlePlugin extends PluginBase {
  private pythonProcess: ChildProcess | null = null
  private pythonWs: WebSocket | null = null
  private schema: Schema | null = null
  private pendingRequests = new Map<string, PendingRequest>()
  private pythonBackendPath: string
  private isConnecting = false
  private isUploading = false
  private requestIdCounter = 0

  constructor(context: PluginContext) {
    super(context)
    // Python backend is in python/ folder within this plugin
    this.pythonBackendPath = path.join(context.pluginDir, 'python')
  }

  private generateRequestId(): string {
    return `req-${++this.requestIdCounter}-${Date.now()}`
  }

  async onLoad(): Promise<void> {
    this.ctx.log('USB BLE plugin loaded')
    this.ctx.log(`Python backend path: ${this.pythonBackendPath}`)
  }

  async onUnload(): Promise<void> {
    await this.cleanup()
    this.ctx.log('USB BLE plugin unloaded')
  }

  isAvailable(): boolean {
    return true
  }

  getRoutes(): PluginRoute[] {
    return [
      {
        method: 'GET',
        path: '/status',
        label: 'Backend Status',
        description: 'Get Python backend process status',
        ui: {
          display: 'status',
          fieldId: 'backend',
          fieldLabel: 'Python Backend',
          refreshMs: 2000,
        },
        handler: async (_req: Request, res: Response) => {
          const isRunning = this.pythonProcess !== null && !this.pythonProcess.killed
          const isConnected = this.pythonWs !== null && this.pythonWs.readyState === WebSocket.OPEN
          // Return in standard format: {running, ...extra}
          res.json({
            running: isRunning,
            wsConnected: isConnected,
            pid: this.pythonProcess?.pid,
          })
        },
      },
      {
        method: 'POST',
        path: '/start-backend',
        label: 'Start Backend',
        description: 'Start the Python BLE backend process',
        ui: {
          display: 'status-start',
          fieldId: 'backend',
        },
        handler: async (_req: Request, res: Response) => {
          try {
            await this.startPythonBackend()
            res.json({ success: true, running: true })
          } catch (err) {
            res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to start backend' })
          }
        },
      },
      {
        method: 'POST',
        path: '/stop-backend',
        label: 'Stop Backend',
        description: 'Stop the Python BLE backend process',
        ui: {
          display: 'status-stop',
          fieldId: 'backend',
        },
        handler: async (_req: Request, res: Response) => {
          try {
            await this.stopPythonBackend()
            res.json({ success: true, running: false })
          } catch (err) {
            res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to stop backend' })
          }
        },
      },
    ]
  }

  async onUploadSchema(schema: Schema, settings: DeviceSettings): Promise<void> {
    if (this.isUploading) {
      throw new Error('Schema upload already in progress')
    }

    this.isUploading = true

    try {
      this.schema = schema

      // Ensure Python backend is running
      if (!this.pythonWs || this.pythonWs.readyState !== WebSocket.OPEN) {
        this.ctx.log('Starting Python backend...')
        await this.startPythonBackend()
      }

      // Convert schema to Python backend format
    const backendSchema = {
      services: schema.services.map((svc) => ({
        uuid: svc.uuid,
        characteristics: svc.characteristics.map((chr) => ({
          uuid: chr.uuid,
          properties: chr.properties,
          defaultValue: chr.defaultValue,
        })),
      })),
    }

    // Upload schema to Python backend
    this.ctx.log('Uploading schema to Python backend...')
    await this.sendToPython({
      type: 'upload-schema',
      requestId: this.generateRequestId(),
      schema: backendSchema,
      settings: {
        deviceName: settings.deviceName,
        appearance: settings.appearance ?? 0,
        manufacturerData: settings.manufacturerData ?? [],
      },
    })
    this.ctx.log('Schema uploaded to Python backend')

    // Start advertising
    this.ctx.log('Starting BLE advertising...')
    await this.sendToPython({
      type: 'start-advertising',
      requestId: this.generateRequestId(),
    })
    this.ctx.log(`Advertising as "${settings.deviceName}"`)
    } finally {
      this.isUploading = false
    }
  }

  async onConnect(): Promise<void> {
    // Ensure Python backend is running and connected
    if (!this.pythonWs || this.pythonWs.readyState !== WebSocket.OPEN) {
      this.ctx.log('Starting Python backend for connect...')
      await this.startPythonBackend()
    }
    this.ctx.broadcast({ type: 'connected' })
  }

  async onDisconnect(): Promise<void> {
    if (this.pythonWs && this.pythonWs.readyState === WebSocket.OPEN) {
      try {
        this.pythonWs.send(JSON.stringify({ type: 'disconnect', requestId: this.generateRequestId() }))
      } catch (err) {
        this.ctx.log(`Disconnect send failed (socket may be closed): ${err instanceof Error ? err.message : err}`)
      }
    }
    this.ctx.broadcast({ type: 'disconnected' })
  }

  async onNotify(serviceUuid: string, charUuid: string, data: Uint8Array): Promise<void> {
    if (!this.pythonWs || this.pythonWs.readyState !== WebSocket.OPEN) {
      throw new Error('Python backend not connected')
    }

    await this.sendToPython({
      type: 'notify',
      requestId: this.generateRequestId(),
      serviceUuid,
      charUuid,
      data: Array.from(data),
    })
  }

  async onRespondToRead(serviceUuid: string, charUuid: string, data: Uint8Array): Promise<void> {
    if (!this.pythonWs || this.pythonWs.readyState !== WebSocket.OPEN) {
      throw new Error('Python backend not connected')
    }

    await this.sendToPython({
      type: 'respond-to-read',
      requestId: this.generateRequestId(),
      serviceUuid,
      charUuid,
      data: Array.from(data),
    })
  }

  private async startPythonBackend(): Promise<void> {
    // Prevent concurrent connection attempts
    if (this.isConnecting) {
      this.ctx.log('Connection already in progress, waiting...')
      // Wait for connection to complete (with timeout)
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          clearInterval(checkInterval)
          reject(new Error('Timeout waiting for connection to complete'))
        }, CONNECTION_TIMEOUT_MS)

        const checkInterval = setInterval(() => {
          if (!this.isConnecting) {
            clearInterval(checkInterval)
            clearTimeout(timeout)
            resolve()
          }
        }, CONNECTION_POLL_INTERVAL_MS)
      })
      return
    }

    if (this.pythonProcess && !this.pythonProcess.killed) {
      this.ctx.log('Python backend already running')
      // Just ensure WebSocket connection
      if (!this.pythonWs || this.pythonWs.readyState !== WebSocket.OPEN) {
        await this.connectToPythonWs()
      }
      return
    }

    this.isConnecting = true

    try {
      this.ctx.log('Starting Python backend process...')

      // Spawn Python process
      // Use venv if available, otherwise system python
      const venvPython = process.platform === 'win32'
        ? path.join(this.pythonBackendPath, 'venv', 'Scripts', 'python.exe')
        : path.join(this.pythonBackendPath, 'venv', 'bin', 'python')

      const pythonCmd = fs.existsSync(venvPython) ? venvPython : 'python3'
      const mainScript = path.join(this.pythonBackendPath, 'main.py')

      this.pythonProcess = spawn(pythonCmd, [mainScript], {
        cwd: this.pythonBackendPath,
        stdio: ['ignore', 'pipe', 'pipe'],
      })

      this.pythonProcess.stdout?.on('data', (data: Buffer) => {
        const lines = data.toString().trim().split('\n')
        for (const line of lines) {
          this.ctx.log(`[Python] ${line}`)
        }
      })

      this.pythonProcess.stderr?.on('data', (data: Buffer) => {
        const lines = data.toString().trim().split('\n')
        for (const line of lines) {
          this.ctx.log(`[Python ERR] ${line}`)
        }
      })

      this.pythonProcess.on('exit', (code) => {
        this.ctx.log(`Python backend exited with code ${code}`)
        this.pythonProcess = null
        if (this.pythonWs) {
          this.pythonWs.close()
          this.pythonWs = null
        }
        this.clearPendingRequests(new Error('Python backend exited'))
        this.ctx.broadcast({ type: 'disconnected', reason: 'Python backend exited' })
      })

      this.pythonProcess.on('error', (err) => {
        this.ctx.log(`Python backend error: ${err.message}`)
        this.pythonProcess = null
      })

      // Wait for Python to start up
      await new Promise((r) => setTimeout(r, PYTHON_STARTUP_DELAY_MS))

      // Connect to Python WebSocket
      await this.connectToPythonWs()
    } finally {
      this.isConnecting = false
    }
  }

  private clearPendingRequests(error: Error): void {
    for (const [, request] of this.pendingRequests) {
      clearTimeout(request.timeoutId)
      request.reject(error)
    }
    this.pendingRequests.clear()
  }

  private async connectToPythonWs(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ctx.log(`Connecting to Python WebSocket at ${PYTHON_WS_URL}...`)

      const ws = new WebSocket(PYTHON_WS_URL)

      const timeout = setTimeout(() => {
        ws.close()
        reject(new Error('Python WebSocket connection timeout'))
      }, CONNECTION_TIMEOUT_MS)

      ws.on('open', () => {
        clearTimeout(timeout)
        this.ctx.log('Connected to Python backend WebSocket')
        this.pythonWs = ws
        resolve()
      })

      ws.on('error', (err) => {
        clearTimeout(timeout)
        reject(new Error(`Python WebSocket error: ${err.message}`))
      })

      ws.on('close', () => {
        this.ctx.log('Python WebSocket closed')
        this.pythonWs = null
        // Clear pending requests on WS close
        this.clearPendingRequests(new Error('WebSocket connection closed'))
      })

      ws.on('message', (data: Buffer) => {
        try {
          const msg: PythonMessage = JSON.parse(data.toString())
          this.handlePythonMessage(msg)
        } catch (err) {
          this.ctx.log(`Failed to parse Python message: ${err}`)
        }
      })
    })
  }

  private handlePythonMessage(msg: PythonMessage): void {
    switch (msg.type) {
      case 'ack':
      case 'nack': {
        const pending = this.pendingRequests.get(msg.requestId || '')
        if (pending) {
          this.pendingRequests.delete(msg.requestId || '')
          if (msg.type === 'ack') {
            pending.resolve()
          } else {
            pending.reject(new Error((msg.error as string) || 'NACK'))
          }
        }
        break
      }

      case 'pong':
        // Heartbeat response
        break

      case 'char-write-event':
        this.ctx.broadcast({
          type: 'char-write',
          serviceUuid: msg.serviceUuid as string,
          charUuid: msg.charUuid as string,
          data: msg.data as number[],
        })
        break

      case 'char-read-event':
        this.ctx.broadcast({
          type: 'char-read',
          serviceUuid: msg.serviceUuid as string,
          charUuid: msg.charUuid as string,
        })
        break

      case 'connected':
        this.ctx.broadcast({ type: 'connected' })
        break

      case 'disconnected':
        this.ctx.broadcast({ type: 'disconnected', reason: msg.reason as string | undefined })
        break

      case 'error':
        this.ctx.broadcast({ type: 'error', message: msg.message as string })
        break

      default:
        this.ctx.log(`Unknown Python message type: ${msg.type}`)
    }
  }

  private async sendToPython(msg: PythonMessage): Promise<void> {
    if (!this.pythonWs || this.pythonWs.readyState !== WebSocket.OPEN) {
      throw new Error('Python WebSocket not connected')
    }

    return new Promise((resolve, reject) => {
      const requestId = msg.requestId || this.generateRequestId()
      msg.requestId = requestId

      const timeoutId = setTimeout(() => {
        this.pendingRequests.delete(requestId)
        reject(new Error(`Timeout waiting for ACK (${msg.type})`))
      }, ACK_TIMEOUT_MS)

      this.pendingRequests.set(requestId, {
        resolve: () => {
          clearTimeout(timeoutId)
          resolve()
        },
        reject: (err) => {
          clearTimeout(timeoutId)
          reject(err)
        },
        timeoutId,
      })

      this.pythonWs!.send(JSON.stringify(msg))
    })
  }

  private async stopPythonBackend(): Promise<void> {
    if (this.pythonWs) {
      try {
        this.pythonWs.close()
      } catch (err) {
        this.ctx.log(`WebSocket close failed: ${err instanceof Error ? err.message : err}`)
      }
      this.pythonWs = null
    }

    if (this.pythonProcess && !this.pythonProcess.killed) {
      this.ctx.log('Stopping Python backend process...')
      this.pythonProcess.kill('SIGTERM')
      // Wait for process to exit
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          if (this.pythonProcess && !this.pythonProcess.killed) {
            this.pythonProcess.kill('SIGKILL')
          }
          resolve()
        }, PROCESS_KILL_TIMEOUT_MS)

        this.pythonProcess!.once('exit', () => {
          clearTimeout(timeout)
          resolve()
        })
      })
      this.pythonProcess = null
      this.ctx.log('Python backend stopped')
    }
  }

  private async cleanup(): Promise<void> {
    this.clearPendingRequests(new Error('Plugin unloaded'))
    await this.stopPythonBackend()
  }
}
