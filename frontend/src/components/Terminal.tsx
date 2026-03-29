import { useState, useRef, useCallback, useEffect, type RefObject } from 'react'
import { Trash2 } from 'lucide-react'

const MIN_HEIGHT = 100
const DEFAULT_HEIGHT = 200

interface TerminalProps {
  deviceLogs: string[]
  deviceLogRef: RefObject<HTMLPreElement | null>
  onClearDevice: () => void
  fnLogs: string[]
  fnLogRef: RefObject<HTMLPreElement | null>
  onClearFn: () => void
}

export function Terminal({ deviceLogs, deviceLogRef, onClearDevice, fnLogs, fnLogRef, onClearFn }: TerminalProps) {
  const [tab, setTab] = useState<'device' | 'functions'>('device')
  const [height, setHeight] = useState(DEFAULT_HEIGHT)
  const isDragging = useRef(false)
  const startY = useRef(0)
  const startHeight = useRef(0)

  const logs = tab === 'device' ? deviceLogs : fnLogs
  const logRef = tab === 'device' ? deviceLogRef : fnLogRef
  const onClear = tab === 'device' ? onClearDevice : onClearFn

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      isDragging.current = true
      startY.current = e.clientY
      startHeight.current = height
      document.body.style.cursor = 'ns-resize'
      document.body.style.userSelect = 'none'
    },
    [height]
  )

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return
      const delta = startY.current - e.clientY
      const maxHeight = window.innerHeight * 0.5
      const newHeight = Math.min(maxHeight, Math.max(MIN_HEIGHT, startHeight.current + delta))
      setHeight(newHeight)
    }

    const handleMouseUp = () => {
      if (isDragging.current) {
        isDragging.current = false
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [])

  return (
    <div className="terminal" style={{ height }}>
      <div className="terminal-resize-handle" onMouseDown={handleMouseDown} />
      <div className="terminal-header">
        <div className="terminal-tabs">
          <button className={`tab${tab === 'device' ? ' tab--active' : ''}`} onClick={() => setTab('device')}>
            Device
          </button>
          <button className={`tab${tab === 'functions' ? ' tab--active' : ''}`} onClick={() => setTab('functions')}>
            Functions
          </button>
        </div>
        <button className="terminal-clear-btn" onClick={onClear} title="Clear terminal">
          <Trash2 size={14} />
        </button>
      </div>
      <pre className="terminal-log" ref={logRef as React.RefObject<HTMLPreElement>}>
        {logs.length === 0
          ? tab === 'device'
            ? 'Ready. Connect to a device and upload a schema.'
            : 'No function logs yet.'
          : logs.join('\n')}
      </pre>
    </div>
  )
}
