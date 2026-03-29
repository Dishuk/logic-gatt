import { useState, useMemo, useRef, useCallback, useEffect } from 'react'
import type { UserFunction, UserVariable, UserTest, VarType, Scenario, Schema } from '../types'
import { useCodeMirror } from '../hooks/useCodeMirror'
import { useSettings } from '../hooks/useSettings'
import { createCompletionSource } from '../lib/completions'
import type { CompletionContext, CompletionResult } from '@codemirror/autocomplete'
import { themes, themeNames } from '../themes'
import { Card, CardHeader, CardBody } from './Card'
import { HexByteInput } from './HexByteInput'
import { TestPanel } from './TestPanel'
import { ScenariosPanel } from './ScenariosPanel'
import { EditorView } from '@codemirror/view'
import { EditorState, Compartment } from '@codemirror/state'
import type { Extension } from '@codemirror/state'
import { javascript } from '@codemirror/lang-javascript'
import { basicSetup } from 'codemirror'
import { GripVertical } from 'lucide-react'
import type { DragEndEvent } from '@dnd-kit/core'
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

const VAR_TYPES: VarType[] = ['hex', 'u8', 'u16', 'u32', 'string']

const PREVIEW_CODE = `// Theme preview
  const counter = ctx.getVar("count");
  ctx.setVar("count", counter + 1);

  if (input.length > 0) {
    console.log("Received:", input);
  }

  return new Uint8Array([0xAC, 0x4B]);
`

function ThemePreview({ theme }: { theme: Extension }) {
  const ref = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const themeCompartment = useRef(new Compartment())

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const view = new EditorView({
      state: EditorState.create({
        doc: PREVIEW_CODE,
        extensions: [
          basicSetup,
          javascript(),
          themeCompartment.current.of(theme),
          EditorView.editable.of(false),
          EditorView.lineWrapping,
        ],
      }),
      parent: el,
    })

    viewRef.current = view
    return () => {
      view.destroy()
      viewRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    view.dispatch({ effects: themeCompartment.current.reconfigure(theme) })
  }, [theme])

  return <div ref={ref} className="theme-preview" />
}

interface CodeEditorPanelProps {
  functions: UserFunction[]
  variables: UserVariable[]
  tests: UserTest[]
  scenarios: Scenario[]
  services: Schema
  onFunctionsChange: (fns: UserFunction[]) => void
  onVariablesChange: (vars: UserVariable[]) => void
  onTestsChange: (tests: UserTest[]) => void
  onScenariosChange: (scenarios: Scenario[]) => void
  fnLog: (msg: string) => void
  onRunScenario?: (scenario: Scenario) => void
  isRunning?: boolean
}

function SortableFnEntry({
  fn,
  onChange,
  onRemove,
  isDuplicate,
  completionSource,
  theme,
}: {
  fn: UserFunction
  onChange: (fn: UserFunction) => void
  onRemove: () => void
  isDuplicate: boolean
  completionSource: (ctx: CompletionContext) => CompletionResult | null
  theme: Extension
}) {
  const [collapsed, setCollapsed] = useState(false)
  const editorRef = useRef<HTMLDivElement>(null)
  useCodeMirror(
    editorRef,
    fn.body,
    useCallback((body: string) => onChange({ ...fn, body }), [fn, onChange]),
    completionSource,
    theme
  )

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: fn.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 1 : 0,
    position: 'relative' as const,
  }

  return (
    <div ref={setNodeRef} style={style}>
      <Card>
        <CardHeader
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed(!collapsed)}
          variant="code"
          onRemove={onRemove}
        >
          <span className="card-drag-handle" {...attributes} {...listeners}>
            <GripVertical size={14} />
          </span>
          <span className="fn-keyword">function </span>
          <input
            className={`fn-name-input${isDuplicate ? ' input--error' : ''}`}
            value={fn.name}
            onChange={e => onChange({ ...fn, name: e.target.value })}
            placeholder="name"
            title={isDuplicate ? 'Duplicate function name' : undefined}
            onClick={e => e.stopPropagation()}
          />
          <span className="fn-signature">(input: Uint8Array): Uint8Array</span>
          <span className="fn-keyword"> {'{'}</span>
        </CardHeader>
        <div className="fn-card-body" style={{ display: collapsed ? 'none' : undefined }}>
          <div ref={editorRef} className="code-editor" />
        </div>
        {!collapsed && <div className="fn-card-footer">{'}'}</div>}
      </Card>
    </div>
  )
}

function SortableVarEntry({
  v,
  onChange,
  onRemove,
  isDuplicate,
}: {
  v: UserVariable
  onChange: (v: UserVariable) => void
  onRemove: () => void
  isDuplicate: boolean
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: v.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 1 : 0,
    position: 'relative' as const,
  }

  return (
    <div ref={setNodeRef} style={style}>
      <Card>
        <CardHeader variant="code" noBorder onRemove={onRemove}>
          <span className="card-drag-handle" {...attributes} {...listeners}>
            <GripVertical size={14} />
          </span>
          <span className="fn-keyword">let </span>
          <input
            className={`var-name-input${isDuplicate ? ' input--error' : ''}`}
            value={v.name}
            onChange={e => onChange({ ...v, name: e.target.value })}
            placeholder="name"
            title={isDuplicate ? 'Duplicate variable name' : undefined}
          />
          <select
            className="select"
            value={v.type}
            onChange={e => onChange({ ...v, type: e.target.value as VarType, initialValue: '' })}
          >
            {VAR_TYPES.map(t => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <span className="fn-keyword"> = </span>
          {v.type === 'hex' ? (
            <HexByteInput
              value={v.initialValue}
              onChange={initialValue => onChange({ ...v, initialValue })}
              placeholder="FF FF FF (optional)"
            />
          ) : (
            <input
              className="var-value-input"
              value={v.initialValue}
              onChange={e => onChange({ ...v, initialValue: e.target.value })}
              placeholder={v.type === 'string' ? 'text value' : '0'}
            />
          )}
        </CardHeader>
      </Card>
    </div>
  )
}

function findDuplicateNames(items: { name: string }[]): Set<string> {
  const seen = new Map<string, number>()
  for (const item of items) {
    if (item.name) seen.set(item.name, (seen.get(item.name) ?? 0) + 1)
  }
  const dupes = new Set<string>()
  for (const [name, count] of seen) {
    if (count > 1) dupes.add(name)
  }
  return dupes
}

export function CodeEditorPanel({
  functions,
  variables,
  tests,
  scenarios,
  services,
  onFunctionsChange,
  onVariablesChange,
  onTestsChange,
  onScenariosChange,
  fnLog,
  onRunScenario,
  isRunning,
}: CodeEditorPanelProps) {
  const { settings, setSetting } = useSettings()
  const themeExtension = useMemo(() => themes[settings.editorTheme] ?? themes['Default Dark'], [settings.editorTheme])
  const [tab, setTab] = useState<'scenarios' | 'functions' | 'variables' | 'test' | 'settings'>('scenarios')

  const dupFnNames = useMemo(() => findDuplicateNames(functions), [functions])
  const dupVarNames = useMemo(() => findDuplicateNames(variables), [variables])
  const completionSource = useMemo(
    () =>
      createCompletionSource(
        functions.map(f => f.name),
        variables.map(v => v.name)
      ),
    [functions, variables]
  )

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  function handleFnDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (over && active.id !== over.id) {
      const oldIndex = functions.findIndex(f => f.id === active.id)
      const newIndex = functions.findIndex(f => f.id === over.id)
      onFunctionsChange(arrayMove(functions, oldIndex, newIndex))
    }
  }

  function handleVarDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (over && active.id !== over.id) {
      const oldIndex = variables.findIndex(v => v.id === active.id)
      const newIndex = variables.findIndex(v => v.id === over.id)
      onVariablesChange(arrayMove(variables, oldIndex, newIndex))
    }
  }

  function addFunction() {
    onFunctionsChange([...functions, { id: crypto.randomUUID(), name: '', body: '' }])
  }

  function addVariable() {
    onVariablesChange([...variables, { id: crypto.randomUUID(), name: '', type: 'hex', initialValue: '' }])
  }

  return (
    <div className="panel-right">
      <div className="panel-header">Code Editor</div>
      <div className="panel-content panel-content--tabs">
        <div className="editor-tabs">
          <button className={`tab${tab === 'scenarios' ? ' tab--active' : ''}`} onClick={() => setTab('scenarios')}>
            Scenarios
          </button>
          <button className={`tab${tab === 'functions' ? ' tab--active' : ''}`} onClick={() => setTab('functions')}>
            Functions
          </button>
          <button className={`tab${tab === 'variables' ? ' tab--active' : ''}`} onClick={() => setTab('variables')}>
            Variables
          </button>
          <button className={`tab${tab === 'test' ? ' tab--active' : ''}`} onClick={() => setTab('test')}>
            Test
          </button>
          <button className={`tab${tab === 'settings' ? ' tab--active' : ''}`} onClick={() => setTab('settings')}>
            Settings
          </button>
        </div>
        <div className="editor-tab-content">
          <div style={{ display: tab === 'scenarios' ? undefined : 'none' }}>
            <ScenariosPanel
              scenarios={scenarios}
              onScenariosChange={onScenariosChange}
              services={services}
              functions={functions}
              onRunScenario={onRunScenario}
              isRunning={isRunning}
            />
          </div>
          <div style={{ display: tab === 'functions' ? undefined : 'none' }}>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleFnDragEnd}>
              <SortableContext items={functions.map(f => f.id)} strategy={verticalListSortingStrategy}>
                {functions.map((fn, i) => (
                  <SortableFnEntry
                    key={fn.id}
                    fn={fn}
                    isDuplicate={dupFnNames.has(fn.name)}
                    completionSource={completionSource}
                    theme={themeExtension}
                    onChange={updated => onFunctionsChange(functions.map((f, j) => (j === i ? updated : f)))}
                    onRemove={() => onFunctionsChange(functions.filter((_, j) => j !== i))}
                  />
                ))}
              </SortableContext>
            </DndContext>
            <button className="add-btn" onClick={addFunction}>
              + Add Function
            </button>
          </div>
          <div style={{ display: tab === 'variables' ? undefined : 'none' }}>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleVarDragEnd}>
              <SortableContext items={variables.map(v => v.id)} strategy={verticalListSortingStrategy}>
                {variables.map((v, i) => (
                  <SortableVarEntry
                    key={v.id}
                    v={v}
                    isDuplicate={dupVarNames.has(v.name)}
                    onChange={updated => onVariablesChange(variables.map((x, j) => (j === i ? updated : x)))}
                    onRemove={() => onVariablesChange(variables.filter((_, j) => j !== i))}
                  />
                ))}
              </SortableContext>
            </DndContext>
            <button className="add-btn" onClick={addVariable}>
              + Add Variable
            </button>
          </div>
          <div style={{ display: tab === 'test' ? undefined : 'none' }}>
            <TestPanel
              functions={functions}
              variables={variables}
              tests={tests}
              onVariablesChange={onVariablesChange}
              onTestsChange={onTestsChange}
              fnLog={fnLog}
            />
          </div>
          <div className="settings-tab" style={{ display: tab === 'settings' ? undefined : 'none' }}>
            <Card>
              <CardHeader title="Editor Theme" noBorder />
              <CardBody>
                <select
                  className="select w-full"
                  value={settings.editorTheme}
                  onChange={e => setSetting('editorTheme', e.target.value)}
                >
                  {themeNames.map(name => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
                <ThemePreview theme={themeExtension} />
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Runtime" noBorder />
              <CardBody>
                <label className="settings-checkbox">
                  <input
                    type="checkbox"
                    checked={settings.resetVariablesOnDisconnect}
                    disabled
                    onChange={e => setSetting('resetVariablesOnDisconnect', e.target.checked)}
                  />
                  Reset variables on disconnect
                  <span className="settings-hint">(coming soon)</span>
                </label>
              </CardBody>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
