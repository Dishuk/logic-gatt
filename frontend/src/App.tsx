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
import { SchemaProvider } from './contexts'
import defaultProjectJson from './data/defaultProject.json'
import heartRateMonitorJson from './data/heartRateMonitor.json'

const EXAMPLE_PROJECTS: ExampleProject[] = [
  {
    name: 'Default (Echo)',
    description: 'Simple echo service with reader/writer examples',
    data: defaultProjectJson,
  },
  {
    name: 'Heart Rate Monitor',
    description: 'BLE Heart Rate Profile (0x180D) with measurement, control point, and battery service',
    data: heartRateMonitorJson,
  },
]

export function App() {
  // Logging
  const deviceLogger = useLogger()
  const fnLogger = useLogger()

  // Project state
  const project = useProject(deviceLogger.log)

  // Transport connection
  const transport = useTransport({ log: deviceLogger.log, fnLog: fnLogger.log })

  const handleUpload = () => {
    transport.handleUpload(project.services, project.deviceSettings, {
      getScenarios: () => project.scenariosRef.current,
      getFunctions: () => project.functionsRef.current,
      getVariables: () => project.variablesRef.current,
      setVariables: project.setVariables,
    })
  }

  const handleLoadExample = (example: ExampleProject) => {
    try {
      const data = importProject(JSON.stringify(example.data))
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
          examples={EXAMPLE_PROJECTS}
          onLoadExample={handleLoadExample}
        />
        <div className="panels">
          <ServicesPanel project={project} />
          <SchemaProvider services={project.services} functions={project.functions}>
            <CodeEditorPanel project={project} fnLogger={fnLogger} transport={transport} />
          </SchemaProvider>
        </div>
        <Terminal deviceLogger={deviceLogger} fnLogger={fnLogger} />
      </div>
    </ErrorBoundary>
  )
}
