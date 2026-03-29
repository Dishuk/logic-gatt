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
  const { logs, log, clear, ref: logRef } = useLogger()
  const { logs: fnLogs, log: fnLog, clear: fnClear, ref: fnLogRef } = useLogger()

  // Project state
  const project = useProject(log)

  // Transport connection
  const transport = useTransport({ log, fnLog })

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
      log(`Loaded example: ${example.name}`)
    } catch (err) {
      log(`Failed to load example: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return (
    <ErrorBoundary>
      <div className="layout">
        <TopBar
          portName={transport.portName}
          uploading={transport.uploading}
          running={transport.running}
          uploadDisabled={transport.uploading || project.services.length === 0 || !transport.port}
          onConnect={transport.connect}
          onUpload={handleUpload}
          onStop={transport.handleStop}
          onImport={project.handleImport}
          onExport={project.handleExport}
          onLoadExample={handleLoadExample}
          examples={EXAMPLE_PROJECTS}
          log={log}
        />
        <div className="panels">
          <ServicesPanel
            deviceSettings={project.deviceSettings}
            onDeviceSettingsChange={project.setDeviceSettings}
            services={project.services}
            onAdd={project.addService}
            onChange={project.updateService}
            onRemove={project.removeService}
          />
          <CodeEditorPanel
            functions={project.functions}
            variables={project.variables}
            tests={project.tests}
            scenarios={project.scenarios}
            services={project.services}
            onFunctionsChange={project.setFunctions}
            onVariablesChange={project.setVariables}
            onTestsChange={project.setTests}
            onScenariosChange={project.setScenarios}
            fnLog={fnLog}
            onRunScenario={transport.runScenario}
            isRunning={transport.running}
          />
        </div>
        <Terminal
          deviceLogs={logs}
          deviceLogRef={logRef}
          onClearDevice={clear}
          fnLogs={fnLogs}
          fnLogRef={fnLogRef}
          onClearFn={fnClear}
        />
      </div>
    </ErrorBoundary>
  )
}
