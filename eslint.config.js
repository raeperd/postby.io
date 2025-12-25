import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import eslintPluginAstro from 'eslint-plugin-astro';

export default tseslint.config(
  {
    ignores: ['dist/', 'node_modules/', '**/*.d.ts', 'coverage/', '.astro/'],
  },
  eslint.configs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
  },
  // TypeScript configuration
  {
    files: ['**/*.ts', '**/*.tsx'],
    extends: [tseslint.configs.recommended],
    rules: {
      // Relax some strict TypeScript rules
      '@typescript-eslint/no-unused-vars': 'warn',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  // Astro configuration
  ...eslintPluginAstro.configs.recommended,
  {
    files: ['*.astro'],
    rules: {
      // Keep the unused CSS variables rule as requested
      'astro/no-unused-define-vars-in-style': 'error',
      // Allow some flexibility in Astro components
      '@typescript-eslint/no-unused-vars': 'warn',
    },
  }
);
