import { useMemo } from 'react'
import type { Service, DeviceSettings } from '../types'
import { ServiceCard } from './ServiceCard'
import { DeviceSettingsCard } from './DeviceSettingsCard'
import { MAX_SERVICES } from '../lib/constants'

function findDuplicateUuids(services: Service[]): Set<string> {
  const seen = new Map<string, number>()
  for (const s of services) {
    if (s.uuid) seen.set(s.uuid, (seen.get(s.uuid) ?? 0) + 1)
    for (const c of s.characteristics) {
      if (c.uuid) seen.set(c.uuid, (seen.get(c.uuid) ?? 0) + 1)
    }
  }
  const dupes = new Set<string>()
  for (const [uuid, count] of seen) {
    if (count > 1) dupes.add(uuid)
  }
  return dupes
}

interface ServicesPanelProps {
  project: {
    deviceSettings: DeviceSettings
    setDeviceSettings: (settings: DeviceSettings) => void
    services: Service[]
    addService: () => void
    updateService: (id: string, updated: Service) => void
    removeService: (id: string) => void
  }
}

export function ServicesPanel({ project }: ServicesPanelProps) {
  const { deviceSettings, setDeviceSettings, services, addService, updateService, removeService } = project
  const dupUuids = useMemo(() => findDuplicateUuids(services), [services])
  return (
    <div className="panel-left">
      <div className="panel-header">
        <span>
          Services ({services.length}/{MAX_SERVICES})
        </span>
      </div>
      <div className="panel-content panel-content--scroll">
        <DeviceSettingsCard settings={deviceSettings} onChange={setDeviceSettings} />
        {services.map(service => (
          <ServiceCard
            key={service.id}
            service={service}
            onChange={updated => updateService(service.id, updated)}
            onRemove={() => removeService(service.id)}
            dupUuids={dupUuids}
          />
        ))}
        {services.length < MAX_SERVICES && (
          <button className="add-btn" onClick={addService}>
            + Add Service
          </button>
        )}
      </div>
    </div>
  )
}
