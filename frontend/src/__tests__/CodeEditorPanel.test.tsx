/**
 * Tests for CodeEditorPanel component.
 * Tests tab switching, duplicate name detection, and basic rendering.
 * Note: CodeMirror is mocked as it requires browser APIs.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { UserFunction, UserVariable, UserTest, Scenario, Schema } from '../types'
import { SettingsProvider } from '../hooks/useSettings'

// Mock CodeMirror hook since it requires browser APIs
vi.mock('../hooks/useCodeMirror', () => ({
  useCodeMirror: vi.fn(),
}))

// Mock the themes
vi.mock('../themes', () => ({
  themes: {
    'Default Dark': [],
  },
  themeNames: ['Default Dark'],
}))

// Import after mocks are set up
import { CodeEditorPanel } from '../components/CodeEditorPanel'

const defaultProps = {
  functions: [] as UserFunction[],
  variables: [] as UserVariable[],
  tests: [] as UserTest[],
  scenarios: [] as Scenario[],
  services: [] as Schema,
  onFunctionsChange: vi.fn(),
  onVariablesChange: vi.fn(),
  onTestsChange: vi.fn(),
  onScenariosChange: vi.fn(),
  fnLog: vi.fn(),
}

function renderWithSettings(ui: React.ReactElement) {
  return render(<SettingsProvider>{ui}</SettingsProvider>)
}

describe('CodeEditorPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('tab switching', () => {
    it('should render all tabs', () => {
      renderWithSettings(<CodeEditorPanel {...defaultProps} />)

      expect(screen.getByText('Scenarios')).toBeInTheDocument()
      expect(screen.getByText('Functions')).toBeInTheDocument()
      expect(screen.getByText('Variables')).toBeInTheDocument()
      expect(screen.getByText('Test')).toBeInTheDocument()
    })

    it('should start on Scenarios tab', () => {
      renderWithSettings(<CodeEditorPanel {...defaultProps} />)

      const scenariosTab = screen.getByText('Scenarios')
      expect(scenariosTab.className).toContain('tab--active')
    })

    it('should switch to Functions tab on click', () => {
      renderWithSettings(<CodeEditorPanel {...defaultProps} />)

      fireEvent.click(screen.getByText('Functions'))

      const functionsTab = screen.getByText('Functions')
      expect(functionsTab.className).toContain('tab--active')
    })

    it('should switch to Variables tab on click', () => {
      renderWithSettings(<CodeEditorPanel {...defaultProps} />)

      fireEvent.click(screen.getByText('Variables'))

      const variablesTab = screen.getByText('Variables')
      expect(variablesTab.className).toContain('tab--active')
    })

    it('should switch to Test tab on click', () => {
      renderWithSettings(<CodeEditorPanel {...defaultProps} />)

      fireEvent.click(screen.getByText('Test'))

      const testTab = screen.getByText('Test')
      expect(testTab.className).toContain('tab--active')
    })
  })

  describe('add buttons', () => {
    it('should show Add Function button in Functions tab', () => {
      renderWithSettings(<CodeEditorPanel {...defaultProps} />)

      fireEvent.click(screen.getByText('Functions'))

      expect(screen.getByText('+ Add Function')).toBeInTheDocument()
    })

    it('should call onFunctionsChange when Add Function clicked', () => {
      const onFunctionsChange = vi.fn()
      renderWithSettings(<CodeEditorPanel {...defaultProps} onFunctionsChange={onFunctionsChange} />)

      fireEvent.click(screen.getByText('Functions'))
      fireEvent.click(screen.getByText('+ Add Function'))

      expect(onFunctionsChange).toHaveBeenCalledTimes(1)
      const newFunctions = onFunctionsChange.mock.calls[0][0]
      expect(newFunctions).toHaveLength(1)
      expect(newFunctions[0].name).toBe('')
      expect(newFunctions[0].body).toBe('')
    })

    it('should show Add Variable button in Variables tab', () => {
      renderWithSettings(<CodeEditorPanel {...defaultProps} />)

      fireEvent.click(screen.getByText('Variables'))

      expect(screen.getByText('+ Add Variable')).toBeInTheDocument()
    })

    it('should call onVariablesChange when Add Variable clicked', () => {
      const onVariablesChange = vi.fn()
      renderWithSettings(<CodeEditorPanel {...defaultProps} onVariablesChange={onVariablesChange} />)

      fireEvent.click(screen.getByText('Variables'))
      fireEvent.click(screen.getByText('+ Add Variable'))

      expect(onVariablesChange).toHaveBeenCalledTimes(1)
      const newVariables = onVariablesChange.mock.calls[0][0]
      expect(newVariables).toHaveLength(1)
      expect(newVariables[0].name).toBe('')
      expect(newVariables[0].type).toBe('hex')
    })
  })

  describe('header', () => {
    it('should render panel header', () => {
      renderWithSettings(<CodeEditorPanel {...defaultProps} />)

      expect(screen.getByText('Code Editor')).toBeInTheDocument()
    })
  })
})

describe('findDuplicateNames (via component behavior)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should detect duplicate function names', () => {
    const functions: UserFunction[] = [
      { id: '1', name: 'duplicate', body: '' },
      { id: '2', name: 'duplicate', body: '' },
      { id: '3', name: 'unique', body: '' },
    ]

    const { container } = renderWithSettings(<CodeEditorPanel {...defaultProps} functions={functions} />)

    fireEvent.click(screen.getByText('Functions'))

    // Both 'duplicate' name inputs should have error class
    const errorInputs = container.querySelectorAll('.fn-name-input.input--error')
    expect(errorInputs.length).toBe(2)
  })

  it('should detect duplicate variable names', () => {
    const variables: UserVariable[] = [
      { id: '1', name: 'dup', type: 'u8', initialValue: '0' },
      { id: '2', name: 'dup', type: 'u16', initialValue: '0' },
    ]

    const { container } = renderWithSettings(<CodeEditorPanel {...defaultProps} variables={variables} />)

    fireEvent.click(screen.getByText('Variables'))

    const errorInputs = container.querySelectorAll('.var-name-input.input--error')
    expect(errorInputs.length).toBe(2)
  })

  it('should not flag unique names as duplicates', () => {
    const functions: UserFunction[] = [
      { id: '1', name: 'fn1', body: '' },
      { id: '2', name: 'fn2', body: '' },
    ]

    const { container } = renderWithSettings(<CodeEditorPanel {...defaultProps} functions={functions} />)

    fireEvent.click(screen.getByText('Functions'))

    const errorInputs = container.querySelectorAll('.fn-name-input.input--error')
    expect(errorInputs.length).toBe(0)
  })

  it('should not flag empty names as duplicates', () => {
    const functions: UserFunction[] = [
      { id: '1', name: '', body: '' },
      { id: '2', name: '', body: '' },
    ]

    const { container } = renderWithSettings(<CodeEditorPanel {...defaultProps} functions={functions} />)

    fireEvent.click(screen.getByText('Functions'))

    const errorInputs = container.querySelectorAll('.fn-name-input.input--error')
    expect(errorInputs.length).toBe(0)
  })
})

describe('variable type handling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should render hex input for hex type variables', () => {
    const variables: UserVariable[] = [{ id: '1', name: 'buf', type: 'hex', initialValue: 'AA BB' }]

    renderWithSettings(<CodeEditorPanel {...defaultProps} variables={variables} />)

    fireEvent.click(screen.getByText('Variables'))

    // Should have hex-input class
    expect(document.querySelector('.hex-input')).toBeInTheDocument()
  })

  it('should render text input for numeric type variables', () => {
    const variables: UserVariable[] = [{ id: '1', name: 'num', type: 'u8', initialValue: '42' }]

    renderWithSettings(<CodeEditorPanel {...defaultProps} variables={variables} />)

    fireEvent.click(screen.getByText('Variables'))

    // Should have var-value-input class
    expect(document.querySelector('.var-value-input')).toBeInTheDocument()
  })

  it('should show type selector for variables', () => {
    const variables: UserVariable[] = [{ id: '1', name: 'test', type: 'u8', initialValue: '0' }]

    renderWithSettings(<CodeEditorPanel {...defaultProps} variables={variables} />)

    fireEvent.click(screen.getByText('Variables'))

    // Should have a select element with var type options
    const select = document.querySelector('select.select')
    expect(select).toBeInTheDocument()
  })
})
