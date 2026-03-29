/**
 * Project state management hook.
 * Handles services, functions, variables, tests, and scenarios.
 */

import { useState, useRef } from 'react'
import type { Schema, Service, UserFunction, UserVariable, UserTest, Scenario, DeviceSettings } from '../types'
import type { ProjectData } from '../lib/schemaIO'
import { importProject, downloadProject, pickAndImportProject, DEFAULT_DEVICE_SETTINGS } from '../lib/schemaIO'
import { MAX_SERVICES } from '../lib/constants'
import defaultProjectJson from '../data/defaultProject.json'

function genId() {
  return crypto.randomUUID()
}

function createEmptyService(): Service {
  return { id: genId(), uuid: '', tag: '', characteristics: [] }
}

function loadDefaultProject(): ProjectData {
  return importProject(JSON.stringify(defaultProjectJson))
}

export function useProject(log: (msg: string) => void) {
  const defaultData = loadDefaultProject()

  const [deviceSettings, setDeviceSettings] = useState<DeviceSettings>(
    defaultData.deviceSettings ?? DEFAULT_DEVICE_SETTINGS
  )
  const [services, setServices] = useState<Schema>(defaultData.services)
  const [functions, setFunctions] = useState<UserFunction[]>(defaultData.functions)
  const [variables, setVariables] = useState<UserVariable[]>(defaultData.variables)
  const [tests, setTests] = useState<UserTest[]>(defaultData.tests)
  const [scenarios, setScenarios] = useState<Scenario[]>(defaultData.scenarios)

  // Refs for runtime access to latest state
  const scenariosRef = useRef(scenarios)
  scenariosRef.current = scenarios
  const functionsRef = useRef(functions)
  functionsRef.current = functions
  const variablesRef = useRef(variables)
  variablesRef.current = variables

  // Service management
  function addService() {
    if (services.length >= MAX_SERVICES) return
    setServices([...services, createEmptyService()])
  }

  function updateService(id: string, updated: Service) {
    setServices(services.map(s => (s.id === id ? updated : s)))
  }

  function removeService(id: string) {
    setServices(services.filter(s => s.id !== id))
  }

  // Import/Export
  async function handleImport() {
    try {
      const project = await pickAndImportProject()
      setDeviceSettings(project.deviceSettings)
      setServices(project.services)
      if (project.functions.length > 0) setFunctions(project.functions)
      if (project.variables.length > 0) setVariables(project.variables)
      if (project.tests.length > 0) setTests(project.tests)
      if (project.scenarios.length > 0) setScenarios(project.scenarios)
      log(
        `Imported: ${project.services.length} service(s), ${project.functions.length} function(s), ${project.variables.length} variable(s), ${project.tests.length} test(s), ${project.scenarios.length} scenario(s)`
      )
    } catch (err) {
      if ((err as Error).message !== 'No file selected') {
        log(`Import failed: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
  }

  function handleExport() {
    downloadProject({ deviceSettings, services, functions, variables, tests, scenarios })
    log('Project exported')
  }

  return {
    // State
    deviceSettings,
    services,
    functions,
    variables,
    tests,
    scenarios,

    // Setters
    setDeviceSettings,
    setServices,
    setFunctions,
    setVariables,
    setTests,
    setScenarios,

    // Refs for runtime
    scenariosRef,
    functionsRef,
    variablesRef,

    // Service helpers
    addService,
    updateService,
    removeService,

    // Import/Export
    handleImport,
    handleExport,
  }
}
