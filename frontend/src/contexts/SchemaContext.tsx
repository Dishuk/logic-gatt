import { createContext, useContext, type ReactNode } from 'react'
import type { Schema, UserFunction } from '../types'

interface SchemaContextValue {
  services: Schema
  functions: UserFunction[]
}

const SchemaContext = createContext<SchemaContextValue | null>(null)

interface SchemaProviderProps {
  services: Schema
  functions: UserFunction[]
  children: ReactNode
}

export function SchemaProvider({ services, functions, children }: SchemaProviderProps) {
  return <SchemaContext.Provider value={{ services, functions }}>{children}</SchemaContext.Provider>
}

export function useSchema(): SchemaContextValue {
  const context = useContext(SchemaContext)
  if (!context) {
    throw new Error('useSchema must be used within a SchemaProvider')
  }
  return context
}
