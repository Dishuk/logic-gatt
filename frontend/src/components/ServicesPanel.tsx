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
  deviceSettings: DeviceSettings
  onDeviceSettingsChange: (settings: DeviceSettings) => void
  services: Service[]
  onAdd: () => void
  onChange: (id: string, updated: Service) => void
  onRemove: (id: string) => void
}

export function ServicesPanel({
  deviceSettings,
  onDeviceSettingsChange,
  services,
  onAdd,
  onChange,
  onRemove,
}: ServicesPanelProps) {
  const dupUuids = useMemo(() => findDuplicateUuids(services), [services])

  return (
    <div className="panel-left">
      <div className="panel-header">
        <span>
          Services ({services.length}/{MAX_SERVICES})
        </span>
      </div>
      <div className="panel-content panel-content--scroll">
        <DeviceSettingsCard settings={deviceSettings} onChange={onDeviceSettingsChange} />
        {services.map(service => (
          <ServiceCard
            key={service.id}
            service={service}
            dupUuids={dupUuids}
            onChange={updated => onChange(service.id, updated)}
            onRemove={() => onRemove(service.id)}
          />
        ))}
        {services.length < MAX_SERVICES && (
          <button className="add-btn" onClick={onAdd}>
            + Add Service
          </button>
        )}
      </div>
    </div>
  )
}
