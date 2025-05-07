# Design Patterns & Coding Conventions

This document outlines the common design patterns and coding conventions used in the MCP-ify project.

## TypeScript Patterns

### Strong Typing

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

### Strict TypeScript Linting

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

### Factory Functions

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

### Immutability

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

## Testing Patterns

### Test Structure

Tests follow this general structure:

```typescript
it('descriptive test name', async () => {
  // 1. Arrange - set up test data and conditions
  const input = {
    /* ... */
  };

  // 2. Act - perform the action being tested
  const result = someFunction(input);

  // 3. Assert - verify the expected outcome
  expect(result).toMatchObject({
    /* expected properties */
  });
});
```

### Test Abstractions

The project uses high-level testing abstractions to make tests clearer and more maintainable:

```typescript
// ❌ Avoid: Many granular assertions that test implementation details
it('handles path parameters correctly', async () => {
  const result = buildRequest(/* params */);

  expect(result.url).toBe('/test/42');
  expect(result.method).toBe('GET');
  expect(result.headers.get('content-type')).toBe('application/json');
  expect(JSON.parse(await result.text())).toEqual({
    /* expected body */
  });
  // Many more individual assertions...
});

// ✅ Better: Using test factory functions and custom matchers
it('handles path parameters correctly', async () => {
  const { build } = createOp('get', { id: 'path' });

  const request = build({ id: '42' });

  await expect(request).toMatchRequest({
    url: '/test/42',
    method: 'GET',
  });
});
```

#### Key testing abstractions

1. **Factory Functions**

   - createOp() creates a complete test environment with minimal parameters
   - Encapsulates complex setup so individual tests remain focused
   - Returns only what's needed to run the test

2. **Custom Matchers**

   - toMatchRequest() verifies multiple properties in a single assertion
   - Makes expected behavior explicit in a declarative way
   - Provides better error messages when tests fail

3. **Test Data Builders**

   - Tests use schema definitions (e.g., with Zod) to generate valid test data
   - Consistent approach for complex object creation
   - Decouples test data from test assertions

4. **Focused Test Scope**

   - Each test verifies one specific behavior
   - Tests use descriptive names that serve as documentation
   - Test setup is minimal and directly related to the behavior being tested

### Mock Patterns

For external dependencies, use consistent mocking patterns:

```typescript
// Mock HTTP requests
const mockRequest = {
  url: '/test/42',
  method: 'POST',
  // ...other properties
};

// Verify request details
await expect(request).toMatchRequest({
  url: '/test/42',
  method: 'POST',
  // ...expected properties
});
```

## Error Handling Patterns

```typescript
// Error type checking with instanceof
try {
  // Attempt operation that might fail
  const result = parseOpenAPISpec(specData);
  return result;
} catch (error) {
  // Type checking error objects
  const errorMessage = error instanceof Error ? error.message : String(error);
  log.error(`Failed to parse OpenAPI spec: ${errorMessage}`);
  throw error; // Re-throw to propagate up
}

// Server startup error handling with detailed logging
try {
  const server = startServer(options);

  // Register error handlers on services
  server.on('error', (err: Error) => {
    log.error(`HTTP server error: ${err.message}`);
  });
} catch (err) {
  // Extract stack traces when available
  const errorMessage = err instanceof Error ? err.stack : String(err);
  log.error(`Failed to start HTTP server: ${errorMessage}`);
  throw err;
}
```

Key error handling patterns:

- Using type checking with `instanceof Error` to handle different error types
- Converting errors to meaningful strings with appropriate context
- Leveraging logging with appropriate error levels
- Propagating errors up the call stack when needed
- Providing detailed context in error messages
- Using error handlers for asynchronous operations

## Mapping and Transformation Patterns

The project often converts between different data formats:

```typescript
// Transform one data structure to another
function mapToMcpParameter(openApiParam: OpenApiParameter): McpParameter {
  return {
    name: openApiParam.name,
    type: mapParamType(openApiParam.in),
    required: openApiParam.required ?? false,
    // Other mappings
  };
}

// Mapping collections
function mapParameters(params: OpenApiParameter[]): McpParameter[] {
  return params.map(mapToMcpParameter);
}
```

## Logging Patterns

The project uses dependency injection for logging via an `app` object:

```typescript
// Central logger definition
import { LogLayer, ConsoleTransport } from 'loglayer';

export const log = new LogLayer({
  transport: new ConsoleTransport({ logger: console }),
});

// Function using injected logger
function processData(app: { log: LogLayer }, data: unknown): Result {
  app.log.debug('Processing data', { type: typeof data });
  // Implementation...
  return result;
}

// Class using injected logger
class ApiClient {
  #app: { log: LogLayer };

  constructor(app: { log: LogLayer }) {
    this.#app = app;
  }

  fetch(): void {
    this.#app.log.info('Fetching data');
    // Implementation...
  }
}

// Log levels
log.debug('Detailed debugging information');
log.info('General operational information');
log.warn('Warning condition');
log.error('Error condition');
```

Key logging patterns:

- Logger is consistently injected via an `app` object
- Components receive logger through parameters or constructor
- Strong typing with `LogLayer` interface
- Structured logging with context objects
- Testability through dependency injection

## Configuration Patterns

```typescript
// Default configuration with override capability
const DEFAULT_CONFIG = {
  timeout: 5000,
  retries: 3,
  // Other defaults
};

function configure(userConfig: Partial<Config>): Config {
  return { ...DEFAULT_CONFIG, ...userConfig };
}
```

Follow these patterns when working with the codebase to maintain consistency and leverage existing conventions.
