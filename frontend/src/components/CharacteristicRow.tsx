import type { Characteristic } from '../types'
import { HexByteInput } from './HexByteInput'
import { UuidInput } from './UuidInput'
import { X } from 'lucide-react'

interface CharacteristicRowProps {
  characteristic: Characteristic
  dupUuids: Set<string>
  onChange: (c: Characteristic) => void
  onRemove: () => void
}

export function CharacteristicRow({ characteristic, dupUuids, onChange, onRemove }: CharacteristicRowProps) {
  const { properties } = characteristic

  function toggleProp(prop: keyof typeof properties) {
    onChange({ ...characteristic, properties: { ...properties, [prop]: !properties[prop] } })
  }

  return (
    <div className="char-row">
      <div className="char-row-top">
        <span className="card-title">Char</span>
        <UuidInput
          value={characteristic.uuid}
          isDuplicate={dupUuids.has(characteristic.uuid)}
          onChange={uuid => onChange({ ...characteristic, uuid })}
        />
        <span className="char-field-label">Tag</span>
        <input
          className="name-input"
          type="text"
          placeholder="Optional"
          value={characteristic.tag}
          onChange={e => onChange({ ...characteristic, tag: e.target.value })}
        />
        <div className="char-props">
          <label>
            <input type="checkbox" checked={properties.read} onChange={() => toggleProp('read')} />
            <span>R</span>
          </label>
          <label>
            <input type="checkbox" checked={properties.write} onChange={() => toggleProp('write')} />
            <span>W</span>
          </label>
          <label>
            <input type="checkbox" checked={properties.notify} onChange={() => toggleProp('notify')} />
            <span>N</span>
          </label>
        </div>
        <button className="remove-btn" onClick={onRemove}>
          <X size={14} />
        </button>
      </div>
      <div className="char-row-bottom">
        <span className="card-title">Default</span>
        <HexByteInput
          value={characteristic.defaultValue}
          onChange={v => onChange({ ...characteristic, defaultValue: v })}
        />
      </div>
    </div>
  )
}
