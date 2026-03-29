import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import eslintConfigPrettier from 'eslint-config-prettier'

// tseslint.config() is a helper that merges multiple config objects
export default tseslint.config(
  // ============================================
  // SECTION 1: Ignore patterns
  // ============================================
  // These folders/files won't be linted at all
  { ignores: ['dist', 'node_modules'] },

  // ============================================
  // SECTION 2: Main configuration
  // ============================================
  {
    // Inherit rules from these presets:
    // - js.configs.recommended: basic JS rules (no-unused-vars, no-undef, etc.)
    // - tseslint.configs.recommended: TS-aware rules (replaces some JS rules with smarter versions)
    // - eslintConfigPrettier: disables rules that conflict with Prettier (must be last)
    extends: [js.configs.recommended, ...tseslint.configs.recommended, eslintConfigPrettier],

    // Which files this config applies to
    files: ['**/*.{ts,tsx}'],

    // Parser and environment settings
    languageOptions: {
      ecmaVersion: 2020, // Allow modern JS syntax (optional chaining, nullish coalescing, etc.)
      globals: {
        ...globals.browser, // Define browser globals: window, document, navigator, etc.
      },
    },

    // Register additional plugins
    plugins: {
      'react-hooks': reactHooks,   // Adds react-hooks/* rules
      'react-refresh': reactRefresh, // Adds react-refresh/* rules
    },

    // ============================================
    // SECTION 3: Rules
    // ============================================
    // Rule severity levels:
    //   'off' or 0    - disable the rule
    //   'warn' or 1   - show warning (yellow), doesn't fail build
    //   'error' or 2  - show error (red), fails build
    rules: {
      // ----- React Hooks Rules -----
      // Ensures hooks are only called at top level (not in loops, conditions, nested functions)
      'react-hooks/rules-of-hooks': 'error',

      // Warns when useEffect/useCallback/useMemo dependencies array is missing items
      // This prevents stale closure bugs
      'react-hooks/exhaustive-deps': 'warn',

      // ----- React Refresh Rules -----
      // Warns about components that won't work with Vite's hot reload
      // allowConstantExport: true allows `export const Foo = ...` pattern
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],

      // ----- TypeScript Rules -----
      // Forces using `import type { X }` for type-only imports
      // This helps bundlers tree-shake better and makes intent clear
      '@typescript-eslint/consistent-type-imports': [
        'error',
        {
          prefer: 'type-imports',           // Prefer `import type`
          disallowTypeAnnotations: true,    // Don't allow `import { type X }`
          fixStyle: 'separate-type-imports', // Auto-fix creates separate import statements
        },
      ],

      // Warns when you use `any` type - encourages proper typing
      // Set to 'warn' initially so we can fix gradually
      '@typescript-eslint/no-explicit-any': 'warn',

      // Better unused variable detection than base JS rule
      // Allows unused vars starting with _ (common pattern for intentionally unused params)
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',        // Ignore: function foo(_unused) {}
          varsIgnorePattern: '^_',        // Ignore: const _unused = 5
          caughtErrorsIgnorePattern: '^_', // Ignore: catch (_err) {}
        },
      ],

      // Disable the base JS rule (TS version above handles it)
      'no-unused-vars': 'off',
    },
  }
)
