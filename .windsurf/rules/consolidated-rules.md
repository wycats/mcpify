---
trigger: always_on
---

# MCPify AI Assistant Rules

## Core Philosophy
**Understand first, suggest later.** Explore existing patterns before offering solutions. Match established conventions and ask clarifying questions when requirements are unclear.

## Interaction Guidelines

### Communication Style
- **Clarity & Brevity**: Use bullet points for complex explanations, provide context for code snippets
- **Scope Management**: Focus exclusively on defined tasks. Request permission before expanding scope or adding features
- **Dependency Management**: Use only existing packages. Request permission before adding new dependencies
- **Problem Resolution**: Explain errors simply first, propose solutions within existing architecture

### Approval Required Before
- Adding packages/dependencies
- Expanding task scope  
- Making architectural changes
- Implementing alternative approaches

## Development Standards

### TypeScript Patterns
- **Strong Typing**: Explicit interfaces over inference, discriminated unions for type safety
- **Strict Linting**: No `any` type, explicit return types, consistent imports, no linting directive suppression
- **Style**: Use `#private` syntax, `readonly` fields, `interface` for objects, `type` for unions
- **JSDoc**: Document behavior and "why", include examples for complex methods

### Testing Approach
- **No Mocks Policy**: Use factory functions and real implementations with controlled inputs
- **High-Level Abstractions**: Custom matchers (toMatchRequest), test builders, focused scope
- **Quality Standards**: Tests follow same code quality as production (strict typing, lint compliance)
- **Structure**: Arrange-Act-Assert pattern, co-located with implementation files

### Code Practices
- **Immutability**: Pure functions, avoid mutation
- **Factory Functions**: Create objects with specific behaviors
- **Security**: Highlight issues, never expose secrets
- **Performance**: Consider implications, present tradeoffs

## Project Structure
**Monorepo**: pnpm workspaces with packages/core (main functionality) and packages/demo
**TypeScript Execution**: Direct `.ts` execution with `--experimental-strip-types`
**Import Conventions**: Include `.ts` extensions, relative imports within packages

## Git Workflow
- **Commits**: Use `git commit -v` for change review, follow Conventional Commits format
- **Types**: feat, fix, docs, style, refactor, test, chore with optional scope

## Testing Configuration
- **Vitest**: Globals enabled, custom matchers in setup files
- **Coverage**: Istanbul provider with text/json/html reporters
- **Commands**: `pnpm test`, `pnpm test:watch`, `pnpm test:ui`

## CI/CD
- **Workflows**: PR validation (lint/test/build), release planning, publishing
- **Quality Gates**: All checks must pass before merge
- **Coverage**: Reported to Codecov via Istanbul

## Key Commands
- Build: `pnpm build`, `pnpm dev`, `pnpm start:core`
- Quality: `pnpm lint`, `pnpm lint:fix`, `pnpm lint:strict`  
- Testing: `pnpm test`, `pnpm test:coverage`
- Demo: `pnpm dev:demo`, `pnpm mcpify`

## Architecture Notes
- **Dynamic Proxy**: Runtime OpenAPI→MCP conversion, no static generation
- **Operation-Centric**: McpifyOperation class wraps OpenAPI operations
- **Resource vs Tool**: GET operations with path-only params = resources, others = tools
- **Pipeline**: OpenAPI schemas → JSON Schema → Zod validation