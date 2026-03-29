# Logic Constructor — Design Document

## Overview

The Logic Constructor turns the frontend into a programmable "brain" for the BLE device. Users build **scenarios** — event-driven pipelines that define how the device reacts to BLE reads, writes, and timers. Data flows through user-defined **functions**, is stored in **variables**, and results are sent back as BLE notifications.

```
BLE Write (Char A)
  → Backend Plugin → Frontend
  → Scenario triggers
  → User function(s) execute
  → Result stored in variable / sent as notification (Char B)
  → Backend Plugin → BLE Notify
```

## Scripting Language

User-defined function bodies are written in **TypeScript**. The frontend compiles TS to JS at runtime using the browser-bundled TypeScript compiler (`typescript` npm package, `ts.transpileModule`). This gives users type safety and autocomplete in the code editor at near-zero cost — the compiler is ~2 MB gzipped and transpilation of small function bodies is effectively instant.

If TypeScript proves problematic (bundle size, edge-case transpilation issues), the fallback is plain JavaScript — the runtime sandbox accepts JS directly, so dropping TS only removes the transpile step.

**Key constraint:** All scenario logic executes in the browser as JS/TS. The backend plugin handles BLE communication — it receives events and sends commands but does not execute scenario logic.

## Core Concepts

### Variables

Global named byte buffers accessible from any function or scenario. **Variables must be declared in the UI before they can be used.** Calling `setVar()` or `getVar()` with an undeclared name throws a runtime error. This keeps all state visible in the variable table — no hidden runtime variables.

| Field          | Type                                          | Description                                                                    |
| -------------- | --------------------------------------------- | ------------------------------------------------------------------------------ |
| `name`         | `string`                                      | Unique identifier (e.g. `counter`, `authToken`)                                |
| `type`         | `"hex" \| "u8" \| "u16" \| "u32" \| "string"` | Determines how the raw bytes are interpreted in the UI and in helper functions |
| `initialValue` | `string`                                      | Hex string (e.g. `"00 00 00 01"`) set on schema load                           |

#### Creation Flow (UI)

1. User opens the **Variables** tab in the right panel.
2. Clicks the **"+ Add Variable"** button at the bottom of the variable table.
3. A new row appears with empty fields:
   - **Name** — text input. Must be unique, non-empty, valid identifier (letters, digits, underscores).
   - **Type** — dropdown: `hex`, `u8`, `u16`, `u32`, `string`. Defaults to `hex`. This affects only how the value is displayed/edited in the UI (e.g. `u16` shows a decimal number input instead of raw hex). At runtime all variables are stored as `Uint8Array`.
   - **Initial Value** — hex byte input (same component used for characteristic default values), or a typed input matching the selected type (e.g. a number field for `u16`).
4. The variable is immediately usable in function bodies via `getVar("name")` / `setVar("name", ...)`.
5. User can delete a variable via the row's delete button. Deleting a variable that is referenced by functions or pipeline steps shows a warning.

#### Runtime Behaviour

- All variables live in a single flat namespace (`Map<string, Uint8Array>`).
- On schema load (or reset), every variable is initialized to its `initialValue`.
- A variable's value persists across scenario invocations until explicitly overwritten or the schema is reset.
- Variables are the **only** way to share state between scenarios (there is no implicit shared memory).
- The variable table shows both **initial** and **current runtime** values side by side. When the current value differs from the initial value, the current value cell is highlighted (e.g. subtle background color change) so the user can immediately spot modified state. A reset button per variable (or a global "reset all") restores current values back to their initial values.

### Functions

Reusable blocks of TypeScript logic. Every function has a **uniform signature**: it accepts a single `Uint8Array` and returns a `Uint8Array`. This is a deliberate constraint — the tool's purpose is BLE behavior emulation, not general-purpose programming. Keeping a single fixed signature means functions compose naturally in pipelines and there are no type-mismatch issues.

When a function needs additional data beyond the input buffer, it reads global variables via `getVar()`.

```ts
interface UserFunction {
  name: string // unique, e.g. "incrementCounter"
  body: string // TypeScript body; `input` is the Uint8Array parameter
}
```

**Function contract:**

- **Input:** `input: Uint8Array` — always provided by the pipeline or by `call()`
- **Output:** must return a `Uint8Array` — this becomes the pipeline's current buffer for the next step

**Available inside function body:**

| API                               | Description                                      |
| --------------------------------- | ------------------------------------------------ |
| `input`                           | The incoming `Uint8Array` buffer                 |
| `getVar(name): Uint8Array`        | Read a global variable                           |
| `setVar(name, value: Uint8Array)` | Write a global variable                          |
| `reader(data)`                    | Create a stateful binary reader (see below)      |
| `writer()`                        | Create a stateful binary writer (see below)      |
| `ctx.log(msg)`                    | Print to the terminal panel                      |
| `ctx.runScenario(name)`           | Queue another scenario to run after this one     |
| `console.log/warn/error/info`     | Print to terminal (mirrors standard console API) |

#### Binary Reader

`reader(data)` creates a reader that auto-advances through the buffer:

```ts
const r = reader(input)

// Fixed-size unsigned integers
const cmd = r.uint8() // read 1 byte
const len = r.uint16LE() // read 2 bytes (little-endian)
const id = r.uint32LE() // read 4 bytes (little-endian)

// Fixed-size signed integers
const temp = r.int8() // signed 8-bit
const offset = r.int16LE() // signed 16-bit little-endian
const delta = r.int32BE() // signed 32-bit big-endian

// Variable-length integers (returns bigint if n > 4)
const value = r.uintLE(3) // read 3 bytes as unsigned LE
const timestamp = r.uintBE(6) // read 6 bytes as unsigned BE (returns bigint)
const signedVal = r.intLE(5) // read 5 bytes as signed LE

// Raw bytes
const payload = r.bytes(len) // read N bytes as Uint8Array

// Utility
r.skip(4) // skip bytes
r.pos // current position (read/write)
r.remaining() // bytes left to read
```

**Available methods:**
| Method | Description |
|--------|-------------|
| `uint8()`, `int8()` | 8-bit unsigned/signed |
| `uint16LE()`, `uint16BE()` | 16-bit unsigned |
| `int16LE()`, `int16BE()` | 16-bit signed |
| `uint32LE()`, `uint32BE()` | 32-bit unsigned |
| `int32LE()`, `int32BE()` | 32-bit signed |
| `uintLE(n)`, `uintBE(n)` | Variable-length unsigned (returns `bigint` if n > 4) |
| `intLE(n)`, `intBE(n)` | Variable-length signed (returns `bigint` if n > 4) |
| `bytes(n)` | Read n bytes as Uint8Array |

#### Binary Writer

`writer()` creates a chainable builder:

```ts
const w = writer()

// Fixed-size integers
w.uint8(0x01).uint16LE(1234).uint32LE(0xdeadbeef).int16BE(-100)

// Variable-length integers
w.uintLE(0x123456, 3) // write 3 bytes
w.uintBE(0x123456789abcn, 6) // write 6 bytes (bigint)
w.intLE(-1000, 3) // write signed value

// Raw bytes
w.bytes([0xaa, 0xbb])
w.bytes(input) // append buffer

return w.build() // returns Uint8Array
```

**Available methods:**
| Method | Description |
|--------|-------------|
| `uint8(v)`, `int8(v)` | 8-bit unsigned/signed |
| `uint16LE(v)`, `uint16BE(v)` | 16-bit unsigned |
| `int16LE(v)`, `int16BE(v)` | 16-bit signed |
| `uint32LE(v)`, `uint32BE(v)` | 32-bit unsigned |
| `int32LE(v)`, `int32BE(v)` | 32-bit signed |
| `uintLE(v, n)`, `uintBE(v, n)` | Variable-length unsigned |
| `intLE(v, n)`, `intBE(v, n)` | Variable-length signed |
| `bytes(data)` | Write Uint8Array or number[] |
| `build()` | Return final Uint8Array |

Functions run in a sandboxed scope — no access to DOM, fetch, or global JS objects.

### Scenarios

A scenario binds a **trigger** to a **pipeline** of steps.

```ts
interface Scenario {
  id: string
  name: string
  enabled: boolean
  trigger: Trigger
  steps: Step[]
}
```

#### Triggers

A trigger defines _when_ the scenario executes.

| Trigger type | Fields                          | Fires when…                                         |
| ------------ | ------------------------------- | --------------------------------------------------- |
| `char-write` | `serviceUuid`, `charUuid`       | A BLE client writes to the specified characteristic |
| `char-read`  | `serviceUuid`, `charUuid`       | A BLE client reads the specified characteristic     |
| `timer`      | `intervalMs`, `repeat: boolean` | A timer elapses (one-shot or repeating)             |
| `startup`    | —                               | The schema is loaded / device connects              |
| `manual`     | —                               | User manually triggers via UI button                |

For `char-write` and `char-read`, the incoming bytes are available as the pipeline's **input buffer**.

#### Steps (Pipeline)

Steps execute sequentially. Each step receives the output of the previous step as its input buffer (the first step receives the trigger's input buffer).

| Step type       | Fields                    | Behaviour                                                                                                                                                                                                                                              |
| --------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `call-function` | `functionName`            | Calls a user function with current buffer as `input`; output becomes next input                                                                                                                                                                        |
| `notify`        | `serviceUuid`, `charUuid` | Sends current buffer as a BLE notification on the specified characteristic; passes buffer through. The UI auto-suggests valid service/characteristic pairs from the current schema. Validates that the characteristic has the NOTIFY property enabled. |
| `respond`       | —                         | Uses current buffer as the read-response value (only valid for `char-read` triggers)                                                                                                                                                                   |

Variable access (`getVar`/`setVar`), conditionals, and logging are handled inside user functions rather than as separate pipeline steps. This keeps the pipeline simple while giving full flexibility in code. Use `ctx.runScenario(name)` to chain scenarios together for complex workflows.

### Example Scenario

**Goal:** When a client writes to Char A, XOR the payload with a stored key, save the result, and notify on Char B.

```
Scenario: "Encrypt and forward"
Trigger:  char-write on service 0xB2BB0000 / char 0xB2BB0001

Steps:
  1. call-function  →  "xorAndForward"   (input = written bytes)
```

Function `xorAndForward`:

```ts
const key = getVar('encryptionKey')
const out = new Uint8Array(input.length)
for (let i = 0; i < input.length; i++) {
  out[i] = input[i] ^ key[i % key.length]
}
setVar('lastEncrypted', out)
notify('b2bb0000-...', 'b2bb0002-...', out)
return out
```

Variable `encryptionKey`: initial value `"AA BB CC DD"`.

## Type Definitions

```ts
/* ---- Variables ---- */
type VarType = 'hex' | 'u8' | 'u16' | 'u32' | 'string'

interface UserVariable {
  id: string
  name: string
  type: VarType
  initialValue: string // hex
}

/* ---- Functions ---- */
interface UserFunction {
  id: string
  name: string
  body: string // `input: Uint8Array` is implicit; must return Uint8Array
}

/* ---- Tests ---- */
interface UserTest {
  id: string
  name: string
  functionId: string
  inputHex: string
  expectedHex: string
}

/* ---- Enums (prevent typos in kind fields) ---- */
enum TriggerKind {
  CharWrite = 'char-write',
  CharRead = 'char-read',
  Timer = 'timer',
  Startup = 'startup',
  Manual = 'manual',
}

enum StepKind {
  CallFunction = 'call-function',
  Notify = 'notify',
  Respond = 'respond',
}

/* ---- Triggers ---- */
interface CharTrigger {
  kind: TriggerKind.CharWrite | TriggerKind.CharRead
  serviceUuid: string
  charUuid: string
}

interface TimerTrigger {
  kind: TriggerKind.Timer
  intervalMs: number
  repeat: boolean
}

interface StartupTrigger {
  kind: TriggerKind.Startup
}

interface ManualTrigger {
  kind: TriggerKind.Manual
}

type Trigger = CharTrigger | TimerTrigger | StartupTrigger | ManualTrigger

/* ---- Steps ---- */
interface CallFunctionStep {
  kind: StepKind.CallFunction
  functionName: string
}

interface NotifyStep {
  kind: StepKind.Notify
  serviceUuid: string
  charUuid: string
}

interface RespondStep {
  kind: StepKind.Respond
}

type Step = CallFunctionStep | NotifyStep | RespondStep

/* ---- Scenario ---- */
interface Scenario {
  id: string
  name: string
  enabled: boolean
  trigger: Trigger
  steps: Step[]
}
```

## Runtime Execution Model

1. **Schema load** — All variables are initialized to their `initialValue`. Scenarios with `startup` triggers fire.
2. **BLE event arrives** — The backend plugin forwards characteristic reads/writes to the frontend, which identifies matching scenarios.
3. **Pipeline execution** — Steps run sequentially within the scenario. The buffer flows from step to step. Errors in a step halt the pipeline and log to the terminal.
4. **Notify steps** — Send the buffer to the backend plugin, which transmits it as a BLE notification on the target characteristic.
5. **Multiple scenarios** — If multiple scenarios match the same trigger, they execute in definition order, each receiving a **copy** of the original input buffer (they do not chain).

## UI Layout

The three-panel layout:

```
┌────────────────────────────────────────────────────────────────────────┐
│ TopBar: [Port] [Upload] [Import] [Export] [Examples] [Run/Stop]        │
├──────────────┬─────────────────────────────────────────────────────────┤
│              │  Tabs: [Scenarios] [Functions] [Variables] [Test] [⚙]   │
│  Services    │                                                         │
│  Panel       │  Active tab content:                                    │
│              │   - Scenario list + step editor                         │
│              │   - Function code editor                                │
│              │   - Variable table                                      │
│              │   - Test runner for functions                           │
│              │   - Settings (theme picker)                             │
├──────────────┴─────────────────────────────────────────────────────────┤
│ Terminal: [Device] [Function]  (dual log views)                        │
└────────────────────────────────────────────────────────────────────────┘
```

### Scenario Editor

Each scenario is a card showing:

- Name (editable)
- Trigger selector (dropdown: characteristic write/read, timer, startup) with relevant fields
- Ordered list of steps, each rendered as a compact row with a type badge
- Drag handle for reordering steps
- "+" button to append a step (opens type picker)
- Enable/disable toggle

### Function Editor

CodeMirror-based editor with:

- Function list with drag-to-reorder
- Syntax highlighting and autocomplete for the sandbox API
- Theme selection in settings tab

### Variable Table

Simple table: Name | Type | Initial Value. Variables can be reordered via drag handles.

### Test Panel

Run functions with test inputs and verify expected outputs:

- Select a function to test
- Provide input as hex bytes
- Specify expected output (optional)
- Run button executes the function and compares results
- Pass/fail indicator shows test status

## Schema Serialization

Functions, variables, tests, and scenarios are included in the exported JSON alongside services:

```json
{
  "services": [ ... ],
  "functions": [ ... ],
  "variables": [ ... ],
  "tests": [ ... ],
  "scenarios": [ ... ]
}
```

Import detects the old format (bare `Service[]` array) for backward compatibility.

## Security Considerations

User function bodies run in a sandboxed Web Worker. The sandbox:

- Provides only the documented API (`getVar`, `setVar`, `reader`, `writer`, etc.)
- Has no access to `window`, `document`, `fetch`, `localStorage`, `WebSocket`, `eval`, or other browser APIs
- Enforces a 5-second execution timeout to prevent infinite loops
- Catches and logs all exceptions without crashing the app
