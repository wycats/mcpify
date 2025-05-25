# Custom ESLint Rules for Quick-MCP

This directory contains custom ESLint rules specific to the Quick-MCP project. Both rules are auto-fixable and enforce coding standards that improve code quality and maintainability.

## Rules

### `custom/no-mocks-spies`

**Purpose**: Prevents the use of mocks and spies in test files, encouraging the use of real implementations or dependency injection instead.

**Auto-fixable**: ✅ Yes - Automatically removes mock/spy declarations and calls

**Scope**: Only applies to test files (`.test.ts`, `.spec.ts`, and files in `tests/` directory)

**What it detects**:
- Mock function creation: `jest.fn()`, `vi.mock()`, `sinon.mock()`
- Spy creation: `jest.spyOn()`, `vi.spy()`, `sinon.spy()`
- Stub creation: `jest.stub()`, `vi.stub()`, `sinon.stub()`
- Fake creation: `jest.fake()`, `vi.fake()`, `sinon.fake()`
- Import statements for mocking libraries
- Variable assignments using mock functions

**Examples**:

```typescript
// ❌ Will trigger the rule
import { jest } from '@jest/globals';
const mockFn = jest.fn();
const spy = jest.spyOn(console, 'log');

// ✅ Preferred approach
import { createTestClient } from '../test/helpers';
const client = createTestClient();
```

**Configuration**:
```javascript
rules: {
  'custom/no-mocks-spies': 'error', // In test files
  'custom/no-mocks-spies': 'off',   // In demo package (allows mocks)
}
```

### `custom/require-ts-extensions`

**Purpose**: Requires `.ts` extensions when importing TypeScript files that exist on disk, improving module resolution clarity and consistency.

**Auto-fixable**: ✅ Yes - Automatically adds `.ts` extensions to imports

**Scope**: Applies to all TypeScript files

**What it detects**:
- Import statements without `.ts` extension where a `.ts` file exists
- Export statements without `.ts` extension where a `.ts` file exists
- Only checks relative imports (starting with `./` or `../`)

**Examples**:

```typescript
// ❌ Will trigger the rule (if ./utils.ts exists)
import { helper } from './utils';
export { validator } from '../common/validator';

// ✅ Correctly includes .ts extension
import { helper } from './utils.ts';
export { validator } from '../common/validator.ts';

// ✅ Non-relative imports are ignored
import { express } from 'express';
import { LogLayer } from 'loglayer';
```

**Configuration**:
```javascript
rules: {
  'custom/require-ts-extensions': 'error', // Enforced everywhere
}
```

## Installation and Usage

The rules are automatically loaded in the ESLint configuration:

```javascript
// eslint.config.js
import customRules from './eslint-rules/index.js';

export default [
  {
    plugins: {
      'custom': customRules,
    },
    rules: {
      'custom/no-mocks-spies': 'error',
      'custom/require-ts-extensions': 'error',
    },
  },
];
```

## Why These Rules?

### No Mocks/Spies Rationale

1. **Real-world Testing**: Using real implementations tests the actual behavior of your code
2. **Better Architecture**: Forces you to design testable code with proper dependency injection
3. **Maintainability**: Tests are less brittle when they don't rely on mock implementations
4. **Debugging**: Easier to debug issues when using real implementations
5. **Integration Confidence**: Better confidence that components work together correctly

### TypeScript Extensions Rationale

1. **Explicit Module Resolution**: Makes it clear which files are being imported
2. **Tool Compatibility**: Some tools require explicit extensions for proper resolution
3. **Future-proofing**: Aligns with ES modules standard and Node.js best practices
4. **Consistency**: Enforces consistent import patterns across the codebase
5. **IDE Support**: Better autocomplete and navigation in editors

## Auto-fix Behavior

Both rules support ESLint's `--fix` option:

```bash
# Auto-fix issues
pnpm lint --fix

# Check for issues without fixing
pnpm lint
```

### Auto-fix Examples

**Before auto-fix**:
```typescript
// test.ts
import { jest } from '@jest/globals';
import { helper } from './utils'; // utils.ts exists

const mockFn = jest.fn();
const spy = jest.spyOn(console, 'log');

describe('test', () => {
  it('works', () => {
    mockFn();
    spy();
    expect(true).toBe(true);
  });
});
```

**After auto-fix**:
```typescript
// test.ts
import { helper } from './utils.ts';

describe('test', () => {
  it('works', () => {
    expect(true).toBe(true);
  });
});
```

## Disabling Rules

If you need to disable these rules for specific cases:

```typescript
// Disable for a single line
const mockFn = jest.fn(); // eslint-disable-line custom/no-mocks-spies

// Disable for a block
/* eslint-disable custom/no-mocks-spies */
const mockFn = jest.fn();
const spy = jest.spyOn(console, 'log');
/* eslint-enable custom/no-mocks-spies */

// Disable for entire file
/* eslint-disable custom/no-mocks-spies */
```

## Integration with Existing Tools

These rules work seamlessly with:
- **TypeScript**: Respects TypeScript module resolution
- **Vitest**: Encourages real implementations over mocks
- **Import sorting**: Works with `eslint-plugin-import` rules
- **Prettier**: Compatible with code formatting

## Contributing

When adding new patterns to detect:

1. Add test cases in the rule definition
2. Ensure auto-fix behavior is safe and predictable
3. Update this documentation
4. Test with real codebase examples

## Troubleshooting

**Rule not triggering**: Ensure the file is included in ESLint's scope and the plugin is properly loaded.

**Auto-fix not working**: Check that the file is not ignored and that you're using the `--fix` flag.

**False positives**: Use ESLint disable comments for legitimate exceptions.