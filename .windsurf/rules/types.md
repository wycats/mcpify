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

## Linting Directives

This codebase maintains high code quality standards by avoiding directive-based suppression of type checking and linting rules:

```typescript
// ❌ NEVER use: Suppressing ESLint rules
// eslint-disable-next-line no-unused-vars
const unusedVariable = 'something';

// ✅ Correct: Fix the underlying issue instead
const usedVariable = 'something';
console.log(usedVariable);

// ❌ NEVER use: Suppressing TypeScript errors without explicit instruction
// @ts-expect-error this is convenient but dangerous
const result = someFunction(invalidArgument);

// ✅ Correct: Properly type the code or refactor to avoid the error
const result = someFunction(validArgument);
```

Strict adherence to these principles:

- NEVER use `eslint-disable` directives (including line, next-line, or block variants) unless explicitly instructed
- NEVER use `@ts-expect-error` or `@ts-ignore` directives unless explicitly instructed
- If you encounter a situation where such directives seem necessary, propose alternative solutions that maintain type safety and code quality instead
- When instructed to use these directives, always include a detailed comment explaining exactly why the directive is necessary

## Style Preferences

### Private Members

- Prefer using the native TypeScript `#` syntax for private members instead of the `private` keyword
- Do not add `@private` JSDoc annotations on members already marked with `#` as this is redundant
- Example: `#privateField` instead of `private privateField`

### Field Modifiers

- Prefer `readonly` field declarations when appropriate
- Combine with private syntax when needed: `readonly #field`
- Avoid using `private`, `public`, or `protected` keywords where possible
- Default to implicit public access without annotation

### JSDoc Style

- Use JSDoc comments for public methods and properties
- Include parameter descriptions and return value descriptions
- Include examples for complex methods
- Omit redundant information that is already evident from TypeScript types
- Skip access modifiers in JSDoc that are already indicated by TypeScript syntax
- Carefully document the "why".
- Document the _behavior_ of the API, not internal implementation details.

### Type Declarations

- Prefer `interface` for object type declarations
- Use `Record<K, V>` for dictionary-like structures
- Use `type` for unions, intersections, and aliases of primitive types

These guidelines promote concise, idiomatic TypeScript that leverages the language's built-in features for access control and immutability without redundant annotations.
