---
trigger: always_on
---

# TypeScript Patterns

## Strong Typing

```typescript
// Prefer explicit interfaces over type inference
interface ApiParameter {
  name: string;
  in: 'path' | 'query' | 'header' | 'body';
  required: boolean;
  schema?: Schema;
}

// Use discriminated unions for type safety
type Parameter =
  | { type: 'path'; name: string; value: string }
  | { type: 'query'; name: string; value: string | string[] }
  | { type: 'body'; content: unknown };
```

## Strict TypeScript Linting

This project uses very strong TypeScript linting to enforce type safety and code quality. The core package uses stricter rules than the demo package:

```typescript
// ❌ Error: Explicit 'any' is prohibited in core package
function processData(data: any): void {}

// ✅ Correct: Use specific types
function processData(data: ApiParameter): void {}

// ❌ Error: Missing explicit return type
function calculate(a, b) {
  return a + b;
}

// ✅ Correct: Include explicit return type
function calculate(a: number, b: number): number {
  return a + b;
}

// ❌ Error: Using '==' instead of '==='
if (value == null) {
}

// ✅ Correct: Use strict equality
if (value === null) {
}

// ❌ Error: Unsafe type assertion
const value = data as any;

// ✅ Correct: Use ts-expect-error with explanation when needed
// @ts-expect-error data from external API needs type refinement
const value = data;
```

Key linting rules enforced:

- Strict TypeScript configuration with strict-type-checked ruleset
- No usage of any type (error in core, warning in demo)
- Explicit function return types required
- Consistent type imports using import type
- Nullish coalescing and optional chaining preferred
- No unnecessary conditions or type assertions
- Enforced comment descriptions for any ts-expect-error pragmas

## Factory Functions

The codebase uses factory functions to create objects with specific behaviors:

```typescript
// Example pattern
function createOp(method: string, parameters: Record<string, string>) {
  // Implementation details
  return {
    build: () => {
      // Return built operation
    },
  };
}
```

## Immutability

Prefer immutable data structures and pure functions:

```typescript
// Good: Creates a new object
function updateConfig(config: Config, updates: Partial<Config>): Config {
  return { ...config, ...updates };
}

// Avoid: Mutating arguments
function updateConfig(config: Config, updates: Partial<Config>): void {
  Object.assign(config, updates); // Mutation!
}
```
