---
trigger: manual
---

# Testing Guidelines

This document outlines the testing principles and patterns for the MCP-ify project.

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

## Dependency Injection Over Mocking

The project favors dependency injection with test-friendly interfaces over traditional mocking:

```typescript
// ❌ Avoid: Using mocks that simulate behavior
it('processes data correctly', async () => {
  // Setting up mocks with implementation details
  jest.mock('../api-client');
  const mockFetch = jest.fn().mockResolvedValue({
    json: () => Promise.resolve({ data: 'test-data' }),
  });
  apiClient.fetch = mockFetch;

  const result = await processData('input');

  expect(mockFetch).toHaveBeenCalledWith('/endpoint', { data: 'input' });
  expect(result).toEqual('test-data');
});

// ✅ Better: Using dependency injection with test-friendly interfaces
it('processes data correctly', async () => {
  // Simple test implementation of the dependency
  const testApiClient = {
    fetch: async (url: string, data: unknown) => {
      // Verification happens in the test implementation
      expect(url).toBe('/endpoint');
      expect(data).toEqual({ data: 'input' });
      // Return test data directly
      return { data: 'test-data' };
    },
  };

  // Inject the test implementation
  const result = await processData('input', testApiClient);

  expect(result).toEqual('test-data');
});
```

### Key dependency injection patterns

1. **Design for testability**

   ```typescript
   // ❌ Avoid: Direct dependency on implementation
   async function processData(input: string) {
     const response = await apiClient.fetch('/endpoint', { data: input });
     return response.data;
   }

   // ✅ Better: Accept dependencies as parameters
   async function processData(input: string, client: ApiClient = defaultApiClient) {
     const response = await client.fetch('/endpoint', { data: input });
     return response.data;
   }
   ```

2. **Class-based injection**

   ```typescript
   // ✅ Constructor injection for classes
   class DataProcessor {
     static create(client: ApiClient = defaultApiClient): DataProcessor {
       return new DataProcessor(client);
     }

     private constructor(client: ApiClient) {}

     async process(input: string) {
       const response = await this.client.fetch('/endpoint', { data: input });
       return response.data;
     }
   }
   ```

3. **Test-friendly interfaces**

   - Focus on the behavior needed for testing, not implementation details
   - Create simple implementations that return predetermined test data
   - Include validation logic in the test implementation when needed
   - Consider creating reusable test implementations for common dependencies

## Test Organization

The project uses nested `describe` blocks to organize tests logically:

```typescript
describe('functionName', () => {
  describe('Basic functionality', () => {
    it('handles the simplest case', () => { /* ... */ });
    it('validates required inputs', () => { /* ... */ });
  });

  describe('Advanced behavior', () => {
    it('handles complex nested objects', () => { /* ... */ });
    it('processes special cases', () => { /* ... */ });
  });

  describe('Edge cases', () => {
    it('handles malformed inputs', () => { /* ... */ });
    it('degrades gracefully with unexpected values', () => { /* ... */ });
  });
});
```

### Benefits of nested describe blocks

1. **Logical grouping** - Related tests are grouped together, improving readability
2. **Better test output** - Test reports show a hierarchical structure of functionality
3. **Reduced duplication** - Common setup can be shared within a describe block
4. **Progressive complexity** - Tests can be organized from basic to advanced scenarios
5. **Easier maintenance** - Finding and updating related tests becomes simpler

### When to use nested describe blocks

- When testing a single component with multiple behavioral aspects
- For complex functions with various input types or edge cases
- When tests naturally fall into distinct categories
- To document expected behavior systematically
