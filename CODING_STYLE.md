# Coding Style and Philosophy Guide

This document outlines the coding standards, architectural patterns, and development philosophy that can be adopted across TypeScript/Node.js projects for maintainable, high-quality codebases.

## Core Development Philosophy

### **Understand First, Suggest Later**
- Explore existing patterns before proposing new solutions
- Match established conventions within the codebase
- Ask clarifying questions when requirements are unclear
- Prioritize consistency over personal preferences

### **Quality Over Speed**
- Code quality standards apply equally to production and test code
- Prefer explicit, verbose code over clever shortcuts
- Invest time in proper abstractions rather than quick fixes
- Technical debt should be addressed proactively, not accumulated

## TypeScript Standards

### **Type Safety**
```typescript
// ✅ Preferred: Strict typing with explicit interfaces
interface UserConfig {
  readonly id: string;
  readonly name: string;
  readonly isActive: boolean;
}

// ❌ Avoid: any types and implicit typing
function processUser(user: any) { /* ... */ }
```

### **Class Design**
```typescript
// ✅ Preferred: Private fields with # syntax
class ApiClient {
  readonly #baseUrl: string;
  readonly #headers: Record<string, string>;
  
  constructor(config: ClientConfig) {
    this.#baseUrl = config.baseUrl;
    this.#headers = { ...config.headers };
  }
  
  // Explicit return types
  async fetchData(path: string): Promise<ApiResponse> {
    // Implementation
  }
}

// ❌ Avoid: Public fields and implicit returns
class BadClient {
  public baseUrl: string;
  
  fetchData(path) { /* ... */ }
}
```

### **Function Signatures**
```typescript
// ✅ Preferred: Explicit return types and parameter typing
function transformData(
  input: RawApiData,
  options: TransformOptions
): Promise<ProcessedData> {
  // Implementation
}

// ❌ Avoid: Implicit types
function transform(input, options) {
  // Implementation
}
```

### **Interface Design**
```typescript
// ✅ Preferred: Readonly properties, explicit optionals
interface Configuration {
  readonly apiKey: string;
  readonly baseUrl: string;
  readonly timeout?: number;
  readonly retries?: number;
}

// ❌ Avoid: Mutable interfaces, unclear optionals
interface BadConfig {
  apiKey: string;
  baseUrl: string;
  timeout: number | undefined;
}
```

## Testing Philosophy

### **No Mocks Policy**
```typescript
// ✅ Preferred: Factory functions and real implementations
function createTestClient(overrides: Partial<ClientConfig> = {}): ApiClient {
  return new ApiClient({
    baseUrl: 'https://test.example.com',
    apiKey: 'test-key',
    ...overrides,
  });
}

describe('ApiClient', () => {
  it('should fetch user data', async () => {
    const client = createTestClient();
    const result = await client.fetchUser('123');
    expect(result).toMatchObject({ id: '123' });
  });
});

// ❌ Avoid: Mocking dependencies
const mockFetch = vi.fn();
vi.mock('fetch', () => mockFetch);
```

### **Test Organization**
- **Co-located tests**: Place `*.test.ts` files adjacent to source files
- **Factory functions**: Create reusable test data generators
- **High-level assertions**: Test behavior, not implementation details
- **Arrange-Act-Assert pattern**: Clear test structure

```typescript
// ✅ Test structure
describe('UserService', () => {
  it('should create user with valid data', async () => {
    // Arrange
    const service = createUserService();
    const userData = createValidUserData();
    
    // Act
    const result = await service.createUser(userData);
    
    // Assert
    expect(result.success).toBe(true);
    expect(result.user).toMatchObject(userData);
  });
});
```

### **Custom Test Matchers**
```typescript
// Create domain-specific matchers for better readability
expect(response).toBeSuccessfulApiResponse();
expect(result).toMatchValidationSchema(userSchema);
```

## Code Quality Standards

### **Immutability Patterns**
```typescript
// ✅ Preferred: Immutable operations
function updateUserStatus(user: User, status: UserStatus): User {
  return { ...user, status, updatedAt: new Date() };
}

// ❌ Avoid: Mutation
function updateUserStatus(user: User, status: UserStatus): void {
  user.status = status;
  user.updatedAt = new Date();
}
```

### **Error Handling**
```typescript
// ✅ Preferred: Explicit error types and handling
class ApiError extends Error {
  readonly statusCode: number;
  readonly response?: unknown;
  
  constructor(message: string, statusCode: number, response?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.response = response;
  }
}

async function fetchData(url: string): Promise<ApiResponse> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new ApiError('Request failed', response.status, await response.json());
    }
    return await response.json();
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError('Network error', 0, error);
  }
}
```

### **Dependency Management**
- Only use existing project dependencies unless explicitly approved
- Prefer standard library solutions over external packages
- Document the rationale for new dependencies
- Regularly audit and update dependencies

## Architecture Patterns

### **Factory Pattern for Configuration**
```typescript
interface ServiceOptions {
  readonly apiKey: string;
  readonly baseUrl?: string;
  readonly timeout?: number;
}

class ServiceFactory {
  static create(options: ServiceOptions): ApiService {
    return new ApiService({
      baseUrl: 'https://api.example.com',
      timeout: 5000,
      ...options,
    });
  }
  
  static createForTesting(overrides: Partial<ServiceOptions> = {}): ApiService {
    return this.create({
      apiKey: 'test-key',
      baseUrl: 'https://test.example.com',
      ...overrides,
    });
  }
}
```

### **Builder Pattern for Complex Objects**
```typescript
class QueryBuilder {
  readonly #filters: Filter[] = [];
  readonly #sorting: SortOption[] = [];
  
  where(filter: Filter): QueryBuilder {
    return new QueryBuilder([...this.#filters, filter], this.#sorting);
  }
  
  orderBy(sort: SortOption): QueryBuilder {
    return new QueryBuilder(this.#filters, [...this.#sorting, sort]);
  }
  
  build(): Query {
    return {
      filters: [...this.#filters],
      sorting: [...this.#sorting],
    };
  }
}
```

### **Event-Driven Architecture**
```typescript
interface DomainEvent {
  readonly type: string;
  readonly timestamp: Date;
  readonly payload: unknown;
}

class EventEmitter {
  readonly #listeners = new Map<string, Array<(event: DomainEvent) => void>>();
  
  on(eventType: string, handler: (event: DomainEvent) => void): void {
    const handlers = this.#listeners.get(eventType) ?? [];
    this.#listeners.set(eventType, [...handlers, handler]);
  }
  
  emit(event: DomainEvent): void {
    const handlers = this.#listeners.get(event.type) ?? [];
    handlers.forEach(handler => handler(event));
  }
}
```

## Development Workflow

### **Git Conventions**
- **Conventional Commits**: Use standard prefixes (feat, fix, docs, style, refactor, test, chore)
- **Descriptive messages**: Explain the "why" not just the "what"
- **Small, focused commits**: Each commit should represent a single logical change

```bash
# Good commit messages
feat(auth): add JWT token validation middleware
fix(api): handle network timeout errors gracefully
test(user): add integration tests for user creation
```

### **Code Review Standards**
- **Understand the context**: Review for correctness and maintainability
- **Check for patterns**: Ensure consistency with existing codebase
- **Verify tests**: Confirm adequate test coverage and quality
- **Security considerations**: Look for potential vulnerabilities

### **Scope Management**
- Focus exclusively on defined tasks
- Request approval before expanding scope
- Document architectural decisions
- Communicate changes that affect other developers

## Tooling and Environment

### **Package Management**
- Use workspace package manager (`pnpm`, `yarn workspaces`, etc.)
- Run tools through package manager, not global installations
- Pin dependency versions in production
- Separate dev and production dependencies clearly

### **Code Quality Tools**
```json
{
  "scripts": {
    "lint": "eslint .",
    "lint:fix": "eslint . --fix", 
    "lint:strict": "eslint . --max-warnings 0",
    "type-check": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage"
  }
}
```

### **TypeScript Configuration**
```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noPropertyAccessFromIndexSignature": true,
    "exactOptionalPropertyTypes": true
  }
}
```

## Performance and Optimization

### **Memory Management**
```typescript
// ✅ Preferred: Avoid memory leaks
class EventListener {
  readonly #cleanup: Array<() => void> = [];
  
  addListener(element: Element, event: string, handler: EventListener): void {
    element.addEventListener(event, handler);
    this.#cleanup.push(() => element.removeEventListener(event, handler));
  }
  
  destroy(): void {
    this.#cleanup.forEach(fn => fn());
  }
}
```

### **Async Patterns**
```typescript
// ✅ Preferred: Proper async/await usage
async function processItems(items: Item[]): Promise<ProcessedItem[]> {
  const results = await Promise.allSettled(
    items.map(item => processItem(item))
  );
  
  return results
    .filter((result): result is PromiseFulfilledResult<ProcessedItem> => 
      result.status === 'fulfilled'
    )
    .map(result => result.value);
}

// ❌ Avoid: Sequential processing of parallel operations
async function slowProcessItems(items: Item[]): Promise<ProcessedItem[]> {
  const results = [];
  for (const item of items) {
    results.push(await processItem(item));
  }
  return results;
}
```

## Documentation Standards

### **Code Documentation**
```typescript
/**
 * Processes user data according to business rules.
 * 
 * @param userData - Raw user input data
 * @param options - Processing configuration options
 * @returns Validated and transformed user object
 * @throws {ValidationError} When user data is invalid
 * @throws {ProcessingError} When transformation fails
 * 
 * @example
 * ```typescript
 * const user = await processUserData(
 *   { name: 'John', email: 'john@example.com' },
 *   { validateEmail: true }
 * );
 * ```
 */
async function processUserData(
  userData: RawUserData,
  options: ProcessingOptions
): Promise<User> {
  // Implementation
}
```

### **API Documentation**
- Document public interfaces thoroughly
- Include usage examples for complex APIs
- Explain error conditions and handling
- Maintain architectural decision records (ADRs)

## Security Practices

### **Input Validation**
```typescript
// ✅ Always validate and sanitize inputs
function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email) && email.length <= 254;
}

function sanitizeUserInput(input: string): string {
  return input
    .trim()
    .replace(/[<>\"'&]/g, match => {
      const escapeMap: Record<string, string> = {
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
        '&': '&amp;',
      };
      return escapeMap[match] || match;
    });
}
```

### **Secret Management**
- Never commit secrets to version control
- Use environment variables for configuration
- Implement proper secret rotation
- Use secure defaults for all configurations

## Summary

This coding philosophy emphasizes:

1. **Type safety and explicitness** over shortcuts
2. **Real implementations** over mocks in testing
3. **Immutability and functional patterns** for predictability
4. **Comprehensive documentation** for maintainability
5. **Security by default** in all implementations
6. **Consistency and conventions** across the codebase

Following these principles results in codebases that are easier to understand, maintain, debug, and extend over time.