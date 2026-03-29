import { createContext, useContext, useMemo, type ReactNode } from 'react'
import type { Service } from '../types'

interface ValidationContextValue {
  dupUuids: Set<string>
}

const ValidationContext = createContext<ValidationContextValue | null>(null)

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

interface ValidationProviderProps {
  services: Service[]
  children: ReactNode
}

export function ValidationProvider({ services, children }: ValidationProviderProps) {
  const dupUuids = useMemo(() => findDuplicateUuids(services), [services])
  return <ValidationContext.Provider value={{ dupUuids }}>{children}</ValidationContext.Provider>
}

export function useValidation(): ValidationContextValue {
  const context = useContext(ValidationContext)
  if (!context) {
    throw new Error('useValidation must be used within a ValidationProvider')
  }
  return context
}
