import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
  },
  // ── Clean-architecture layer boundaries ─────────────────────────────
  // Dependency rule (inner ← outer): domain ← application/infrastructure
  // ← presentation ← app. Inner layers must never import outward.
  {
    files: ['src/domain/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          group: ['@/app/*', '@/application/*', '@/infrastructure/*', '@/presentation/*'],
          message: 'domain/ is the innermost layer — it may only import from domain/ and shared/.',
        }],
      }],
    },
  },
  {
    files: ['src/application/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          group: ['@/app/*', '@/presentation/*'],
          message: 'application/ must not depend on the UI — move shared types into domain/ instead.',
        }],
      }],
    },
  },
  {
    files: ['src/infrastructure/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          group: ['@/app/*', '@/application/*', '@/presentation/*'],
          message: 'infrastructure/ may only depend on domain/ and shared/.',
        }],
      }],
    },
  },
])
