export default [{ ignores: ['vendor/**', 'node_modules/**', 'dist/**', 'test-results/**', 'playwright-report/**'] }, {
  files: ['**/*.js'], languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: Object.fromEntries(['window', 'document', 'self', 'Worker', 'URL', 'Blob', 'Option', 'navigator', 'setTimeout', 'clearTimeout', 'console', 'process', 'Buffer'].map(x => [x, 'readonly'])) },
  rules: { 'no-unused-vars': ['error', { caughtErrors: 'none', argsIgnorePattern: '^_' }], 'no-undef': 'error', 'eqeqeq': 'error' }
}];
