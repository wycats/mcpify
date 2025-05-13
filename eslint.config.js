import typescript from '@typescript-eslint/eslint-plugin';
import typescriptParser from '@typescript-eslint/parser';
import prettier from 'eslint-config-prettier';
import * as importPlugin from 'eslint-plugin-import';

// Configure import plugin rules
const importConfig = {
  plugins: {
    import: importPlugin,
  },
  rules: {
    // Import sorting and organization (these support auto-fix)
    'import/order': [
      'error',
      {
        groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
        'newlines-between': 'always',
        alphabetize: {
          order: 'asc',
          caseInsensitive: true,
        },
      },
    ],
    'import/no-duplicates': 'error',
    'import/newline-after-import': 'error',
    'import/consistent-type-specifier-style': ['error', 'prefer-top-level'],
    'import/no-unresolved': 'off', // TypeScript handles this better
  },
};

export default [
  // Import rules (applied to all files)
  importConfig,

  // Apply TypeScript plugin's recommended configuration for core package
  {
    files: ['packages/core/**/*.ts', 'tests/**/*.ts'],
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        projectService: true,
      },
    },
    plugins: {
      '@typescript-eslint': typescript,
    },
    rules: {
      // Using TypeScript ESLint plugin's recommended, strict, and strict-type-checked rules as a base
      ...typescript.configs['recommended'].rules,
      ...typescript.configs['strict'].rules,
      ...typescript.configs['strict-type-checked'].rules,
      ...typescript.configs['stylistic-type-checked'].rules,

      // Additional strict rules
      'no-var': 'error',
      'prefer-const': 'error',
      eqeqeq: ['error', 'always'],
      'no-console': ['warn', { allow: ['warn', 'error', 'info', 'debug'] }],

      // Additional TypeScript specific rules

      // TypeScript-specific rules
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/explicit-function-return-type': [
        'error',
        {
          allowExpressions: true,
          allowHigherOrderFunctions: true,
          allowTypedFunctionExpressions: true,
        },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        {
          prefer: 'type-imports',
          disallowTypeAnnotations: true,
        },
      ],
      '@typescript-eslint/consistent-type-definitions': ['error', 'interface'],
      '@typescript-eslint/prefer-nullish-coalescing': 'error',
      '@typescript-eslint/prefer-optional-chain': 'error',
      '@typescript-eslint/prefer-ts-expect-error': 'error',
      '@typescript-eslint/no-unnecessary-condition': 'error',
      '@typescript-eslint/ban-ts-comment': [
        'error',
        {
          'ts-expect-error': 'allow-with-description',
          minimumDescriptionLength: 5,
        },
      ],

      // For MCPify, which needs to proxy dynamic content from OpenAPI specs,
      // we need to be more lenient with some type checking rules
      '@typescript-eslint/no-explicit-any': 'error', // Allow any for API proxying
      '@typescript-eslint/no-unsafe-assignment': 'error', // Need for dynamic OpenAPI parsing
      '@typescript-eslint/no-unsafe-call': 'error', // Need for dynamic function calls
      '@typescript-eslint/no-unsafe-member-access': 'error', // Need for dynamic object access
      '@typescript-eslint/no-unsafe-return': 'error', // Need for proxy returns
      '@typescript-eslint/no-unnecessary-condition': 'warn', // Can be overly strict
      '@typescript-eslint/no-unsafe-argument': 'off', // Needed for dynamic API proxying
      '@typescript-eslint/restrict-template-expressions': 'off', // Needed for dynamic URL generation
      '@typescript-eslint/no-misused-promises': 'warn', // Allow async handlers
      '@typescript-eslint/unbound-method': 'warn', // Allow methods as callbacks

      // Environment specific rules
      'no-undef': 'off', // TypeScript already handles this better
      'no-console': ['warn', { allow: ['warn', 'error', 'info', 'debug'] }],
    },
  },

  // Ignore patterns for specific files and directories
  {
    ignores: [
      'node_modules/**',
      '**/node_modules/**',
      '**/dist/**',
      '.vite/**',
      '**/coverage/**',
      '*.js',
      '*.mjs',
      '*.cjs',
      'eslint.config.js',
    ],
  },

  // Apply Prettier config at the end to override formatting rules
  // Apply TypeScript plugin's configuration for demo package
  {
    files: ['packages/demo/**/*.ts', 'packages/demo/**/*.tsx'],
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        project: './packages/demo/tsconfig.json',
      },
    },
    plugins: {
      '@typescript-eslint': typescript,
      import: importPlugin,
    },
    rules: {
      ...typescript.configs['recommended'].rules,
      ...typescript.configs['strict-type-checked'].rules,
      // Additional TypeScript specific rules

      // Less strict rules for demo package
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/restrict-template-expressions': 'off',
      '@typescript-eslint/unbound-method': 'off',
      'no-console': 'off',
    },
  },

  prettier,
];
