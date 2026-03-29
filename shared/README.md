# Shared

Shared TypeScript types used by frontend, backend, and plugins.

## Contents

- **Schema types** — `Schema`, `ServiceDef`, `CharacteristicDef`, `DeviceSettings`
- **Plugin events** — `PluginEvent` (backend → frontend)
- **Plugin commands** — `PluginCommand` (frontend → backend)
- **Plugin SDK** — `PluginBase`, `PluginContext`, `PluginManifest`

## Usage

```typescript
import { Schema, PluginEvent, PluginBase } from 'logic-gatt-shared'
```

## Setup

```bash
npm install
npm run build
```

## Scripts

| Script | Description |
|--------|-------------|
| `npm run build` | Compile TypeScript to dist/ |
| `npm run clean` | Remove dist folder |
