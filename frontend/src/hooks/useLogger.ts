import { useState, useRef, useEffect, useCallback } from 'react'

export function useLogger() {
  const [logs, setLogs] = useState<string[]>([])
  const ref = useRef<HTMLPreElement>(null)

  useEffect(() => {
    if (ref.current) {
      ref.current.scrollTop = ref.current.scrollHeight
    }
  }, [logs])

  const log = useCallback((msg: string) => {
    setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`])
  }, [])

  const clear = useCallback(() => setLogs([]), [])

  return { logs, log, clear, ref }
}
