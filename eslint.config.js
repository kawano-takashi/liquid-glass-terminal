import js from '@eslint/js';
import tseslint from 'typescript-eslint';

const typedConfigs = tseslint.configs.recommendedTypeChecked.map((config) => ({
  ...config,
  files: ['**/*.{ts,tsx}'],
}));

export default tseslint.config(
  { ignores: ['**/.vite/**', 'out/**', 'coverage/**', 'node_modules/**'] },
  {
    ...js.configs.recommended,
    files: ['**/*.{js,mjs}'],
    languageOptions: {
      globals: {
        console: 'readonly',
        process: 'readonly',
        URL: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
      },
    },
  },
  ...typedConfigs,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: false }],
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/unbound-method': 'off',
    },
  },
);
