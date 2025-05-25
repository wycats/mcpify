# Quick-MCP Integration Tests

This package contains integration tests for the Quick-MCP library that verify the public API functionality.

## Purpose

Unlike unit tests (located in `packages/*/src/**/*.test.ts`), these integration tests:

- Import only from the public API (`@quick-mcp/core`) rather than internal interfaces
- Test end-to-end workflows from input to output
- Verify the behavior of multiple components working together
- Serve as usage examples for consumers of the library

## Running Tests

```bash
# Run integration tests only
pnpm --filter @quick-mcp/tests test

# Run integration tests in watch mode
pnpm --filter @quick-mcp/tests test:watch
```

## Test Organization

Tests are organized by feature area:

- `resource-registration.test.ts` - Tests for proper registration of resources from OpenAPI specs
- (Additional test files will be added here)

## Writing Integration Tests

When writing integration tests:

1. Only import from the public API (`@quick-mcp/core`)
2. Do not access internal implementation details
3. Focus on verifying the end-to-end behavior 
4. Maintain proper test isolation by creating fresh instances for each test
