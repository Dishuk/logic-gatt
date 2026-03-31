import { useState, useEffect } from 'react'
import { useLogger } from './hooks/useLogger'
import { useProject } from './hooks/useProject'
import { useTransport } from './hooks/useTransport'
import type { ExampleProject } from './components/TopBar'
import { TopBar } from './components/TopBar'
import { ServicesPanel } from './components/ServicesPanel'
import { CodeEditorPanel } from './components/CodeEditorPanel'
import { Terminal } from './components/Terminal'
import { ErrorBoundary } from './components/ErrorBoundary'
import { importProject } from './lib/schemaIO'

// Preset metadata - maps API preset names to display info
const PRESET_INFO: Record<string, { name: string; description: string }> = {
  default: {
    name: 'Default (Echo)',
    description: 'Simple echo service with reader/writer examples',
  },
  'heart-rate-monitor': {
    name: 'Heart Rate Monitor',
    description: 'BLE Heart Rate Profile (0x180D) with measurement, control point, and battery service',
  },
}

export function App() {
  // Logging
  const deviceLogger = useLogger()
  const fnLogger = useLogger()

  // Project state
  const project = useProject(deviceLogger.log)

  // Transport connection
  const transport = useTransport({ log: deviceLogger.log, fnLog: fnLogger.log })

  // Example presets from backend
  const [examples, setExamples] = useState<ExampleProject[]>([])

  // Load preset list from backend
  useEffect(() => {
    async function loadPresetList() {
      try {
        const res = await fetch('/api/presets')
        if (!res.ok) return
        const { presets } = await res.json()
        const exampleList: ExampleProject[] = presets.map((name: string) => {
          const info = PRESET_INFO[name] ?? { name, description: '' }
          return { name: info.name, description: info.description, data: name }
        })
        setExamples(exampleList)
      } catch {
        // Ignore errors, examples dropdown will just be empty
      }
    }
    loadPresetList()
  }, [])

  const handleUpload = () => {
    transport.handleUpload(project.services, project.deviceSettings, {
      getScenarios: () => project.scenariosRef.current,
      getFunctions: () => project.functionsRef.current,
      getVariables: () => project.variablesRef.current,
      setVariables: project.setVariables,
    })
  }

  const handleLoadExample = async (example: ExampleProject) => {
    try {
      // example.data is now the preset name (string)
      const presetName = example.data as string
      const res = await fetch(`/api/presets/${presetName}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      const data = importProject(JSON.stringify(json))
      project.setDeviceSettings(data.deviceSettings)
      project.setServices(data.services)
      project.setFunctions(data.functions)
      project.setVariables(data.variables)
      project.setTests(data.tests)
      project.setScenarios(data.scenarios)
      deviceLogger.log(`Loaded example: ${example.name}`)
    } catch (err) {
      deviceLogger.log(`Failed to load example: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return (
    <ErrorBoundary>
      <div className="layout">
        <TopBar
          transport={transport}
          project={project}
          logger={deviceLogger}
          onUpload={handleUpload}
          examples={examples}
          onLoadExample={handleLoadExample}
        />
        <div className="panels">
          <ServicesPanel project={project} />
          <CodeEditorPanel project={project} fnLogger={fnLogger} transport={transport} />
        </div>
        <Terminal deviceLogger={deviceLogger} fnLogger={fnLogger} />
      </div>
    </ErrorBoundary>
  )
}
