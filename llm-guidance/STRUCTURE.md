# Project Structure

This document outlines the organization of the MCP-ify codebase to help you navigate and understand its components.

## Monorepo Structure

MCP-ify uses a monorepo structure with pnpm workspaces:

```
mcpify/
├── llm-guidance/       # AI assistant guidance files
├── packages/           # Main code packages
│   ├── core/           # Core MCP-ify functionality
│   └── demo/           # Demo implementation
├── package.json        # Root package configuration
└── tsconfig.json       # TypeScript configuration
```

## Core Package

The `packages/core` directory contains the main functionality for converting OpenAPI specifications to MCP tools:

```
packages/core/
├── src/
│   ├── parameter-mapper.ts    # Handles parameter mapping between OpenAPI and MCP
│   ├── parameter-mapper.test.ts  # Tests for parameter mapper
│   ├── log.ts                 # Logging utilities
│   └── main.ts                # Main entry point
├── package.json
└── tsconfig.json
```

Key components:

- **Parameter Mapper**: Converts OpenAPI parameters to MCP-compatible format
- **Logger**: Provides logging functionality throughout the codebase

## Demo Package

The `packages/demo` directory contains a demonstration implementation:

```
packages/demo/
├── src/
│   └── ... (Demo implementation files)
├── package.json
└── tsconfig.json
```

This package showcases how to use the core MCPify library with real-world examples.

## Configuration Files

### Root Configuration

- **package.json**: Contains workspace configuration, shared dev dependencies, and root scripts
- **tsconfig.json**: Base TypeScript configuration inherited by packages

### Package Configuration

Each package has its own:

- **package.json**: Package-specific dependencies and scripts
- **tsconfig.json**: Package-specific TypeScript configuration

## Build and Test Structure

- Tests are co-located with their implementation files with a `.test.ts` suffix
- Build outputs and artifacts are excluded from version control
- CI/CD workflows will be found in a `.github` directory in the future.

## Import Conventions

Follow these import patterns when working with the codebase:

- Use relative imports within a package: `import { thing } from '../util.ts'`. Include the file extension.
- Use package imports between packages: `import { thing } from '@mcpify/core'`
- Organize imports logically (built-ins, then external, then internal)

## Development Workflow

### TypeScript Execution

The project uses Node.js's experimental `--experimental-strip-types` flag to run TypeScript files directly:

```
"dev": "node --experimental-strip-types packages/core/src/main.ts"
```

Key implications of this approach:

- TypeScript files run directly without a separate compilation step
- Type annotations are stripped at runtime by Node.js
- No build artifacts (`.js` files) are needed for development
- Type checking must be done separately (via IDE or `tsc --noEmit`)
- Full paths with `.ts` extension are required in import statements
- Enables faster development iteration with reduced build overhead
- Production builds still use traditional TypeScript compilation

When working with the codebase, be aware that:

- Always include `.ts` extensions in import paths
- The project structure assumes direct TypeScript execution
- Changes take effect immediately without compilation

### Testing with Vitest

The project uses Vitest for testing, configured at the root level:

```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: [`${root}/packages/core/src/test/setup-request-matcher.ts`],
    coverage: {
      provider: 'istanbul',
      reporter: ['text', 'json', 'html'],
    },
  },
});
```

Key testing features:

- Tests are co-located with implementation files (`*.test.ts` naming convention)
- Custom matchers defined in `setup-request-matcher.ts` for testing HTTP requests
- Globals mode enabled (no need to import `expect`, `describe`, etc.)
- Coverage reporting available via Istanbul
- Node.js environment for all tests

Run tests with:

```bash
pnpm test       # Run all tests
pnpm test:watch # Run tests in watch mode
pnpm test:ui    # Open Vitest UI (using @vitest/ui package)
```
