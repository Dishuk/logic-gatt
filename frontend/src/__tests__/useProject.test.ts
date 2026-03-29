/**
 * Tests for useProject hook.
 * Tests project state management, service operations, and import/export.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useProject } from '../hooks/useProject'
import { TriggerKind } from '../types'
import type { Scenario } from '../types'

describe('useProject', () => {
  const mockLog = vi.fn()

  beforeEach(() => {
    mockLog.mockClear()
  })

  describe('initial state', () => {
    it('should load default project on init', () => {
      const { result } = renderHook(() => useProject(mockLog))

      // Should have default services from defaultProject.json
      expect(result.current.services.length).toBeGreaterThan(0)
      expect(result.current.functions.length).toBeGreaterThan(0)
      expect(result.current.variables.length).toBeGreaterThan(0)
    })

    it('should have device settings', () => {
      const { result } = renderHook(() => useProject(mockLog))

      expect(result.current.deviceSettings).toBeDefined()
      expect(result.current.deviceSettings.deviceName).toBeDefined()
    })

    it('should provide refs for runtime access', () => {
      const { result } = renderHook(() => useProject(mockLog))

      expect(result.current.scenariosRef).toBeDefined()
      expect(result.current.functionsRef).toBeDefined()
      expect(result.current.variablesRef).toBeDefined()
    })
  })

  describe('service management', () => {
    it('should add a new service', () => {
      const { result } = renderHook(() => useProject(mockLog))
      const initialCount = result.current.services.length

      act(() => {
        result.current.addService()
      })

      expect(result.current.services.length).toBe(initialCount + 1)
    })

    it('should not add more than 8 services', () => {
      const { result } = renderHook(() => useProject(mockLog))

      // Add services until we hit the limit
      act(() => {
        for (let i = 0; i < 15; i++) {
          result.current.addService()
        }
      })

      expect(result.current.services.length).toBeLessThanOrEqual(8)
    })

    it('should update a service', () => {
      const { result } = renderHook(() => useProject(mockLog))
      const serviceId = result.current.services[0].id
      const newUuid = 'updated-uuid-12345678'

      act(() => {
        result.current.updateService(serviceId, {
          ...result.current.services[0],
          uuid: newUuid,
        })
      })

      const updatedService = result.current.services.find(s => s.id === serviceId)
      expect(updatedService?.uuid).toBe(newUuid)
    })

    it('should remove a service', () => {
      const { result } = renderHook(() => useProject(mockLog))
      const initialCount = result.current.services.length
      const serviceId = result.current.services[0].id

      act(() => {
        result.current.removeService(serviceId)
      })

      expect(result.current.services.length).toBe(initialCount - 1)
      expect(result.current.services.find(s => s.id === serviceId)).toBeUndefined()
    })

    it('should generate unique IDs for new services', () => {
      const { result } = renderHook(() => useProject(mockLog))

      act(() => {
        result.current.addService()
        result.current.addService()
      })

      const ids = result.current.services.map(s => s.id)
      const uniqueIds = new Set(ids)
      expect(uniqueIds.size).toBe(ids.length)
    })
  })

  describe('setters', () => {
    it('should update device settings', () => {
      const { result } = renderHook(() => useProject(mockLog))

      act(() => {
        result.current.setDeviceSettings({
          deviceName: 'new-device-name',
          appearance: 0x1234,
          manufacturerData: 'AA BB',
        })
      })

      expect(result.current.deviceSettings.deviceName).toBe('new-device-name')
      expect(result.current.deviceSettings.appearance).toBe(0x1234)
    })

    it('should update functions', () => {
      const { result } = renderHook(() => useProject(mockLog))
      const newFunctions = [{ id: 'new-fn', name: 'testFn', body: 'return input;' }]

      act(() => {
        result.current.setFunctions(newFunctions)
      })

      expect(result.current.functions).toEqual(newFunctions)
    })

    it('should update variables', () => {
      const { result } = renderHook(() => useProject(mockLog))
      const newVariables = [{ id: 'new-var', name: 'testVar', type: 'u8' as const, initialValue: '42' }]

      act(() => {
        result.current.setVariables(newVariables)
      })

      expect(result.current.variables).toEqual(newVariables)
    })

    it('should update tests', () => {
      const { result } = renderHook(() => useProject(mockLog))
      const newTests = [{ id: 'test-1', name: 'Test 1', functionId: 'fn-1', inputHex: 'AA', expectedHex: 'BB' }]

      act(() => {
        result.current.setTests(newTests)
      })

      expect(result.current.tests).toEqual(newTests)
    })

    it('should update scenarios', () => {
      const { result } = renderHook(() => useProject(mockLog))
      const newScenarios: Scenario[] = [
        {
          id: 'scenario-1',
          name: 'Test Scenario',
          enabled: true,
          trigger: { kind: TriggerKind.Startup },
          steps: [],
        },
      ]

      act(() => {
        result.current.setScenarios(newScenarios)
      })

      expect(result.current.scenarios).toEqual(newScenarios)
    })
  })

  describe('refs sync', () => {
    it('should keep scenariosRef in sync with state', () => {
      const { result } = renderHook(() => useProject(mockLog))
      const newScenarios: Scenario[] = [
        {
          id: 'scenario-1',
          name: 'New Scenario',
          enabled: true,
          trigger: { kind: TriggerKind.Startup },
          steps: [],
        },
      ]

      act(() => {
        result.current.setScenarios(newScenarios)
      })

      expect(result.current.scenariosRef.current).toEqual(newScenarios)
    })

    it('should keep functionsRef in sync with state', () => {
      const { result } = renderHook(() => useProject(mockLog))
      const newFunctions = [{ id: 'fn-1', name: 'newFn', body: 'return null;' }]

      act(() => {
        result.current.setFunctions(newFunctions)
      })

      expect(result.current.functionsRef.current).toEqual(newFunctions)
    })

    it('should keep variablesRef in sync with state', () => {
      const { result } = renderHook(() => useProject(mockLog))
      const newVariables = [{ id: 'var-1', name: 'newVar', type: 'string' as const, initialValue: 'test' }]

      act(() => {
        result.current.setVariables(newVariables)
      })

      expect(result.current.variablesRef.current).toEqual(newVariables)
    })
  })
})

describe('useProject edge cases', () => {
  const mockLog = vi.fn()

  it('should handle updating non-existent service gracefully', () => {
    const { result } = renderHook(() => useProject(mockLog))
    const originalServices = [...result.current.services]

    act(() => {
      result.current.updateService('non-existent-id', {
        id: 'non-existent-id',
        uuid: 'test',
        tag: 'test',
        characteristics: [],
      })
    })

    // Should not change anything
    expect(result.current.services.length).toBe(originalServices.length)
  })

  it('should handle removing non-existent service gracefully', () => {
    const { result } = renderHook(() => useProject(mockLog))
    const originalCount = result.current.services.length

    act(() => {
      result.current.removeService('non-existent-id')
    })

    expect(result.current.services.length).toBe(originalCount)
  })

  it('should create services with empty characteristics', () => {
    const { result } = renderHook(() => useProject(mockLog))

    act(() => {
      // Clear existing services first
      result.current.setServices([])
    })

    act(() => {
      result.current.addService()
    })

    const newService = result.current.services[0]
    expect(newService.characteristics).toEqual([])
    expect(newService.uuid).toBe('')
    expect(newService.tag).toBe('')
  })
})
