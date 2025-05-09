---
trigger: always_on
---

# Testing Basics

This document outlines the core testing principles and patterns for the MCP-ify project.

## Test Structure

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

## Test Abstractions

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

### Key testing abstractions

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

> See [testing-advanced.md](testing-advanced.md) for information on dependency injection patterns and code quality requirements.
