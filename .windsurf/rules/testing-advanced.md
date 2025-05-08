---
trigger: manual
---

# Advanced Testing Guidelines

This document covers advanced testing approaches for the MCP-ify project. 
For basic test structure and abstractions, see [testing-basics.md](testing-basics.md).

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

## Code Quality in Tests

**Tests must adhere to the same code quality standards as production code.** This includes:

1. **Strict Type Safety**

   - No use of the generic `Function` type; always use specific function signatures
   - No `any` type usage, even in test implementations
   - Proper typing for all test fixtures and mock implementations
   - Type assertions (casting) should be avoided or carefully justified

2. **Lint Rule Compliance**

   - Lint errors are never acceptable in test code
   - No disabled lint rules without explicit justification in comments
   - All tests must pass the project's linting configuration
   - Same code style and formatting standards apply to tests and production code

3. **Clean Test Implementations**

   ```typescript
   // ❌ Avoid: Using 'any' or 'Function' types in test code
   const testServer = {
     resource: function(id: string, uri: any, callback: Function) { /* ... */ }
   };

   // ✅ Better: Properly typed test implementations
   type ResourceCallback = (uri: string, args: Record<string, unknown>) => Promise<ResourceResult>;

   const testServer = {
     resource: function(id: string, uri: string, callback: ResourceCallback) { /* ... */ }
   };
   ```
