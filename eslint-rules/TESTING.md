# Testing ESLint Rules Without Breaking Repo Lint

This document outlines the ideal ways to test custom ESLint rules without affecting the main repository's linting process.

## 🎯 The Problem

When writing custom ESLint rules, you need to test that they:
1. **Detect violations correctly** - Trigger on the intended code patterns
2. **Auto-fix properly** - Apply correct transformations when using `--fix`
3. **Don't break existing code** - Work alongside other ESLint rules
4. **Handle edge cases** - Work with various code patterns and file structures

However, you can't just add files with intentional violations to your repo because they would break the main lint process.

## ✅ Solution 1: ESLint RuleTester (Recommended)

The **official and best approach** is using ESLint's built-in `RuleTester` class:

### Advantages:
- ✅ **Official ESLint testing framework**
- ✅ **Completely isolated** - doesn't affect repo linting
- ✅ **Comprehensive testing** - tests both detection and auto-fix
- ✅ **Fast execution** - runs in memory without file I/O
- ✅ **CI/CD friendly** - integrates with existing test suites

### Example Implementation:

```javascript
// eslint-rules/index.test.js
import { RuleTester } from 'eslint';
import customRules from './index.js';

const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    parser: await import('@typescript-eslint/parser'),
  },
});

describe('Custom ESLint Rules', () => {
  it('no-mocks-spies should detect and fix mocks', () => {
    ruleTester.run('no-mocks-spies', customRules.rules['no-mocks-spies'], {
      valid: [
        {
          code: 'const realImplementation = createClient();',
          filename: 'test.test.ts',
        },
      ],
      invalid: [
        {
          code: 'const mockFn = jest.fn();',
          filename: 'test.test.ts',
          errors: [{ messageId: 'noMocks' }],
          output: '', // Expected output after auto-fix
        },
      ],
    });
  });
});
```

### Running the Tests:
```bash
pnpm vitest eslint-rules/index.test.js
```

## ✅ Solution 2: Temporary Test Directory

Create temporary files outside the main source tree for integration testing:

### Advantages:
- ✅ **Real-world testing** - tests actual file interactions
- ✅ **File system aware** - tests rules that check file existence
- ✅ **Easy to understand** - straightforward test setup
- ✅ **Debugging friendly** - can inspect generated files

### Example Implementation:

```javascript
// eslint-rules/integration.test.js
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { ESLint } from 'eslint';

async function testRulesIntegration() {
  const testDir = './temp-test';
  
  try {
    // Create temp directory outside project scope
    mkdirSync(testDir, { recursive: true });
    
    // Write test files
    writeFileSync(`${testDir}/test.ts`, 'const mock = jest.fn();');
    
    // Test with ESLint
    const eslint = new ESLint({
      overrideConfig: [/* your test config */],
      cwd: testDir,
    });
    
    const results = await eslint.lintFiles(['test.ts']);
    // Assert results...
    
  } finally {
    rmSync(testDir, { recursive: true, force: true });
  }
}
```

## ✅ Solution 3: Ignored Test Files in Repo

Create test files within the repo but exclude them from main linting:

### Advantages:
- ✅ **Version controlled** - test cases are committed
- ✅ **Easy access** - test files alongside rule implementation
- ✅ **Real TypeScript project** - proper project context

### Implementation:

1. **Create test files in dedicated directory:**
```
eslint-rules/
├── test-fixtures/
│   ├── mock-usage.test.ts      # Contains mocks (should trigger rule)
│   ├── missing-extensions.ts   # Missing .ts imports
│   └── valid-code.ts          # Should not trigger rules
├── index.js                   # Rule implementation
└── index.test.js             # RuleTester tests
```

2. **Exclude from main ESLint config:**
```javascript
// eslint.config.js
export default [
  // ... your main config
  {
    ignores: [
      'eslint-rules/test-fixtures/**', // Ignore test fixtures
    ],
  },
];
```

3. **Test with separate ESLint run:**
```bash
# Test rules on fixtures without affecting main lint
npx eslint eslint-rules/test-fixtures/ --config eslint-rules/test.config.js
```

## ✅ Solution 4: ESLint Disable Comments

For small, specific tests, use ESLint disable comments:

```typescript
// This file tests our custom rules
/* eslint-disable custom/no-mocks-spies, custom/require-ts-extensions */

// Test code that would normally violate rules
const mockFn = jest.fn();
import { helper } from './utils'; // Missing .ts extension

/* eslint-enable custom/no-mocks-spies, custom/require-ts-extensions */
```

## 🚀 Our Implementation

We've implemented **multiple testing strategies** for comprehensive coverage:

### 1. RuleTester Unit Tests
- **File**: `eslint-rules/index.test.js`
- **Command**: `pnpm test:eslint-rules:unit`
- **Purpose**: Fast, isolated unit testing of rule logic

### 2. Integration Testing Script
- **File**: `eslint-rules/test-rules.js`
- **Command**: `pnpm test:eslint-rules`
- **Purpose**: Real-world testing with actual files and ESLint CLI

### 3. Simple Validation Script
- **File**: `eslint-rules/simple-test.js`
- **Command**: `node eslint-rules/simple-test.js`
- **Purpose**: Quick verification that rules work in practice

## 📋 Testing Checklist

When testing ESLint rules, verify:

- [ ] **Rule detection works** - Violations are caught correctly
- [ ] **Auto-fix works** - `--fix` applies correct transformations
- [ ] **Valid code passes** - No false positives
- [ ] **Error messages are clear** - Helpful for developers
- [ ] **Performance is acceptable** - Rules don't slow down linting significantly
- [ ] **Integration works** - Rules work with existing ESLint config
- [ ] **Edge cases handled** - Complex code patterns work correctly

## 🎯 Best Practices

1. **Use RuleTester for unit tests** - Fast, reliable, official
2. **Use temporary directories for integration** - Real-world validation
3. **Test both valid and invalid cases** - Ensure no false positives/negatives
4. **Test auto-fix thoroughly** - Verify output is syntactically correct
5. **Include edge cases** - Nested structures, unusual patterns
6. **Mock file system when needed** - For rules that check file existence
7. **Keep tests fast** - Use temporary files, clean up properly
8. **Document test purpose** - Clear comments explaining what's being tested

## 🔧 Available Commands

```bash
# Run unit tests using RuleTester
pnpm test:eslint-rules:unit

# Run integration tests with real files
pnpm test:eslint-rules

# Quick validation test
node eslint-rules/simple-test.js

# Run all tests including ESLint rule tests
pnpm test
```

This comprehensive testing approach ensures our custom ESLint rules work correctly without breaking the main repository's linting process.