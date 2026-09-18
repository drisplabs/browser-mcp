import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettierConfig from 'eslint-config-prettier';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  prettierConfig,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Customize rules as needed
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
    },
  },
  {
    // Vitest assertions reference methods without calling them
    // (`expect(puppeteer.launch).toHaveBeenCalled()`). puppeteer-core 25
    // declares `launch`/`connect` as class methods, so passing them unbound
    // trips this rule even though the assertion never invokes them.
    files: ['tests/**/*.ts'],
    rules: {
      '@typescript-eslint/unbound-method': 'off',
    },
  },
  {
    ignores: [
      '.claude/',
      'dist/',
      'node_modules/',
      'scripts/',
      'build/',
      'coverage/',
      '*.js',
      '*.mjs',
      '*.cjs',
    ],
  }
);
