import { useState } from 'react'
import type { Service, Characteristic } from '../types'
import { Card, CardHeader, CardBody } from './Card'
import { CharacteristicRow } from './CharacteristicRow'
import { UuidInput } from './UuidInput'
import { MAX_CHARS_PER_SERVICE } from '../lib/constants'

interface ServiceCardProps {
  service: Service
  onChange: (service: Service) => void
  onRemove: () => void
  dupUuids: Set<string>
}

function createCharacteristic(): Characteristic {
  return {
    id: crypto.randomUUID(),
    uuid: '',
    tag: '',
    properties: { read: false, write: false, notify: false },
    defaultValue: '',
  }
}

export function ServiceCard({ service, onChange, onRemove, dupUuids }: ServiceCardProps) {
  const [collapsed, setCollapsed] = useState(false)

  function addCharacteristic() {
    if (service.characteristics.length >= MAX_CHARS_PER_SERVICE) return
    onChange({ ...service, characteristics: [...service.characteristics, createCharacteristic()] })
  }

  function updateCharacteristic(id: string, updated: Characteristic) {
    onChange({
      ...service,
      characteristics: service.characteristics.map(c => (c.id === id ? updated : c)),
    })
  }

  function removeCharacteristic(id: string) {
    onChange({
      ...service,
      characteristics: service.characteristics.filter(c => c.id !== id),
    })
  }

  return (
    <Card>
      <CardHeader
        title="Service"
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed(!collapsed)}
        onRemove={onRemove}
      >
        <UuidInput
          value={service.uuid}
          isDuplicate={dupUuids.has(service.uuid)}
          onChange={uuid => onChange({ ...service, uuid })}
        />
        <span className="char-field-label">Tag</span>
        <input
          className="name-input"
          type="text"
          placeholder="Optional"
          value={service.tag}
          onChange={e => onChange({ ...service, tag: e.target.value })}
        />
      </CardHeader>
      {!collapsed && (
        <CardBody>
          {service.characteristics.map(char => (
            <CharacteristicRow
              key={char.id}
              characteristic={char}
              onChange={updated => updateCharacteristic(char.id, updated)}
              onRemove={() => removeCharacteristic(char.id)}
              dupUuids={dupUuids}
            />
          ))}
          {service.characteristics.length < MAX_CHARS_PER_SERVICE && (
            <button className="add-btn" onClick={addCharacteristic}>
              + Add Characteristic
            </button>
          )}
        </CardBody>
      )}
    </Card>
  )
}
