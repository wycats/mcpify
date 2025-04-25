import js from '@eslint/js';
import typescript from '@typescript-eslint/eslint-plugin';
import typescriptParser from '@typescript-eslint/parser';
import prettier from 'eslint-config-prettier';

export default [
  // Base ESLint recommended rules
  js.configs.recommended,
  
  // Apply TypeScript plugin's recommended configuration
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        project: './tsconfig.json',
      },
    },
    plugins: {
      '@typescript-eslint': typescript,
    },
    rules: {
      // Using TypeScript ESLint plugin's recommended and strict rules as a base
      ...typescript.configs['recommended'].rules,
      ...typescript.configs['strict'].rules,
      
      // Additional strict rules
      'no-var': 'error',
      'prefer-const': 'error',
      'eqeqeq': ['error', 'always'],
      'no-console': ['warn', { allow: ['warn', 'error', 'info', 'debug'] }],

      // TypeScript-specific rules
      '@typescript-eslint/no-unused-vars': ['error', { 
        argsIgnorePattern: '^_', 
        varsIgnorePattern: '^_' 
      }],
      '@typescript-eslint/explicit-function-return-type': ['error', {
        allowExpressions: true,
        allowHigherOrderFunctions: true,
        allowTypedFunctionExpressions: true,
      }],
      '@typescript-eslint/consistent-type-imports': ['error', {
        prefer: 'type-imports',
        disallowTypeAnnotations: true,
      }],
      '@typescript-eslint/consistent-type-definitions': ['error', 'interface'],
      '@typescript-eslint/prefer-nullish-coalescing': 'error',
      '@typescript-eslint/prefer-optional-chain': 'error',
      '@typescript-eslint/prefer-ts-expect-error': 'error',
      '@typescript-eslint/no-unnecessary-condition': 'error',
      '@typescript-eslint/ban-ts-comment': ['error', {
        'ts-expect-error': 'allow-with-description',
        minimumDescriptionLength: 5,
      }],
      
      // For MCPify, which needs to proxy dynamic content from OpenAPI specs,
      // we need to be more lenient with some type checking rules
      '@typescript-eslint/no-explicit-any': 'warn',   // Allow any for API proxying
      '@typescript-eslint/no-unsafe-assignment': 'off', // Need for dynamic OpenAPI parsing
      '@typescript-eslint/no-unsafe-call': 'off',      // Need for dynamic function calls
      '@typescript-eslint/no-unsafe-member-access': 'off', // Need for dynamic object access
      '@typescript-eslint/no-unsafe-return': 'off',    // Need for proxy returns
      '@typescript-eslint/no-unnecessary-condition': 'warn', // Can be overly strict
      
      // Environment specific rules
      'no-undef': 'off',  // TypeScript already handles this better
      'no-console': ['warn', { allow: ['warn', 'error', 'info', 'debug'] }],
    },
  },
  
  // Ignore patterns for specific files and directories
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      '.vite/**',
      'coverage/**',
      '*.js', 
      '*.mjs',
      '*.cjs',
      'eslint.config.js'
    ],
  },
  
  // Apply Prettier config at the end to override formatting rules
  prettier,
];
