// clean.js
// Cross-platform script to clean build artifacts

import { rimrafSync } from 'rimraf'
import path from 'path'

const root = path.resolve(import.meta.dirname, '../..')

rimrafSync(path.join(root, 'backend/dist'))
rimrafSync(path.join(root, 'shared/dist'))
rimrafSync(path.join(root, 'frontend/dist'))

console.log('Cleaned all build artifacts')
