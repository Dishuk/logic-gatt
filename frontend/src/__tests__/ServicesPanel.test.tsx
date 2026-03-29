/**
 * Tests for ServicesPanel component.
 * Tests duplicate UUID detection and component rendering.
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ServicesPanel } from '../components/ServicesPanel'
import type { Service, DeviceSettings } from '../types'

// Test the findDuplicateUuids logic by creating test scenarios
function createService(id: string, uuid: string, charUuids: string[] = []): Service {
  return {
    id,
    uuid,
    tag: `Service ${id}`,
    characteristics: charUuids.map((cuuid, i) => ({
      id: `${id}-char-${i}`,
      uuid: cuuid,
      tag: `Char ${i}`,
      properties: { read: true, write: false, notify: false },
      defaultValue: '',
    })),
  }
}

const defaultDeviceSettings: DeviceSettings = {
  deviceName: 'test-device',
  appearance: 0,
  manufacturerData: '',
}

describe('ServicesPanel', () => {
  describe('rendering', () => {
    it('should render with no services', () => {
      render(
        <ServicesPanel
          deviceSettings={defaultDeviceSettings}
          onDeviceSettingsChange={() => {}}
          services={[]}
          onAdd={() => {}}
          onChange={() => {}}
          onRemove={() => {}}
        />
      )

      expect(screen.getByText('Services (0/8)')).toBeInTheDocument()
      expect(screen.getByText('+ Add Service')).toBeInTheDocument()
    })

    it('should render service count correctly', () => {
      const services = [createService('1', 'uuid-1'), createService('2', 'uuid-2')]

      render(
        <ServicesPanel
          deviceSettings={defaultDeviceSettings}
          onDeviceSettingsChange={() => {}}
          services={services}
          onAdd={() => {}}
          onChange={() => {}}
          onRemove={() => {}}
        />
      )

      expect(screen.getByText('Services (2/8)')).toBeInTheDocument()
    })

    it('should hide add button at max services', () => {
      const services = [
        createService('1', 'uuid-1'),
        createService('2', 'uuid-2'),
        createService('3', 'uuid-3'),
        createService('4', 'uuid-4'),
        createService('5', 'uuid-5'),
        createService('6', 'uuid-6'),
        createService('7', 'uuid-7'),
        createService('8', 'uuid-8'),
      ]

      render(
        <ServicesPanel
          deviceSettings={defaultDeviceSettings}
          onDeviceSettingsChange={() => {}}
          services={services}
          onAdd={() => {}}
          onChange={() => {}}
          onRemove={() => {}}
        />
      )

      expect(screen.getByText('Services (8/8)')).toBeInTheDocument()
      expect(screen.queryByText('+ Add Service')).not.toBeInTheDocument()
    })

    it('should call onAdd when add button clicked', () => {
      const onAdd = vi.fn()

      render(
        <ServicesPanel
          deviceSettings={defaultDeviceSettings}
          onDeviceSettingsChange={() => {}}
          services={[]}
          onAdd={onAdd}
          onChange={() => {}}
          onRemove={() => {}}
        />
      )

      fireEvent.click(screen.getByText('+ Add Service'))
      expect(onAdd).toHaveBeenCalledTimes(1)
    })
  })

  describe('device settings', () => {
    it('should render device settings card', () => {
      render(
        <ServicesPanel
          deviceSettings={defaultDeviceSettings}
          onDeviceSettingsChange={() => {}}
          services={[]}
          onAdd={() => {}}
          onChange={() => {}}
          onRemove={() => {}}
        />
      )

      // DeviceSettingsCard should be present
      expect(screen.getByText('Device Settings')).toBeInTheDocument()
    })
  })
})

describe('findDuplicateUuids (via component behavior)', () => {
  // We test the duplicate detection indirectly through component props

  it('should detect no duplicates when all UUIDs are unique', () => {
    const services = [
      createService('1', 'uuid-a', ['char-1', 'char-2']),
      createService('2', 'uuid-b', ['char-3', 'char-4']),
    ]

    const { container } = render(
      <ServicesPanel
        deviceSettings={defaultDeviceSettings}
        onDeviceSettingsChange={() => {}}
        services={services}
        onAdd={() => {}}
        onChange={() => {}}
        onRemove={() => {}}
      />
    )

    // No error classes should be present
    expect(container.querySelectorAll('.input--error')).toHaveLength(0)
  })

  it('should detect duplicate service UUIDs', () => {
    const services = [createService('1', 'duplicate-uuid'), createService('2', 'duplicate-uuid')]

    const { container } = render(
      <ServicesPanel
        deviceSettings={defaultDeviceSettings}
        onDeviceSettingsChange={() => {}}
        services={services}
        onAdd={() => {}}
        onChange={() => {}}
        onRemove={() => {}}
      />
    )

    // Both service UUID inputs should have error class
    const errorInputs = container.querySelectorAll('.input--error')
    expect(errorInputs.length).toBeGreaterThanOrEqual(2)
  })

  it('should detect duplicate characteristic UUIDs across services', () => {
    const services = [
      createService('1', 'svc-1', ['shared-char-uuid']),
      createService('2', 'svc-2', ['shared-char-uuid']),
    ]

    const { container } = render(
      <ServicesPanel
        deviceSettings={defaultDeviceSettings}
        onDeviceSettingsChange={() => {}}
        services={services}
        onAdd={() => {}}
        onChange={() => {}}
        onRemove={() => {}}
      />
    )

    // Characteristic UUID inputs should have error class
    const errorInputs = container.querySelectorAll('.input--error')
    expect(errorInputs.length).toBeGreaterThanOrEqual(2)
  })

  it('should detect duplicate between service and characteristic UUID', () => {
    const services = [createService('1', 'shared-uuid', []), createService('2', 'svc-2', ['shared-uuid'])]

    const { container } = render(
      <ServicesPanel
        deviceSettings={defaultDeviceSettings}
        onDeviceSettingsChange={() => {}}
        services={services}
        onAdd={() => {}}
        onChange={() => {}}
        onRemove={() => {}}
      />
    )

    // Both the service UUID and characteristic UUID should be marked as duplicates
    const errorInputs = container.querySelectorAll('.input--error')
    expect(errorInputs.length).toBeGreaterThanOrEqual(2)
  })

  it('should not flag empty UUIDs as duplicates', () => {
    const services = [createService('1', '', ['', '']), createService('2', '', [''])]

    const { container } = render(
      <ServicesPanel
        deviceSettings={defaultDeviceSettings}
        onDeviceSettingsChange={() => {}}
        services={services}
        onAdd={() => {}}
        onChange={() => {}}
        onRemove={() => {}}
      />
    )

    // Empty UUIDs should not be flagged
    expect(container.querySelectorAll('.input--error')).toHaveLength(0)
  })
})
