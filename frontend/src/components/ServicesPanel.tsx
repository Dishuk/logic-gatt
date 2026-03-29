import type { Service, DeviceSettings } from '../types'
import { ServiceCard } from './ServiceCard'
import { DeviceSettingsCard } from './DeviceSettingsCard'
import { ValidationProvider } from '../contexts'
import { MAX_SERVICES } from '../lib/constants'

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
  return (
    <div className="panel-left">
      <div className="panel-header">
        <span>
          Services ({services.length}/{MAX_SERVICES})
        </span>
      </div>
      <div className="panel-content panel-content--scroll">
        <DeviceSettingsCard settings={deviceSettings} onChange={setDeviceSettings} />
        <ValidationProvider services={services}>
          {services.map(service => (
            <ServiceCard
              key={service.id}
              service={service}
              onChange={updated => updateService(service.id, updated)}
              onRemove={() => removeService(service.id)}
            />
          ))}
        </ValidationProvider>
        {services.length < MAX_SERVICES && (
          <button className="add-btn" onClick={addService}>
            + Add Service
          </button>
        )}
      </div>
    </div>
  )
}
